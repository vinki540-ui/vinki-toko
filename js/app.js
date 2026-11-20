/* =========================================================
   VINKI TOKO - js/app.js
   Navigasi, tema, jam, identitas toko, notifikasi, pengaturan,
   backup/restore, service worker.
   Dipakai file lain lewat objek global: App
   ========================================================= */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const dua = (n) => String(n).padStart(2, '0');

  const HALAMAN = ['beranda', 'transaksi', 'stok', 'masuk', 'riwayat', 'laporan', 'pengaturan'];
  const BAWAAN = {
    namaToko: 'Vinki Toko',
    namaKasir: 'Kasir',
    alamatToko: '',
    footerNota: 'Terima kasih sudah berbelanja',
    lebarKertas: '58'
  };

  let setelan = Object.assign({}, BAWAAN);
  let halamanSekarang = 'beranda';
  let promptInstall = null;

  /* =========================================================
     ALAT BANTU (dipakai file lain lewat App.xxx)
     ========================================================= */
  function esc(t) {
    return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function rupiah(n) {
    n = Math.round(Number(n) || 0);
    return (n < 0 ? '-' : '') + 'Rp ' + Math.abs(n).toLocaleString('id-ID');
  }

  function tgl(ms, denganJam) {
    const d = new Date(ms);
    let s = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    if (denganJam !== false) s += ' ' + dua(d.getHours()) + ':' + dua(d.getMinutes());
    return s;
  }

  let waktuToast = null;
  function toast(pesan, jenis, ms) {
    const el = $('#toast');
    el.textContent = pesan;
    el.className = 'toast' + (jenis ? ' ' + jenis : '');
    el.hidden = false;
    clearTimeout(waktuToast);
    waktuToast = setTimeout(() => { el.hidden = true; }, ms || 2500);
  }

  function bukaModal(id) {
    const m = document.getElementById(id);
    if (m) m.hidden = false;
  }

  function tutupModal(id) {
    const m = document.getElementById(id);
    if (m && !m.hidden) {
      m.hidden = true;
      window.dispatchEvent(new CustomEvent('modal-tutup', { detail: { id: id } }));
    }
  }

  function tutupSemuaModal() {
    $$('.modal').forEach((m) => tutupModal(m.id));
  }

  function modalUmum(judul, html) {
    $('#modalUmumJudul').textContent = judul;
    $('#modalUmumIsi').innerHTML = html;
    bukaModal('modalUmum');
  }

  function konfirmasi(pesan) {
    return Promise.resolve(window.confirm(pesan));
  }

  /* =========================================================
     TEMA TERANG / GELAP
     ========================================================= */
  function terapkanTema(t) {
    const gelap = t === 'gelap';
    document.documentElement.setAttribute('data-tema', gelap ? 'gelap' : 'terang');
    const m = $('meta[name="theme-color"]');
    if (m) m.setAttribute('content', gelap ? '#0F1020' : '#4F46E5');
  }

  function muatTema() {
    let t = 'terang';
    try { t = localStorage.getItem('vinki-tema') || 'terang'; } catch (e) { /* abaikan */ }
    terapkanTema(t);
  }

  function gantiTema() {
    const gelapSekarang = document.documentElement.getAttribute('data-tema') === 'gelap';
    const baru = gelapSekarang ? 'terang' : 'gelap';
    terapkanTema(baru);
    try { localStorage.setItem('vinki-tema', baru); } catch (e) { /* abaikan */ }
  }

  /* =========================================================
     NAVIGASI HALAMAN
     ========================================================= */
  function bukaSidebar() {
    $('#sidebar').classList.add('buka');
    $('#tirai').hidden = false;
  }

  function tutupSidebar() {
    $('#sidebar').classList.remove('buka');
    $('#tirai').hidden = true;
  }

  function tampil(h) {
    if (!HALAMAN.includes(h)) h = 'beranda';
    halamanSekarang = h;
    $$('.halaman').forEach((s) => s.classList.toggle('aktif', s.dataset.halaman === h));
    $$('.nav-item, .bn-item').forEach((b) => b.classList.toggle('aktif', b.dataset.nav === h));
    tutupSidebar();
    window.scrollTo(0, 0);
    if (h === 'pengaturan') renderPengaturan();
    window.dispatchEvent(new CustomEvent('halaman-berubah', { detail: { halaman: h } }));
  }

  function pindah(h, filter) {
    if (h === 'stok') {
      const f = $('#filterStok');
      if (f) {
        const nilai = filter || 'semua';
        if (f.value !== nilai) {
          f.value = nilai;
          f.dispatchEvent(new Event('change'));
        }
      }
    }
    tutupSemuaModal();
    if (location.hash === '#' + h) tampil(h);
    else location.hash = h;
  }

  /* =========================================================
     JAM, IDENTITAS, BACKUP INFO, NOTIFIKASI
     ========================================================= */
  function jam() {
    const d = new Date();
    $('#jamJam').textContent = dua(d.getHours()) + ':' + dua(d.getMinutes());
    $('#jamTanggal').textContent = d.toLocaleDateString('id-ID', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  async function muatSetelan() {
    for (const k of Object.keys(BAWAAN)) {
      setelan[k] = await DB.ambilSetelan(k, BAWAAN[k]);
    }
  }

  function terapkanIdentitas() {
    const toko = setelan.namaToko || BAWAAN.namaToko;
    const kasir = setelan.namaKasir || BAWAAN.namaKasir;
    $('#namaToko').textContent = toko;
    $('#sidebar .sidebar-nama').textContent = toko;
    $('#namaKasir').textContent = kasir;
    $('#sapaNama').textContent = kasir;
    $('#avatarKasir').textContent = kasir.trim().charAt(0).toUpperCase() || 'K';
    document.title = toko;
  }

  async function segarkanBackupInfo() {
    const t = await DB.ambilSetelan('backupTerakhir', null);
    const el = $('#infoBackup');
    if (!t) {
      el.textContent = 'Backup terakhir: belum pernah';
      return;
    }
    const hari = Math.floor((Date.now() - t) / 86400000);
    el.textContent = 'Backup terakhir: ' + tgl(t) + (hari >= 7 ? ' (sudah ' + hari + ' hari)' : '');
  }

  async function segarkanNotif() {
    const daftar = await DB.semuaProduk();
    const n = daftar.filter((p) => p.stok <= p.stokMin).length;
    const b = $('#badgeNotif');
    b.textContent = n > 99 ? '99+' : String(n);
    b.hidden = n === 0;
  }

  async function bukaNotif() {
    const daftar = (await DB.semuaProduk())
      .filter((p) => p.stok <= p.stokMin)
      .sort((a, b) => a.stok - b.stok);

    if (!daftar.length) {
      modalUmum('Notifikasi', '<p style="text-align:center;padding:18px 0;color:var(--teks-pudar)">Semua stok aman 👍</p>');
      return;
    }

    const baris = daftar.slice(0, 50).map((p) => {
      const habis = p.stok <= 0;
      return '<li><div class="kiri"><b>' + esc(p.nama) + '</b><small>Batas minimum ' + esc(p.stokMin) + ' ' + esc(p.satuan) + '</small></div>' +
        '<div class="kanan"><span class="label ' + (habis ? 'merah' : 'oranye') + '">' + (habis ? 'Habis' : 'Sisa ' + esc(p.stok)) + '</span></div></li>';
    }).join('');

    modalUmum('Stok perlu diisi (' + daftar.length + ')',
      '<ul class="daftar">' + baris + '</ul>' +
      '<button class="btn utama penuh" style="margin-top:12px" data-nav="stok" data-filter="menipis">Lihat di halaman Stok</button>');
  }

  /* =========================================================
     HALAMAN PENGATURAN
     ========================================================= */
  async function renderPengaturan() {
    const w = $('#pengaturanWadah');
    const tetap = (navigator.storage && navigator.storage.persisted) ? await navigator.storage.persisted() : false;

    w.innerHTML = `
      <div class="kartu" style="margin-bottom:14px">
        <div class="kartu-kepala"><h2>Toko &amp; Nota</h2></div>
        <form id="formSetelan">
          <div class="field">
            <label for="setToko">Nama toko</label>
            <input id="setToko" maxlength="40" value="${esc(setelan.namaToko)}">
            <small>Tampil di bar atas, sidebar, dan nota</small>
          </div>
          <div class="field">
            <label for="setKasir">Nama kasir</label>
            <input id="setKasir" maxlength="30" value="${esc(setelan.namaKasir)}">
          </div>
          <div class="field">
            <label for="setAlamat">Alamat / nomor telepon toko</label>
            <input id="setAlamat" maxlength="80" value="${esc(setelan.alamatToko)}" placeholder="Boleh dikosongkan">
            <small>Dicetak di bagian atas nota</small>
          </div>
          <div class="field">
            <label for="setFooter">Tulisan di bawah nota</label>
            <input id="setFooter" maxlength="60" value="${esc(setelan.footerNota)}">
          </div>
          <div class="field">
            <label for="setKertas">Lebar kertas printer</label>
            <select id="setKertas">
              <option value="58" ${setelan.lebarKertas === '58' ? 'selected' : ''}>58 mm (kecil)</option>
              <option value="80" ${setelan.lebarKertas === '80' ? 'selected' : ''}>80 mm (besar)</option>
            </select>
          </div>
          <button class="btn utama penuh" type="submit">Simpan</button>
        </form>
      </div>

      <div class="kartu" style="margin-bottom:14px">
        <div class="kartu-kepala"><h2>Tampilan</h2></div>
        <button class="btn penuh" id="btnTemaPengaturan">Ganti mode terang / gelap</button>
      </div>

      <div class="kartu" style="margin-bottom:14px">
        <div class="kartu-kepala"><h2>Backup &amp; Pulihkan Data</h2></div>
        <p style="color:var(--teks-pudar);font-size:13px;margin-bottom:12px">
          Semua data tersimpan di HP ini saja. Kalau HP rusak, hilang, atau data browser terhapus, data ikut hilang.
          Unduh backup secara rutin, lalu kirim file-nya ke WhatsApp sendiri atau Google Drive.
        </p>
        <div id="infoBackupPengaturan" style="font-weight:700;margin-bottom:12px"></div>
        <button class="btn utama penuh" id="btnBackup" style="margin-bottom:10px">Unduh Backup Sekarang</button>
        <label class="btn penuh" for="fileRestore" style="cursor:pointer">Pulihkan dari File Backup</label>
        <input type="file" id="fileRestore" accept=".json,application/json" hidden>
        <p style="color:var(--teks-pudar);font-size:12px;margin-top:10px">
          Penyimpanan tetap di HP: <b>${tetap ? 'Aktif (data aman dari pembersihan otomatis)' : 'Belum aktif'}</b>
        </p>
      </div>

      <div class="kartu" id="kartuInstall" style="margin-bottom:14px" ${promptInstall ? '' : 'hidden'}>
        <div class="kartu-kepala"><h2>Pasang di HP</h2></div>
        <button class="btn hijau penuh" id="btnInstall">Install aplikasi ini</button>
      </div>

      <div class="kartu" style="margin-bottom:14px">
        <div class="kartu-kepala"><h2>Hapus Semua Data</h2></div>
        <p style="color:var(--teks-pudar);font-size:13px;margin-bottom:12px">
          Menghapus semua produk, riwayat penjualan, dan barang masuk. Tidak bisa dibatalkan. Unduh backup dulu.
        </p>
        <button class="btn bahaya penuh" id="btnReset">Hapus Semua Data</button>
      </div>

      <p style="text-align:center;color:var(--teks-pudar);font-size:12px;padding:6px 0 12px">Vinki Toko &middot; Kasir Offline</p>
    `;

    const tBackup = await DB.ambilSetelan('backupTerakhir', null);
    $('#infoBackupPengaturan').textContent = tBackup ? 'Backup terakhir: ' + tgl(tBackup) : 'Backup terakhir: belum pernah';

    // Simpan setelan
    $('#formSetelan').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await DB.simpanSetelan('namaToko', $('#setToko').value.trim() || BAWAAN.namaToko);
        await DB.simpanSetelan('namaKasir', $('#setKasir').value.trim() || BAWAAN.namaKasir);
        await DB.simpanSetelan('alamatToko', $('#setAlamat').value.trim());
        await DB.simpanSetelan('footerNota', $('#setFooter').value.trim());
        await DB.simpanSetelan('lebarKertas', $('#setKertas').value);
        await muatSetelan();
        terapkanIdentitas();
        toast('Pengaturan tersimpan', 'sukses');
      } catch (err) {
        toast('Gagal menyimpan: ' + (err.message || err), 'gagal', 4000);
      }
    });

    $('#btnTemaPengaturan').addEventListener('click', gantiTema);

    // Backup
    $('#btnBackup').addEventListener('click', async () => {
      try {
        const nama = await DB.unduhBackup();
        toast('Backup diunduh: ' + nama, 'sukses', 4000);
        await segarkanBackupInfo();
        $('#infoBackupPengaturan').textContent = 'Backup terakhir: ' + tgl(Date.now());
      } catch (err) {
        toast('Gagal backup: ' + (err.message || err), 'gagal', 4000);
      }
    });

    // Restore
    $('#fileRestore').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const isi = JSON.parse(await f.text());
        if (!isi || isi.app !== 'vinki-toko') throw new Error('File ini bukan backup Vinki Toko');
        const jml = (isi.data && isi.data.produk ? isi.data.produk.length : 0);
        const ya = await konfirmasi('Semua data sekarang akan DIGANTI dengan isi file ini (' + jml + ' produk). Lanjutkan?');
        if (ya) {
          await DB.imporSemua(isi);
          await muatSetelan();
          terapkanIdentitas();
          await segarkanBackupInfo();
          await segarkanNotif();
          renderPengaturan();
          toast('Data berhasil dipulihkan', 'sukses');
        }
      } catch (err) {
        const pesan = (err instanceof SyntaxError) ? 'File rusak atau bukan file backup' : (err.message || 'Gagal memulihkan');
        toast(pesan, 'gagal', 4000);
      }
      e.target.value = '';
    });

    // Install ke HP
    const btnInstall = $('#btnInstall');
    if (btnInstall) {
      btnInstall.addEventListener('click', async () => {
        if (!promptInstall) return;
        promptInstall.prompt();
        try { await promptInstall.userChoice; } catch (err) { /* abaikan */ }
        promptInstall = null;
        $('#kartuInstall').hidden = true;
      });
    }

    // Hapus semua data
    $('#btnReset').addEventListener('click', async () => {
      const k = window.prompt('Ini menghapus SEMUA produk dan riwayat penjualan.\n\nKetik HAPUS (huruf besar) untuk lanjut:');
      if (k !== 'HAPUS') {
        if (k !== null) toast('Dibatalkan');
        return;
      }
      try {
        await DB.resetSemua();
        await muatSetelan();
        terapkanIdentitas();
        await segarkanBackupInfo();
        await segarkanNotif();
        renderPengaturan();
        toast('Semua data sudah dihapus', 'sukses');
      } catch (err) {
        toast('Gagal menghapus: ' + (err.message || err), 'gagal', 4000);
      }
    });

    // Beri kesempatan file lain menambah kartu di halaman ini
    window.dispatchEvent(new CustomEvent('pengaturan-dirender', { detail: { wadah: w } }));
  }

  /* =========================================================
     PASANG PENGAIT (event)
     ========================================================= */
  function pasangPengait() {
    // Klik: navigasi, tutup modal
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        pindah(nav.dataset.nav, nav.dataset.filter);
        return;
      }
      const tutup = e.target.closest('[data-tutup]');
      if (tutup) {
        tutupModal(tutup.dataset.tutup);
        return;
      }
      if (e.target.classList && e.target.classList.contains('modal')) {
        tutupModal(e.target.id);
      }
    });

    $('#btnTema').addEventListener('click', gantiTema);
    $('#btnMenuHp').addEventListener('click', bukaSidebar);
    $('#tirai').addEventListener('click', tutupSidebar);
    $('#btnNotif').addEventListener('click', bukaNotif);
    $('#btnTransaksiCepat').addEventListener('click', () => pindah('transaksi'));

    // Pencarian global di bar atas: Enter = cari di halaman Stok
    $('#cariGlobal').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const q = e.target.value.trim();
      if (!q) return;
      pindah('stok');
      const c = $('#cariProduk');
      c.value = q;
      c.dispatchEvent(new Event('input'));
      e.target.value = '';
      e.target.blur();
    });

    // Tombol pintas keyboard
    document.addEventListener('keydown', (e) => {
      const peta = { F1: 'transaksi', F2: 'stok', F3: 'masuk', F4: 'riwayat', F9: 'transaksi' };
      if (peta[e.key]) {
        e.preventDefault();
        pindah(peta[e.key]);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const c = $('#cariGlobal');
        if (c && c.offsetParent !== null) { c.focus(); c.select(); }
        return;
      }
      if (e.key === 'Escape') {
        tutupSemuaModal();
        tutupSidebar();
      }
    });

    window.addEventListener('hashchange', () => tampil(location.hash.slice(1) || 'beranda'));

    // Data berubah di database -> segarkan lencana notifikasi dan info backup
    window.addEventListener('db-berubah', async (e) => {
      try {
        const st = e.detail && e.detail.store;
        if (st === 'pengaturan' || st === 'semua') {
          await muatSetelan();
          terapkanIdentitas();
        }
        if (st === 'produk' || st === 'semua') await segarkanNotif();
        if (st === 'pengaturan' || st === 'semua') await segarkanBackupInfo();
      } catch (err) { /* abaikan */ }
    });

    // Tombol "Install" dari Chrome (hanya muncul di alamat https)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      promptInstall = e;
      const k = $('#kartuInstall');
      if (k) k.hidden = false;
    });
    window.addEventListener('appinstalled', () => { promptInstall = null; });
  }

  /* =========================================================
     SERVICE WORKER (offline) - hanya jalan di alamat http(s)
     ========================================================= */
  function daftarkanSW() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* abaikan */ });
    });
  }

  /* =========================================================
     MULAI
     ========================================================= */
  muatTema();
  pasangPengait();
  jam();
  setInterval(jam, 20000);
  tampil(location.hash.slice(1) || 'beranda');
  daftarkanSW();

  const siap = (async () => {
    try {
      await DB.buka();
      await muatSetelan();
    } catch (err) {
      modalUmum('Penyimpanan tidak tersedia',
        '<p>' + esc(err.message || err) + '</p><p style="margin-top:8px;color:var(--teks-pudar);font-size:13px">' +
        'Jangan pakai mode Incognito/Private. Buka app di Chrome biasa.</p>');
    }
    terapkanIdentitas();
    try {
      await segarkanBackupInfo();
      await segarkanNotif();
      DB.mintaPenyimpananTetap();
    } catch (err) { /* abaikan */ }
    window.dispatchEvent(new CustomEvent('app-siap'));
  })();

  /* ---------- Buka ke luar ---------- */
  window.App = {
    siap: siap,
    esc: esc,
    rupiah: rupiah,
    tgl: tgl,
    toast: toast,
    bukaModal: bukaModal,
    tutupModal: tutupModal,
    modalUmum: modalUmum,
    konfirmasi: konfirmasi,
    pindah: pindah,
    halaman: () => halamanSekarang,
    get setelan() { return setelan; }
  };
})();