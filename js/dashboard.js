/* =========================================================
   VINKI TOKO - js/dashboard.js
   Beranda: kartu statistik, grafik penjualan, transaksi terbaru,
   stok menipis, produk terlaris.
   ========================================================= */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const MAKS_HARI = 30;

  let transaksi30 = [];     // transaksi 30 hari terakhir (tanpa yang dibatalkan)
  let titikGrafik = [];     // posisi titik di kanvas
  let nilaiGrafik = [];     // { label, tanggal, total }
  let sorot = -1;           // titik yang sedang disorot
  let sorotBawaan = -1;
  let timerSegar = null;

  /* ---------- Alat bantu ---------- */
  function awalHari(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function jumlahkan(daftar) {
    let s = 0;
    daftar.forEach((t) => { s += t.total; });
    return s;
  }

  function singkat(n) {
    n = Math.round(Number(n) || 0);
    if (n >= 1000000) {
      const j = n / 1000000;
      return (j >= 10 ? Math.round(j) : Math.round(j * 10) / 10).toString().replace('.', ',') + 'jt';
    }
    if (n >= 1000) return Math.round(n / 1000) + 'rb';
    return String(n);
  }

  function persen(sekarang, lalu, elemen) {
    elemen.className = '';
    if (!lalu || lalu <= 0) { elemen.textContent = ''; return; }
    const p = Math.round(((sekarang - lalu) / lalu) * 100);
    if (p >= 0) {
      elemen.textContent = '\u2191 ' + p + '%';
    } else {
      elemen.textContent = '\u2193 ' + Math.abs(p) + '%';
      elemen.className = 'turun';
    }
  }

  function warna(nama, cadangan) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nama).trim();
    return v || cadangan;
  }

  function hexRgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return 'rgba(79,70,229,' + a + ')';
    const n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* =========================================================
     MUAT DATA
     ========================================================= */
  async function muat() {
    try {
      const sekarang = new Date();
      const mulai = new Date(sekarang.getFullYear(), sekarang.getMonth(), sekarang.getDate() - (MAKS_HARI - 1)).getTime();
      transaksi30 = await DB.transaksiRentang(mulai, Date.now() + 60000, false);
    } catch (e) {
      transaksi30 = [];
    }
    await render();
  }

  function jadwalkanSegar() {
    clearTimeout(timerSegar);
    timerSegar = setTimeout(muat, 150);
  }

  /* =========================================================
     RENDER
     ========================================================= */
  async function render() {
    let produk = [];
    try { produk = await DB.semuaProduk(); } catch (e) { produk = []; }

    const hariIni = awalHari(new Date());
    const kemarin = hariIni - 86400000;
    const dihariIni = transaksi30.filter((t) => t.tanggal >= hariIni);
    const dikemarin = transaksi30.filter((t) => t.tanggal >= kemarin && t.tanggal < hariIni);

    // Kartu statistik
    const omset = jumlahkan(dihariIni);
    $('#statOmset').textContent = App.rupiah(omset);
    persen(omset, jumlahkan(dikemarin), $('#statOmsetNaik'));

    $('#statTransaksi').textContent = String(dihariIni.length);
    persen(dihariIni.length, dikemarin.length, $('#statTransaksiNaik'));

    $('#statProduk').textContent = String(produk.length);

    const menipis = produk.filter((p) => p.stok <= p.stokMin);
    $('#statMenipis').textContent = menipis.length + ' Produk';

    // Produk terlaris (30 hari terakhir)
    const hitungProduk = new Map();
    transaksi30.forEach((t) => {
      t.items.forEach((i) => {
        hitungProduk.set(i.nama, (hitungProduk.get(i.nama) || 0) + i.jumlah);
      });
    });
    const terlaris = Array.from(hitungProduk.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (terlaris.length) {
      $('#statTerlaris').textContent = terlaris[0][0];
      $('#statTerlarisJml').textContent = 'Terjual ' + terlaris[0][1] + 'x (30 hari)';
    } else {
      $('#statTerlaris').textContent = '-';
      $('#statTerlarisJml').textContent = '';
    }

    const listTerlaris = $('#listTerlaris');
    if (!terlaris.length) {
      listTerlaris.innerHTML = '<li class="kosong">Belum ada penjualan</li>';
    } else {
      listTerlaris.innerHTML = terlaris.map((x, idx) =>
        '<li><div class="kiri"><b>' + (idx + 1) + '. ' + App.esc(x[0]) + '</b><small>30 hari terakhir</small></div>' +
        '<div class="kanan">' + x[1] + ' pcs</div></li>'
      ).join('');
    }

    // Stok menipis
    const listMenipis = $('#listStokMenipis');
    if (!produk.length) {
      listMenipis.innerHTML = '<li class="kosong">Belum ada data</li>';
    } else if (!menipis.length) {
      listMenipis.innerHTML = '<li class="kosong">Semua stok aman \uD83D\uDC4D</li>';
    } else {
      const urut = menipis.slice().sort((a, b) => a.stok - b.stok).slice(0, 5);
      listMenipis.innerHTML = urut.map((p) => {
        const habis = p.stok <= 0;
        return '<li><div class="kiri"><b>' + App.esc(p.nama) + '</b><small>Batas minimum ' + App.esc(p.stokMin) + ' ' + App.esc(p.satuan) + '</small></div>' +
          '<div class="kanan"><span class="label ' + (habis ? 'merah' : 'oranye') + '">' + (habis ? 'Habis' : 'Sisa ' + App.esc(p.stok)) + '</span></div></li>';
      }).join('');
    }

    // Transaksi terbaru (termasuk yang dibatalkan, supaya jelas)
    let terbaru = [];
    try { terbaru = await DB.transaksiTerbaru(5); } catch (e) { terbaru = []; }
    const listBaru = $('#listTransaksiTerbaru');
    if (!terbaru.length) {
      listBaru.innerHTML = '<li class="kosong">Belum ada transaksi</li>';
    } else {
      listBaru.innerHTML = terbaru.map((t) => {
        const batal = t.status === 'batal';
        return '<li data-id="' + t.id + '" style="cursor:pointer"><div class="kiri"><b>' + App.esc(t.noNota) + '</b>' +
          '<small>' + App.esc(App.tgl(t.tanggal)) + '</small></div>' +
          '<div class="kanan">' + App.rupiah(t.total) + '<br>' +
          '<span class="label ' + (batal ? 'merah' : 'hijau') + '">' + (batal ? 'Batal' : 'Sukses') + '</span></div></li>';
      }).join('');
    }

    siapkanGrafik();
    gambar();
  }

  /* =========================================================
     GRAFIK PENJUALAN (digambar sendiri di kanvas)
     ========================================================= */
  function siapkanGrafik() {
    const n = Number($('#grafikRentang').value) || 7;
    const sekarang = new Date();
    const peta = new Map();
    nilaiGrafik = [];

    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(sekarang.getFullYear(), sekarang.getMonth(), sekarang.getDate() - i);
      const kunci = d.getTime();
      const entri = { kunci: kunci, tanggal: d, label: n <= 7 ? HARI[d.getDay()] : String(d.getDate()), total: 0 };
      nilaiGrafik.push(entri);
      peta.set(kunci, entri);
    }

    transaksi30.forEach((t) => {
      const e = peta.get(awalHari(new Date(t.tanggal)));
      if (e) e.total += t.total;
    });

    let maks = 0;
    sorotBawaan = -1;
    nilaiGrafik.forEach((e, idx) => {
      if (e.total > maks) { maks = e.total; sorotBawaan = idx; }
    });
    sorot = sorotBawaan;
  }

  function nilaiAtas(maks) {
    if (maks <= 0) return 100000;
    const mag = Math.pow(10, Math.floor(Math.log10(maks)));
    const x = maks / mag;
    const nice = x <= 1 ? 1 : x <= 2 ? 2 : x <= 2.5 ? 2.5 : x <= 5 ? 5 : 10;
    return nice * mag;
  }

  function kotakBulat(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function gambar() {
    const c = $('#grafikPenjualan');
    if (!c) return;
    const wadah = c.parentElement;
    const w = wadah.clientWidth;
    const h = wadah.clientHeight;
    if (!w || !h) return;   // halaman sedang tersembunyi

    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const warnaUtama = warna('--utama', '#4F46E5');
    const warnaTeks = warna('--teks-pudar', '#6B7280');
    const warnaGaris = warna('--garis', '#E5E7EF');
    const warnaKartu = warna('--kartu', '#FFFFFF');
    const warnaTeksGelap = warna('--teks', '#1E1B4B');

    const kiri = 46, kanan = 14, atas = 30, bawah = 28;
    const lebarIsi = w - kiri - kanan;
    const tinggiIsi = h - atas - bawah;
    const n = nilaiGrafik.length;

    let maks = 0;
    nilaiGrafik.forEach((e) => { if (e.total > maks) maks = e.total; });
    const puncak = nilaiAtas(maks);

    g.font = '11px "Segoe UI", Roboto, Arial, sans-serif';
    g.textBaseline = 'middle';

    // Garis datar + angka sumbu Y
    for (let i = 0; i <= 4; i++) {
      const y = atas + tinggiIsi - (tinggiIsi * i) / 4;
      g.strokeStyle = warnaGaris;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(kiri, y);
      g.lineTo(w - kanan, y);
      g.stroke();
      g.fillStyle = warnaTeks;
      g.textAlign = 'right';
      g.fillText(singkat((puncak * i) / 4), kiri - 8, y);
    }

    // Posisi titik
    titikGrafik = nilaiGrafik.map((e, i) => ({
      x: n === 1 ? kiri + lebarIsi / 2 : kiri + (lebarIsi * i) / (n - 1),
      y: atas + tinggiIsi - (tinggiIsi * e.total) / puncak
    }));

    // Label sumbu X
    const lompat = Math.max(1, Math.ceil(n / 7));
    g.textAlign = 'center';
    g.fillStyle = warnaTeks;
    nilaiGrafik.forEach((e, i) => {
      if ((n - 1 - i) % lompat !== 0) return;
      g.fillText(e.label, titikGrafik[i].x, h - bawah / 2 + 2);
    });

    // Area di bawah garis
    const gradasi = g.createLinearGradient(0, atas, 0, atas + tinggiIsi);
    gradasi.addColorStop(0, hexRgba(warnaUtama, 0.28));
    gradasi.addColorStop(1, hexRgba(warnaUtama, 0.02));
    g.beginPath();
    g.moveTo(titikGrafik[0].x, atas + tinggiIsi);
    titikGrafik.forEach((p) => g.lineTo(p.x, p.y));
    g.lineTo(titikGrafik[n - 1].x, atas + tinggiIsi);
    g.closePath();
    g.fillStyle = gradasi;
    g.fill();

    // Garis
    g.beginPath();
    titikGrafik.forEach((p, i) => { if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); });
    g.strokeStyle = warnaUtama;
    g.lineWidth = 2.5;
    g.lineJoin = 'round';
    g.stroke();

    // Titik
    titikGrafik.forEach((p, i) => {
      if (n > 14 && i !== sorot) return;
      g.beginPath();
      g.arc(p.x, p.y, i === sorot ? 5 : 3.5, 0, Math.PI * 2);
      g.fillStyle = i === sorot ? warnaKartu : warnaUtama;
      g.fill();
      if (i === sorot) {
        g.lineWidth = 3;
        g.strokeStyle = warnaUtama;
        g.stroke();
      }
    });

    // Gelembung info pada titik yang disorot
    if (sorot >= 0 && nilaiGrafik[sorot]) {
      const e = nilaiGrafik[sorot];
      const teks = App.rupiah(e.total) + '  \u00B7  ' + e.tanggal.getDate() + '/' + (e.tanggal.getMonth() + 1);
      g.font = 'bold 12px "Segoe UI", Roboto, Arial, sans-serif';
      const lebarTeks = g.measureText(teks).width;
      const kw = lebarTeks + 20;
      const kh = 26;
      const p = titikGrafik[sorot];
      let kx = p.x - kw / 2;
      kx = Math.max(4, Math.min(w - kw - 4, kx));
      let ky = p.y - kh - 12;
      if (ky < 2) ky = p.y + 12;

      g.fillStyle = warnaTeksGelap;
      kotakBulat(g, kx, ky, kw, kh, 8);
      g.fill();
      g.fillStyle = warnaKartu;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(teks, kx + kw / 2, ky + kh / 2 + 1);
    }
  }

  function titikTerdekat(ev) {
    const c = $('#grafikPenjualan');
    const r = c.getBoundingClientRect();
    const x = ev.clientX - r.left;
    let terbaik = -1;
    let jarak = Infinity;
    titikGrafik.forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < jarak) { jarak = d; terbaik = i; }
    });
    return terbaik;
  }

  /* =========================================================
     PASANG PENGAIT
     ========================================================= */
  function pasang() {
    const c = $('#grafikPenjualan');

    c.addEventListener('pointermove', (ev) => {
      const i = titikTerdekat(ev);
      if (i !== sorot) { sorot = i; gambar(); }
    });
    c.addEventListener('pointerdown', (ev) => {
      const i = titikTerdekat(ev);
      if (i !== sorot) { sorot = i; gambar(); }
    });
    c.addEventListener('pointerleave', () => {
      if (sorot !== sorotBawaan) { sorot = sorotBawaan; gambar(); }
    });

    $('#grafikRentang').addEventListener('change', () => { siapkanGrafik(); gambar(); });

    // Klik transaksi terbaru -> tampilkan nota lagi
    $('#listTransaksiTerbaru').addEventListener('click', async (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      const t = await DB.ambilTransaksi(Number(li.dataset.id));
      if (t && window.Kasir && Kasir.tampilNota) Kasir.tampilNota(t);
    });

    // Gambar ulang saat ukuran jendela berubah atau tema ganti
    let timerUkuran = null;
    window.addEventListener('resize', () => {
      clearTimeout(timerUkuran);
      timerUkuran = setTimeout(gambar, 120);
    });
    new MutationObserver(() => gambar()).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-tema']
    });

    window.addEventListener('halaman-berubah', (e) => {
      if (e.detail && e.detail.halaman === 'beranda') {
        muat();
        setTimeout(gambar, 60);
      }
    });

    window.addEventListener('db-berubah', (e) => {
      const st = e.detail && e.detail.store;
      if (st === 'transaksi' || st === 'produk' || st === 'semua') jadwalkanSegar();
    });

    // Hari berganti saat app dibiarkan terbuka: segarkan tiap 5 menit
    setInterval(() => { if (App.halaman() === 'beranda') muat(); }, 300000);
  }

  pasang();
  App.siap.then(muat);

  window.Dashboard = { muat: muat };
})();