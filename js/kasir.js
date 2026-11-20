/* =========================================================
   VINKI TOKO - js/kasir.js
   Layar kasir: scan, keranjang, bayar, kembalian, nota,
   stok otomatis berkurang.
   Dipakai file lain lewat objek global: Kasir
   ========================================================= */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const wadah = $('#kasirWadah');
  if (!wadah) return;

  const KUNCI_KERANJANG = 'vinki-keranjang';
  const KUNCI_ALAT = 'vinki-mode-alat';

  let daftarProduk = [];
  let produkMap = new Map();
  let keranjang = [];      // { produkId, nama, harga, jumlah }
  let modeAlat = false;
  let proses = false;
  let totalTerakhir = -1;

  /* ---------- Gaya tambahan khusus layar kasir ---------- */
  const gaya = document.createElement('style');
  gaya.textContent = `
    .kasir-grid { grid-template-areas: "scan" "cart" "fav"; }
    .kasir-grid > * { min-width: 0; }
    @media (min-width: 900px) {
      .kasir-grid { grid-template-columns: 1.3fr 1fr; grid-template-areas: "scan cart" "fav cart"; grid-template-rows: auto 1fr; }
      .kasir-cart { position: sticky; top: 80px; align-self: start; }
    }
    .fav-tombol b { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.2; }
    .fav-tombol.habis { opacity: .45; }
    .k-info { font-weight: 800; text-align: right; min-height: 22px; margin: 6px 0 10px; color: var(--teks-pudar); }
    .k-info.kurang { color: var(--merah); }
    .k-info.kembalian { color: var(--hijau); font-size: 18px; }
    .k-cepat { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
    .k-cari-hasil { margin-top: 10px; display: grid; gap: 8px; }
    .k-cari-hasil .produk-item { cursor: pointer; }
    .k-kosong { text-align: center; color: var(--teks-pudar); padding: 22px 8px; font-size: 14px; }
    .k-baris { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
    .k-baris input { width: 140px; text-align: right; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--garis); background: var(--kartu); }
  `;
  document.head.appendChild(gaya);

  /* ---------- Kerangka layar ---------- */
  wadah.innerHTML = `
    <div class="kasir-grid">
      <div class="kartu" style="grid-area:scan">
        <div class="kasir-scan">
          <input id="kInput" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
                 placeholder="Scan barcode atau ketik nama produk">
          <button class="btn utama" id="kBtnKamera" type="button">Kamera</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <small style="color:var(--teks-pudar)">Tekan Enter setelah ketik atau scan</small>
          <button class="btn kecil" id="kBtnAlat" type="button">Scanner alat: Mati</button>
        </div>
        <div id="kCari" class="k-cari-hasil"></div>
      </div>

      <div class="kartu kasir-cart" style="grid-area:cart">
        <div class="kartu-kepala">
          <h2>Keranjang <span id="kJmlItem" style="color:var(--teks-pudar);font-size:13px;font-weight:600">0 item</span></h2>
          <button class="btn kecil bahaya" id="kBtnKosong" type="button">Kosongkan</button>
        </div>
        <div id="kItems"></div>

        <div class="k-baris"><span>Subtotal</span><b id="kSub">Rp 0</b></div>
        <div class="k-baris"><span>Diskon (Rp)</span><input id="kDiskon" type="number" inputmode="numeric" min="0" step="1" placeholder="0"></div>
        <div class="total-besar"><span>Total</span><b id="kTotal">Rp 0</b></div>

        <div class="field">
          <label for="kMetode">Metode bayar</label>
          <select id="kMetode">
            <option value="tunai">Tunai</option>
            <option value="qris">QRIS</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>

        <div id="kBayarWadah">
          <div class="field" style="margin-bottom:8px">
            <label for="kBayar">Uang diterima (Rp)</label>
            <input id="kBayar" type="number" inputmode="numeric" min="0" step="1" placeholder="0">
          </div>
          <div class="k-cepat" id="kCepat"></div>
        </div>
        <div class="k-info" id="kKembali"></div>

        <button class="btn hijau besar penuh" id="kBtnBayar" type="button" disabled>Bayar</button>
      </div>

      <div class="kartu" style="grid-area:fav">
        <div class="kartu-kepala"><h2>Favorit / Paling Laku</h2></div>
        <div id="kFavorit" class="favorit-grid"></div>
      </div>
    </div>
  `;

  /* ---------- Simpan keranjang di HP (supaya tidak hilang saat refresh) ---------- */
  function simpanKeranjang() {
    try { localStorage.setItem(KUNCI_KERANJANG, JSON.stringify(keranjang)); } catch (e) { /* abaikan */ }
  }

  function muatKeranjang() {
    try {
      const mentah = JSON.parse(localStorage.getItem(KUNCI_KERANJANG) || '[]');
      if (Array.isArray(mentah)) {
        keranjang = mentah
          .filter((i) => i && i.nama && Number(i.jumlah) > 0)
          .map((i) => ({
            produkId: (i.produkId === undefined ? null : i.produkId),
            nama: String(i.nama),
            harga: Number(i.harga) || 0,
            jumlah: Number(i.jumlah) || 1
          }));
      }
    } catch (e) { keranjang = []; }
  }

  /* =========================================================
     DATA PRODUK
     ========================================================= */
  async function muatProduk() {
    try {
      daftarProduk = await DB.semuaProduk();
    } catch (e) {
      daftarProduk = [];
    }
    produkMap = new Map(daftarProduk.map((p) => [p.id, p]));
    renderFavorit();
    renderCari();
  }

  function fotoHtml(p) {
    if (p.foto) return '<img class="produk-foto" loading="lazy" alt="" src="' + p.foto + '">';
    return '<span class="produk-foto">' + App.esc((p.nama || '?').trim().charAt(0).toUpperCase()) + '</span>';
  }

  function renderFavorit() {
    const el = $('#kFavorit');
    const fav = daftarProduk.filter((p) => p.favorit);
    if (!fav.length) {
      el.style.display = 'block';
      el.innerHTML = '<div class="k-kosong">Belum ada tombol favorit.<br>Buka <b>Stok</b>, klik produk, lalu pilih <b>Tombol favorit: Ya</b>.</div>';
      return;
    }
    el.style.display = '';
    el.innerHTML = fav.map((p) =>
      '<button type="button" class="fav-tombol' + (p.stok <= 0 ? ' habis' : '') + '" data-id="' + p.id + '">' +
      fotoHtml(p) +
      '<b>' + App.esc(p.nama) + '</b>' +
      '<small>' + (p.stok <= 0 ? 'Habis' : App.rupiah(p.hargaJual)) + '</small></button>'
    ).join('');
  }

  function cariNama(q) {
    q = q.toLowerCase();
    return daftarProduk.filter((p) =>
      p.nama.toLowerCase().indexOf(q) !== -1 || String(p.barcode).indexOf(q) !== -1
    );
  }

  function renderCari() {
    const el = $('#kCari');
    const q = $('#kInput').value.trim();
    if (!q) { el.innerHTML = ''; return; }
    const hasil = cariNama(q).slice(0, 8);
    if (!hasil.length) {
      el.innerHTML = '<div class="k-kosong" style="padding:10px">Tidak ada produk bernama itu</div>';
      return;
    }
    el.innerHTML = hasil.map((p) =>
      '<div class="produk-item" data-id="' + p.id + '" role="button" tabindex="0">' + fotoHtml(p) +
      '<div class="produk-info"><b>' + App.esc(p.nama) + '</b><small>' + (p.barcode ? App.esc(p.barcode) : 'Tanpa barcode') + '</small></div>' +
      '<div class="produk-harga">' + App.rupiah(p.hargaJual) +
      '<small class="' + (p.stok <= 0 ? 'habis' : '') + '">' + (p.stok <= 0 ? 'Habis' : 'Stok ' + App.esc(p.stok)) + '</small></div></div>'
    ).join('');
  }

  /* =========================================================
     KERANJANG
     ========================================================= */
  function tambah(p, jml) {
    jml = jml || 1;
    let item = keranjang.find((i) => i.produkId === p.id);
    const baru = (item ? item.jumlah : 0) + jml;
    if (item) {
      item.jumlah = baru;
      item.harga = p.hargaJual;
    } else {
      item = { produkId: p.id, nama: p.nama, harga: p.hargaJual, jumlah: baru };
      keranjang.push(item);
    }
    if (baru > p.stok) {
      App.toast('Stok tercatat tinggal ' + p.stok + ' (' + p.nama + '), tetap dimasukkan', '', 2600);
    } else {
      App.toast('+ ' + p.nama, '', 900);
    }
    simpanKeranjang();
    renderKeranjang();
  }

  async function tambahKode(kode) {
    kode = String(kode || '').trim();
    if (!kode) return;
    // Jangan menumpuk pop-up kalau sedang ada jendela terbuka (selain kamera)
    const info = $('#modalUmum');
    if (info && !info.hidden) return;
    const p = await DB.cariBarcode(kode);
    if (p) tambah(p, 1);
    else tidakKetemu(kode);
  }

  function tidakKetemu(kode) {
    App.modalUmum('Barcode belum terdaftar',
      '<p style="margin-bottom:6px">Barcode <b>' + App.esc(kode) + '</b> belum ada di daftar produk.</p>' +
      '<p style="color:var(--teks-pudar);font-size:13px;margin-bottom:14px">Daftarkan sekarang (barcode otomatis terisi), lalu kembali ke Transaksi.</p>' +
      '<button class="btn utama penuh" id="kDaftarkan" type="button">Daftarkan Produk</button>' +
      '<button class="btn penuh" style="margin-top:8px" data-tutup="modalUmum" type="button">Batal</button>');
    const t = $('#kDaftarkan');
    if (t) t.addEventListener('click', () => daftarkan(kode));
  }

  async function daftarkan(kode) {
    App.tutupModal('modalUmum');
    App.tutupModal('modalScanner');
    App.pindah('stok');
    await Produk.bukaForm(null);
    const bc = $('#pBarcode');
    if (bc) {
      bc.value = kode;
      bc.dispatchEvent(new Event('change'));
    }
  }

  function renderKeranjang() {
    const el = $('#kItems');
    if (!keranjang.length) {
      el.innerHTML = '<div class="k-kosong">Keranjang masih kosong.<br>Scan barcode atau tap produk favorit.</div>';
    } else {
      el.innerHTML = keranjang.map((i, idx) =>
        '<div class="keranjang-item" data-i="' + idx + '">' +
        '<div class="nama"><b>' + App.esc(i.nama) + '</b>' +
        '<small>' + App.rupiah(i.harga) + ' &times; ' + i.jumlah + ' = ' + App.rupiah(i.harga * i.jumlah) + '</small></div>' +
        '<div class="qty"><button type="button" data-aksi="kurang" aria-label="Kurangi">&minus;</button>' +
        '<span data-aksi="ubah" style="cursor:pointer">' + i.jumlah + '</span>' +
        '<button type="button" data-aksi="plus" aria-label="Tambah">+</button></div>' +
        '<button type="button" class="icon-btn" data-aksi="hapus" aria-label="Hapus" style="color:var(--merah);font-weight:800">&#10005;</button>' +
        '</div>'
      ).join('');
    }
    updateTotals();
  }

  /* =========================================================
     HITUNG & PEMBAYARAN
     ========================================================= */
  function hitung() {
    let sub = 0;
    let jumlahItem = 0;
    keranjang.forEach((i) => { sub += i.harga * i.jumlah; jumlahItem += i.jumlah; });
    let diskon = Math.max(0, Math.round(Number($('#kDiskon').value) || 0));
    if (diskon > sub) diskon = sub;
    const total = sub - diskon;
    const metode = $('#kMetode').value;
    const bayar = metode === 'tunai' ? (Number($('#kBayar').value) || 0) : total;
    return { sub: sub, diskon: diskon, total: total, metode: metode, bayar: bayar, jumlahItem: jumlahItem };
  }

  function renderCepat(total) {
    const el = $('#kCepat');
    const tombol = ['<button type="button" class="btn kecil" data-aksi="cepat" data-nilai="pas">Uang pas</button>'];
    if (total > 0) {
      const pecahan = [2000, 5000, 10000, 20000, 50000, 100000];
      pecahan.filter((d) => d >= total).slice(0, 3).forEach((d) => {
        tombol.push('<button type="button" class="btn kecil" data-aksi="cepat" data-nilai="' + d + '">' + App.rupiah(d) + '</button>');
      });
    }
    el.innerHTML = tombol.join('');
  }

  function updateTotals() {
    const h = hitung();
    $('#kSub').textContent = App.rupiah(h.sub);
    $('#kTotal').textContent = App.rupiah(h.total);
    $('#kJmlItem').textContent = h.jumlahItem + ' item';

    const tunai = h.metode === 'tunai';
    $('#kBayarWadah').hidden = !tunai;

    const info = $('#kKembali');
    info.className = 'k-info';
    if (!keranjang.length || !tunai) {
      info.textContent = '';
    } else if (!$('#kBayar').value) {
      info.textContent = 'Masukkan uang yang diterima';
    } else if (h.bayar < h.total) {
      info.textContent = 'Kurang ' + App.rupiah(h.total - h.bayar);
      info.classList.add('kurang');
    } else {
      info.textContent = 'Kembalian ' + App.rupiah(h.bayar - h.total);
      info.classList.add('kembalian');
    }

    $('#kBtnBayar').textContent = keranjang.length ? 'Bayar ' + App.rupiah(h.total) : 'Bayar';
    $('#kBtnBayar').disabled = proses || !keranjang.length || (tunai && h.bayar < h.total);

    if (h.total !== totalTerakhir) {
      totalTerakhir = h.total;
      renderCepat(h.total);
    }
  }

  async function bayar() {
    if (proses || !keranjang.length) return;
    const h = hitung();
    if (h.metode === 'tunai' && h.bayar < h.total) return;

    proses = true;
    updateTotals();
    try {
      const data = {
        items: keranjang.map((i) => ({ produkId: i.produkId, nama: i.nama, harga: i.harga, jumlah: i.jumlah })),
        diskon: h.diskon,
        bayar: h.bayar,
        metode: h.metode,
        kasir: (App.setelan && App.setelan.namaKasir) || ''
      };
      const t = await DB.simpanTransaksi(data);

      keranjang = [];
      simpanKeranjang();
      $('#kDiskon').value = '';
      $('#kBayar').value = '';
      $('#kMetode').value = 'tunai';
      totalTerakhir = -1;
      proses = false;
      renderKeranjang();
      tampilNota(t);
    } catch (err) {
      proses = false;
      updateTotals();
      App.toast('Gagal menyimpan: ' + (err.message || err), 'gagal', 4000);
    }
  }

  /* =========================================================
     NOTA
     ========================================================= */
  const NAMA_METODE = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer' };
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('id-ID');

  function notaHtml(t) {
    const s = App.setelan || {};
    const lebar = s.lebarKertas === '80' ? '302px' : '219px';
    const baris = (a, b, tebal) =>
      '<div class="baris"' + (tebal ? ' style="font-weight:bold"' : '') + '><span>' + a + '</span><span>' + b + '</span></div>';

    let h = '<div class="nota" id="notaCetak" style="max-width:' + lebar + ';margin:0 auto">';
    h += '<div class="tengah"><b>' + App.esc(s.namaToko || 'Vinki Toko') + '</b></div>';
    if (s.alamatToko) h += '<div class="tengah">' + App.esc(s.alamatToko) + '</div>';
    h += '<hr><div>' + App.esc(t.noNota) + '</div><div>' + App.esc(App.tgl(t.tanggal)) + '</div>';
    if (t.kasir) h += '<div>Kasir: ' + App.esc(t.kasir) + '</div>';
    h += '<hr>';
    t.items.forEach((i) => {
      h += '<div>' + App.esc(i.nama) + '</div>' + baris(i.jumlah + ' x ' + fmt(i.harga), fmt(i.subtotal));
    });
    h += '<hr>';
    if (t.diskon > 0) {
      h += baris('Subtotal', fmt(t.subtotal));
      h += baris('Diskon', '-' + fmt(t.diskon));
    }
    h += baris('TOTAL', fmt(t.total), true);
    if (t.metode === 'tunai') {
      h += baris('Bayar', fmt(t.bayar));
      h += baris('Kembali', fmt(t.kembalian));
    } else {
      h += baris('Bayar', App.esc(NAMA_METODE[t.metode] || t.metode));
    }
    if (t.status === 'batal') h += '<hr><div class="tengah"><b>*** DIBATALKAN ***</b></div>';
    if (s.footerNota) h += '<hr><div class="tengah">' + App.esc(s.footerNota) + '</div>';
    h += '</div>';
    return h;
  }

  function notaTeks(t) {
    const s = App.setelan || {};
    let x = (s.namaToko || 'Vinki Toko') + '\n';
    if (s.alamatToko) x += s.alamatToko + '\n';
    x += '------------------------\n' + t.noNota + '\n' + App.tgl(t.tanggal) + '\n------------------------\n';
    t.items.forEach((i) => { x += i.nama + '\n' + i.jumlah + ' x ' + fmt(i.harga) + ' = ' + fmt(i.subtotal) + '\n'; });
    x += '------------------------\n';
    if (t.diskon > 0) x += 'Diskon: -' + fmt(t.diskon) + '\n';
    x += 'TOTAL: Rp ' + fmt(t.total) + '\n';
    if (t.metode === 'tunai') x += 'Bayar: Rp ' + fmt(t.bayar) + '\nKembali: Rp ' + fmt(t.kembalian) + '\n';
    if (s.footerNota) x += '\n' + s.footerNota;
    return x;
  }

  function tampilNota(t) {
    const judul = t.status === 'batal' ? 'Nota (dibatalkan)' : 'Transaksi Berhasil';
    App.modalUmum(judul,
      notaHtml(t) +
      '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
      '<button class="btn utama" style="flex:1" id="nCetak" type="button">Cetak</button>' +
      '<button class="btn" style="flex:1" id="nWa" type="button">WhatsApp</button>' +
      '<button class="btn hijau" style="flex:1" data-tutup="modalUmum" type="button">Selesai</button>' +
      '</div>');

    const cetak = $('#nCetak');
    if (cetak) cetak.addEventListener('click', () => window.print());
    const wa = $('#nWa');
    if (wa) wa.addEventListener('click', () => {
      window.open('https://wa.me/?text=' + encodeURIComponent(notaTeks(t)), '_blank');
    });
  }

  /* =========================================================
     FOKUS & MODE SCANNER ALAT
     ========================================================= */
  function fokus() {
    if (App.halaman() !== 'transaksi') return;
    const ada = document.querySelector('.modal:not([hidden])');
    if (ada) return;
    const pcPointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (modeAlat || pcPointer) $('#kInput').focus({ preventScroll: true });
  }

  function terapkanModeAlat() {
    $('#kInput').setAttribute('inputmode', modeAlat ? 'none' : 'text');
    const b = $('#kBtnAlat');
    b.textContent = 'Scanner alat: ' + (modeAlat ? 'Nyala' : 'Mati');
    b.classList.toggle('utama', modeAlat);
  }

  function bersihkanInput() {
    $('#kInput').value = '';
    renderCari();
  }

  /* =========================================================
     PASANG PENGAIT
     ========================================================= */
  function pasang() {
    const input = $('#kInput');

    input.addEventListener('input', renderCari);
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;

      const p = await DB.cariBarcode(q);
      if (p) {
        tambah(p, 1);
      } else if (/^\d{6,}$/.test(q)) {
        bersihkanInput();
        tidakKetemu(q);
        return;
      } else {
        const hasil = cariNama(q);
        if (hasil.length) tambah(hasil[0], 1);
        else App.toast('Produk tidak ditemukan', 'gagal');
      }
      bersihkanInput();
      fokus();
    });

    $('#kBtnKamera').addEventListener('click', () => {
      if (!window.Scanner || !Scanner.mulai) {
        App.toast('Scanner kamera belum siap', 'gagal');
        return;
      }
      Scanner.mulai((kode) => { tambahKode(kode); });
    });

    $('#kBtnAlat').addEventListener('click', () => {
      modeAlat = !modeAlat;
      try { localStorage.setItem(KUNCI_ALAT, modeAlat ? '1' : '0'); } catch (e) { /* abaikan */ }
      terapkanModeAlat();
      if (modeAlat) { App.toast('Mode scanner alat nyala', 'sukses'); fokus(); }
    });

    $('#kBtnKosong').addEventListener('click', async () => {
      if (!keranjang.length) return;
      const ya = await App.konfirmasi('Kosongkan keranjang?');
      if (!ya) return;
      keranjang = [];
      simpanKeranjang();
      renderKeranjang();
      fokus();
    });

    $('#kDiskon').addEventListener('input', updateTotals);
    $('#kBayar').addEventListener('input', updateTotals);
    $('#kBayar').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!$('#kBtnBayar').disabled) bayar();
      }
    });
    $('#kMetode').addEventListener('change', () => { totalTerakhir = -1; updateTotals(); });
    $('#kBtnBayar').addEventListener('click', bayar);

    // Satu pendengar klik untuk semua tombol di dalam layar kasir
    wadah.addEventListener('click', (e) => {
      const fav = e.target.closest('.fav-tombol');
      if (fav) {
        const p = produkMap.get(Number(fav.dataset.id));
        if (p) tambah(p, 1);
        fokus();
        return;
      }

      const hasil = e.target.closest('#kCari .produk-item');
      if (hasil) {
        const p = produkMap.get(Number(hasil.dataset.id));
        if (p) tambah(p, 1);
        bersihkanInput();
        fokus();
        return;
      }

      const aksi = e.target.closest('[data-aksi]');
      if (!aksi) return;
      const a = aksi.dataset.aksi;

      if (a === 'cepat') {
        const h = hitung();
        $('#kBayar').value = aksi.dataset.nilai === 'pas' ? h.total : aksi.dataset.nilai;
        updateTotals();
        return;
      }

      const baris = aksi.closest('.keranjang-item');
      if (!baris) return;
      const idx = Number(baris.dataset.i);
      const item = keranjang[idx];
      if (!item) return;

      if (a === 'plus') {
        item.jumlah += 1;
      } else if (a === 'kurang') {
        item.jumlah -= 1;
        if (item.jumlah <= 0) keranjang.splice(idx, 1);
      } else if (a === 'hapus') {
        keranjang.splice(idx, 1);
      } else if (a === 'ubah') {
        const v = window.prompt('Jumlah untuk ' + item.nama + ':', String(item.jumlah));
        if (v === null) return;
        const n = Math.floor(Number(v));
        if (!isFinite(n) || n < 0) { App.toast('Jumlah tidak valid', 'gagal'); return; }
        if (n === 0) keranjang.splice(idx, 1);
        else item.jumlah = n;
      }
      simpanKeranjang();
      renderKeranjang();
    });

    // Mode scanner alat: kolom scan selalu kembali aktif
    document.addEventListener('click', () => {
      if (!modeAlat || App.halaman() !== 'transaksi') return;
      setTimeout(() => {
        const a = document.activeElement;
        if (!a || a === document.body) fokus();
      }, 60);
    });

    window.addEventListener('modal-tutup', () => setTimeout(fokus, 80));

    window.addEventListener('halaman-berubah', (e) => {
      if (e.detail && e.detail.halaman === 'transaksi') {
        muatProduk();
        setTimeout(fokus, 80);
      }
    });

    window.addEventListener('db-berubah', (e) => {
      const st = e.detail && e.detail.store;
      if (st === 'produk' || st === 'semua') muatProduk();
    });
  }

  /* ---------- Mulai ---------- */
  muatKeranjang();
  try { modeAlat = localStorage.getItem(KUNCI_ALAT) === '1'; } catch (e) { modeAlat = false; }
  terapkanModeAlat();
  pasang();
  renderKeranjang();
  App.siap.then(muatProduk);

  /* ---------- Buka ke luar ---------- */
  window.Kasir = {
    tampilNota: tampilNota,
    notaHtml: notaHtml,
    muat: muatProduk
  };
})();