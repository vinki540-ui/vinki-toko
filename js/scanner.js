/* =========================================================
   VINKI TOKO - js/scanner.js
   Pembaca barcode lewat kamera (offline).
   Dipakai lewat objek global: Scanner
     Scanner.mulai(function(kode){...})                 -> sekali scan, lalu tutup
     Scanner.mulai(function(kode){...}, { terus:true }) -> scan berulang (kasir)
     Scanner.berhenti()
   ========================================================= */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);

  const FORMAT = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

  let stream = null;
  let mesin = null;          // { jenis:'native'|'zxing', ... }
  let berjalan = false;
  let panggil = null;
  let opsi = {};
  let timer = null;
  let kodeTerakhir = '';
  let waktuTerakhir = 0;
  let audioCtx = null;
  let lampuNyala = false;
  let kanvas = null;
  let sedangBaca = false;

  /* ---------- Bunyi & getar ---------- */
  function bip() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        if (!audioCtx) audioCtx = new AC();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.frequency.value = 1100;
        g.gain.value = 0.08;
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        o.stop(audioCtx.currentTime + 0.09);
      }
    } catch (e) { /* abaikan */ }
    try { if (navigator.vibrate) navigator.vibrate(40); } catch (e) { /* abaikan */ }
  }

  function info(teks, merah) {
    const el = $('#scannerInfo');
    if (!el) return;
    el.textContent = teks;
    el.style.color = merah ? 'var(--merah)' : '';
  }

  /* ---------- Siapkan mesin pembaca ---------- */
  function muatSkrip(src) {
    return new Promise((ok, gagal) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => ok();
      s.onerror = () => gagal(new Error('Gagal memuat ' + src));
      document.head.appendChild(s);
    });
  }

  async function siapkanMesin() {
    if (mesin) return mesin;

    // 1) Pembaca bawaan Chrome (Android)
    if ('BarcodeDetector' in window) {
      let fmt = FORMAT.slice();
      try {
        const ada = await window.BarcodeDetector.getSupportedFormats();
        fmt = fmt.filter((f) => ada.indexOf(f) !== -1);
      } catch (e) { /* pakai daftar penuh */ }
      if (fmt.length) {
        mesin = { jenis: 'native', det: new window.BarcodeDetector({ formats: fmt }) };
        return mesin;
      }
    }

    // 2) Cadangan: ZXing (file js/zxing.min.js, opsional)
    if (!window.ZXing) {
      try { await muatSkrip('js/zxing.min.js'); } catch (e) { /* tidak ada */ }
    }
    if (window.ZXing && window.ZXing.MultiFormatReader) {
      const Z = window.ZXing;
      const reader = new Z.MultiFormatReader();
      const hints = new Map();
      hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
        Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8,
        Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E
      ]);
      hints.set(Z.DecodeHintType.TRY_HARDER, true);
      reader.setHints(hints);
      mesin = { jenis: 'zxing', reader: reader };
      return mesin;
    }

    throw new Error('TIDAK_ADA_MESIN');
  }

  /* ---------- Baca satu frame ---------- */
  async function bacaFrame(video) {
    if (mesin.jenis === 'native') {
      const hasil = await mesin.det.detect(video);
      return hasil.length ? String(hasil[0].rawValue || '').trim() : '';
    }

    // ZXing: gambar frame ke kanvas lalu terjemahkan
    if (!kanvas) kanvas = document.createElement('canvas');
    const lebar = Math.min(video.videoWidth, 800);
    const skala = lebar / video.videoWidth;
    kanvas.width = lebar;
    kanvas.height = Math.round(video.videoHeight * skala);
    kanvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, kanvas.width, kanvas.height);
    const Z = window.ZXing;
    try {
      const lum = new Z.HTMLCanvasElementLuminanceSource(kanvas);
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(lum));
      const r = mesin.reader.decode(bmp);
      return r ? String(r.getText() || '').trim() : '';
    } catch (e) {
      return '';
    }
  }

  async function putaran() {
    if (!berjalan) return;
    const video = $('#scannerVideo');

    if (!sedangBaca && video && video.readyState >= 2 && video.videoWidth > 0) {
      sedangBaca = true;
      try {
        const kode = await bacaFrame(video);
        if (kode && berjalan) ditemukan(kode);
      } catch (e) { /* frame gagal, coba lagi */ }
      sedangBaca = false;
    }

    if (berjalan) timer = setTimeout(putaran, mesin && mesin.jenis === 'zxing' ? 220 : 140);
  }

  let calonKode = '';
  let calonJumlah = 0;

  // Cek angka pengaman barcode (EAN-8, UPC-A 12 angka, EAN-13)
  function kodeValid(k) {
    if (!/^\d+$/.test(k)) return false;
    const n = k.length;
    if (n !== 8 && n !== 12 && n !== 13) return false;
    let jml = 0;
    for (let i = 0; i < n - 1; i++) {
      const d = Number(k.charAt(i));
      jml += ((n - 1 - i) % 2 === 1) ? d * 3 : d;
    }
    return ((10 - (jml % 10)) % 10) === Number(k.charAt(n - 1));
  }

  function ditemukan(kode) {
    if (!kodeValid(kode)) return;
    // Harus terbaca sama berulang kali berturut-turut, baru dipercaya
    if (kode !== calonKode) { calonKode = kode; calonJumlah = 1; return; }
    calonJumlah++;
    if (calonJumlah < (kode.length === 13 ? 2 : 4)) return;
    const sekarang = Date.now();
    // Abaikan barcode yang sama kalau terbaca lagi dalam 1,5 detik
    if (kode === kodeTerakhir && sekarang - waktuTerakhir < 1800) { waktuTerakhir = sekarang; return; }
    kodeTerakhir = kode;
    waktuTerakhir = sekarang;

    bip();
    const cb = panggil;

    if (opsi.terus) {
      info('Terbaca: ' + kode);
      if (cb) cb(kode);
    } else {
      App.tutupModal('modalScanner');   // otomatis mematikan kamera
      if (cb) cb(kode);
    }
  }

  /* ---------- Lampu (senter) ---------- */
  function pasangTombolLampu() {
    const lama = $('#btnLampu');
    if (lama) lama.remove();
    lampuNyala = false;
    if (!stream) return;

    const track = stream.getVideoTracks()[0];
    let bisa = false;
    try {
      const kemampuan = track && track.getCapabilities ? track.getCapabilities() : null;
      bisa = !!(kemampuan && kemampuan.torch);
    } catch (e) { bisa = false; }
    if (!bisa) return;

    const tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.id = 'btnLampu';
    tombol.className = 'btn penuh';
    tombol.style.marginTop = '10px';
    tombol.textContent = 'Nyalakan lampu';
    tombol.addEventListener('click', async () => {
      try {
        lampuNyala = !lampuNyala;
        await track.applyConstraints({ advanced: [{ torch: lampuNyala }] });
        tombol.textContent = lampuNyala ? 'Matikan lampu' : 'Nyalakan lampu';
      } catch (e) {
        lampuNyala = false;
        App.toast('Lampu tidak bisa dinyalakan', 'gagal');
      }
    });
    const isi = $('#modalScanner .modal-isi');
    if (isi) isi.appendChild(tombol);
  }

  /* ---------- Mulai & berhenti ---------- */
  async function mulai(callback, op) {
    berhenti();
    panggil = callback;
    opsi = op || {};
    kodeTerakhir = '';
    waktuTerakhir = 0;

    App.bukaModal('modalScanner');
    info('Menyiapkan kamera...');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      info('Kamera tidak bisa dipakai di sini. Buka app lewat alamat https (setelah di-hosting) atau localhost.', true);
      return;
    }

    try {
      await siapkanMesin();
    } catch (e) {
      if (e.message === 'TIDAK_ADA_MESIN') {
        info('Browser ini belum punya pembaca barcode. Di HP pakai Chrome terbaru. Di PC, unduh file js/zxing.min.js (lihat panduan).', true);
      } else {
        info('Pembaca barcode gagal disiapkan.', true);
      }
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
    } catch (e) {
      let pesan = 'Kamera gagal dibuka.';
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        pesan = 'Izin kamera ditolak. Ketuk ikon gembok di kolom alamat, izinkan Kamera, lalu coba lagi.';
      } else if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) {
        pesan = 'Kamera tidak ditemukan di perangkat ini.';
      } else if (e && e.name === 'NotReadableError') {
        pesan = 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.';
      }
      info(pesan, true);
      return;
    }

    // Kalau jendela sudah ditutup selagi menunggu izin kamera
    const modal = $('#modalScanner');
    if (!modal || modal.hidden) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      return;
    }

    const video = $('#scannerVideo');
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* diputar otomatis */ }

    berjalan = true;
    info('Arahkan kamera ke barcode');
    pasangTombolLampu();
    putaran();
  }

  function berhenti() {
    calonKode = ''; calonJumlah = 0;
    berjalan = false;
    sedangBaca = false;
    clearTimeout(timer);
    timer = null;
    if (stream) {
      stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* abaikan */ } });
      stream = null;
    }
    const video = $('#scannerVideo');
    if (video) { try { video.pause(); } catch (e) { /* abaikan */ } video.srcObject = null; }
    const lampu = $('#btnLampu');
    if (lampu) lampu.remove();
  }

  /* ---------- Pengait ---------- */
  window.addEventListener('modal-tutup', (e) => {
    if (e.detail && e.detail.id === 'modalScanner') berhenti();
  });

  // Hemat baterai: matikan kamera kalau app disembunyikan / pindah aplikasi
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && berjalan) App.tutupModal('modalScanner');
  });

  /* ---------- Buka ke luar ---------- */
  window.Scanner = {
    mulai: mulai,
    berhenti: berhenti,
    aktif: () => berjalan,
    jenis: () => (mesin ? mesin.jenis : ('BarcodeDetector' in window ? 'native' : 'belum'))
  };
})();