/* =========================================================
   VINKI TOKO - js/riwayat.js
   Halaman Riwayat, Barang Masuk, dan Laporan.
   ========================================================= */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const dua = (n) => String(n).padStart(2, '0');
  const NAMA_METODE = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer' };

  function ymd(d) { return d.getFullYear() + '-' + dua(d.getMonth() + 1) + '-' + dua(d.getDate()); }
  function dariYmd(s, akhir) {
    const p = s.split('-').map(Number);
    return akhir ? new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999).getTime() : new Date(p[0], p[1] - 1, p[2]).getTime();
  }
  function hariLalu(n) {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
  }
  function jml(n) { return Math.round(Number(n) || 0).toLocaleString('id-ID'); }

  /* =========================================================
     RIWAYAT
     ========================================================= */
  const wR = $('#riwayatWadah');
  let rDari = ymd(new Date());
  let rSampai = rDari;

  function bangunRiwayat() {
    wR.innerHTML =
      '<div class="kartu" style="margin-bottom:14px">' +
      '<div class="tab-baris" id="rCepat">' +
      '<button type="button" data-cepat="0">Hari ini</button>' +
      '<button type="button" data-cepat="1">Kemarin</button>' +
      '<button type="button" data-cepat="7">7 hari</button>' +
      '<button type="button" data-cepat="30">30 hari</button></div>' +
      '<div class="baris-2">' +
      '<div class="field" style="margin:0"><label for="rDari">Dari</label><input type="date" id="rDari"></div>' +
      '<div class="field" style="margin:0"><label for="rSampai">Sampai</label><input type="date" id="rSampai"></div>' +
      '</div></div>' +
      '<div id="rRingkas"></div><div id="rDaftar"></div>';

    $('#rDari').value = rDari;
    $('#rSampai').value = rSampai;

    $('#rCepat').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cepat]');
      if (!b) return;
      const n = Number(b.dataset.cepat);
      if (n === 0) { rDari = rSampai = ymd(new Date()); }
      else if (n === 1) { rDari = rSampai = ymd(hariLalu(1)); }
      else { rDari = ymd(hariLalu(n - 1)); rSampai = ymd(new Date()); }
      $('#rDari').value = rDari;
      $('#rSampai').value = rSampai;
      muatRiwayat();
    });

    const ubah = () => {
      const a = $('#rDari').value;
      const b = $('#rSampai').value;
      if (!a || !b) return;
      rDari = a; rSampai = b;
      muatRiwayat();
    };
    $('#rDari').addEventListener('change', ubah);
    $('#rSampai').addEventListener('change', ubah);

    $('#rDaftar').addEventListener('click', async (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      const t = await DB.ambilTransaksi(Number(li.dataset.id));
      if (t) tampilDetail(t);
    });
  }

  async function muatRiwayat() {
    if (!$('#rDaftar')) return;
    if (dariYmd(rDari) > dariYmd(rSampai, true)) {
      $('#rRingkas').innerHTML = '';
      $('#rDaftar').innerHTML = '<div class="kartu k-kosong" style="text-align:center;color:var(--teks-pudar);padding:22px">Tanggal "Dari" harus sebelum "Sampai"</div>';
      return;
    }
    let daftar = [];
    try {
      daftar = await DB.transaksiRentang(dariYmd(rDari), dariYmd(rSampai, true), true);
    } catch (e) { daftar = []; }
    daftar.sort((a, b) => b.tanggal - a.tanggal);

    const aktif = daftar.filter((t) => t.status !== 'batal');
    let omset = 0;
    aktif.forEach((t) => { omset += t.total; });
    const batal = daftar.length - aktif.length;

    $('#rRingkas').innerHTML =
      '<p style="margin-bottom:10px;color:var(--teks-pudar);font-size:13px">' +
      '<b style="color:var(--teks)">' + aktif.length + '</b> transaksi &middot; omset <b style="color:var(--teks)">' + App.rupiah(omset) + '</b>' +
      (batal ? ' &middot; ' + batal + ' dibatalkan' : '') + '</p>';

    if (!daftar.length) {
      $('#rDaftar').innerHTML = '<div class="kartu" style="text-align:center;color:var(--teks-pudar);padding:24px">Tidak ada transaksi pada tanggal ini</div>';
      return;
    }

    const tampil = daftar.slice(0, 150);
    let html = '<div class="kartu"><ul class="daftar">';
    tampil.forEach((t) => {
      const b = t.status === 'batal';
      const ringkas = t.items.map((i) => i.nama + ' x' + i.jumlah).join(', ');
      html += '<li data-id="' + t.id + '" style="cursor:pointer">' +
        '<div class="kiri"><b>' + App.esc(t.noNota) + '</b>' +
        '<small>' + App.esc(App.tgl(t.tanggal)) + ' &middot; ' + App.esc(NAMA_METODE[t.metode] || t.metode) + '</small>' +
        '<small style="display:block;max-width:60vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + App.esc(ringkas) + '</small></div>' +
        '<div class="kanan"' + (b ? ' style="text-decoration:line-through;opacity:.6"' : '') + '>' + App.rupiah(t.total) + '<br>' +
        '<span class="label ' + (b ? 'merah' : 'hijau') + '">' + (b ? 'Batal' : 'Sukses') + '</span></div></li>';
    });
    html += '</ul>';
    if (daftar.length > tampil.length) {
      html += '<p style="text-align:center;color:var(--teks-pudar);font-size:12px;margin-top:8px">Menampilkan 150 transaksi terbaru. Persempit tanggalnya untuk melihat yang lain.</p>';
    }
    html += '</div>';
    $('#rDaftar').innerHTML = html;
  }

  function tampilDetail(t) {
    const bisaBatal = t.status !== 'batal';
    App.modalUmum('Detail Transaksi',
      (window.Kasir && Kasir.notaHtml ? Kasir.notaHtml(t) : '<p>Nota tidak tersedia</p>') +
      '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
      '<button class="btn utama" style="flex:1" id="dCetak" type="button">Cetak</button>' +
      (bisaBatal ? '<button class="btn bahaya" style="flex:1" id="dBatal" type="button">Batalkan</button>' : '') +
      '<button class="btn" style="flex:1" data-tutup="modalUmum" type="button">Tutup</button></div>' +
      (bisaBatal ? '<p style="color:var(--teks-pudar);font-size:12px;margin-top:8px">Membatalkan akan mengembalikan stok barang di nota ini.</p>' : ''));

    $('#dCetak').addEventListener('click', () => window.print());
    const bt = $('#dBatal');
    if (bt) bt.addEventListener('click', async () => {
      const ya = await App.konfirmasi('Batalkan transaksi ' + t.noNota + '? Stok akan dikembalikan.');
      if (!ya) return;
      try {
        await DB.batalkanTransaksi(t.id);
        App.tutupModal('modalUmum');
        App.toast('Transaksi dibatalkan, stok dikembalikan', 'sukses');
      } catch (err) {
        App.toast(err.message || 'Gagal membatalkan', 'gagal', 4000);
      }
    });
  }

  /* =========================================================
     BARANG MASUK
     ========================================================= */
  const wM = $('#masukWadah');
  let masuk = [];      // { produkId, nama, jumlah, hargaBeli }
  let semuaP = [];

  async function muatP() {
    try { semuaP = await DB.semuaProduk(); } catch (e) { semuaP = []; }
    renderHasilCari();
  }

  function bangunMasuk() {
    wM.innerHTML =
      '<div class="kartu" style="margin-bottom:14px">' +
      '<div class="kartu-kepala"><h2>Tambah Stok</h2></div>' +
      '<div class="kasir-scan" style="margin-bottom:8px">' +
      '<input id="mCari" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Scan barcode atau ketik nama produk">' +
      '<button class="btn utama" id="mKamera" type="button">Kamera</button></div>' +
      '<small style="color:var(--teks-pudar)">Tekan Enter setelah scan atau ketik. Scan produk yang sama lagi menambah 1.</small>' +
      '<div id="mHasil" style="margin-top:10px;display:grid;gap:8px"></div></div>' +

      '<div class="kartu" style="margin-bottom:14px">' +
      '<div class="kartu-kepala"><h2>Barang yang masuk <span id="mJml" style="color:var(--teks-pudar);font-size:13px;font-weight:600">0 jenis</span></h2>' +
      '<button class="btn kecil bahaya" id="mKosong" type="button">Kosongkan</button></div>' +
      '<div id="mItems"></div>' +
      '<div class="field" style="margin-top:12px"><label for="mCatatan">Catatan (boleh kosong)</label>' +
      '<input id="mCatatan" maxlength="80" placeholder="Contoh: Belanja grosir pasar"></div>' +
      '<div class="total-besar"><span>Total modal</span><b id="mTotal">Rp 0</b></div>' +
      '<button class="btn hijau besar penuh" id="mSimpan" type="button" disabled>Simpan Barang Masuk</button></div>' +

      '<div class="kartu"><div class="kartu-kepala"><h2>Riwayat Barang Masuk</h2></div>' +
      '<ul class="daftar" id="mRiwayat"><li class="kosong">Belum ada</li></ul></div>';

    const cari = $('#mCari');
    cari.addEventListener('input', renderHasilCari);
    cari.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = cari.value.trim();
      if (!q) return;
      let p = await DB.cariBarcode(q);
      if (!p) {
        const h = cariNama(q);
        p = h.length ? h[0] : null;
      }
      if (p) tambahMasuk(p);
      else App.toast('Produk tidak ditemukan. Daftarkan dulu di menu Stok.', 'gagal', 3000);
      cari.value = '';
      renderHasilCari();
      cari.focus();
    });

    $('#mKamera').addEventListener('click', () => {
      if (!window.Scanner || !Scanner.mulai) { App.toast('Scanner kamera belum siap', 'gagal'); return; }
      Scanner.mulai(async (kode) => {
        const p = await DB.cariBarcode(kode);
        if (p) tambahMasuk(p);
        else App.toast('Barcode ' + kode + ' belum terdaftar', 'gagal', 2500);
      }, { terus: true });
    });

    $('#mHasil').addEventListener('click', (e) => {
      const it = e.target.closest('.produk-item');
      if (!it) return;
      const p = semuaP.find((x) => x.id === Number(it.dataset.id));
      if (p) tambahMasuk(p);
      cari.value = '';
      renderHasilCari();
      cari.focus();
    });

    $('#mItems').addEventListener('input', (e) => {
      const f = e.target.dataset.f;
      if (!f) return;
      const idx = Number(e.target.closest('.keranjang-item').dataset.i);
      if (!masuk[idx]) return;
      masuk[idx][f] = Number(e.target.value) || 0;
      hitungMasuk();
    });
    $('#mItems').addEventListener('click', (e) => {
      const b = e.target.closest('[data-hapus]');
      if (!b) return;
      masuk.splice(Number(b.dataset.hapus), 1);
      renderItemsMasuk();
    });

    $('#mKosong').addEventListener('click', () => { masuk = []; renderItemsMasuk(); });
    $('#mSimpan').addEventListener('click', simpanMasuk);
    renderItemsMasuk();
  }

  function cariNama(q) {
    q = q.toLowerCase();
    return semuaP.filter((p) => p.nama.toLowerCase().indexOf(q) !== -1 || String(p.barcode).indexOf(q) !== -1);
  }

  function renderHasilCari() {
    const el = $('#mHasil');
    const inp = $('#mCari');
    if (!el || !inp) return;
    const q = inp.value.trim();
    if (!q) { el.innerHTML = ''; return; }
    const h = cariNama(q).slice(0, 8);
    if (!h.length) { el.innerHTML = '<div style="text-align:center;color:var(--teks-pudar);padding:10px;font-size:14px">Tidak ada produk bernama itu</div>'; return; }
    el.innerHTML = h.map((p) =>
      '<div class="produk-item" data-id="' + p.id + '" role="button" tabindex="0" style="cursor:pointer">' +
      (p.foto ? '<img class="produk-foto" alt="" src="' + p.foto + '">' : '<span class="produk-foto">' + App.esc(p.nama.trim().charAt(0).toUpperCase()) + '</span>') +
      '<div class="produk-info"><b>' + App.esc(p.nama) + '</b><small>' + (p.barcode ? App.esc(p.barcode) : 'Tanpa barcode') + '</small></div>' +
      '<div class="produk-harga">Stok ' + App.esc(p.stok) + '<small>' + App.esc(p.satuan) + '</small></div></div>'
    ).join('');
  }

  function tambahMasuk(p) {
    const ada = masuk.find((i) => i.produkId === p.id);
    if (ada) ada.jumlah += 1;
    else masuk.push({ produkId: p.id, nama: p.nama, jumlah: 1, hargaBeli: p.hargaBeli || 0 });
    App.toast('+ ' + p.nama, '', 900);
    renderItemsMasuk();
  }

  function hitungMasuk() {
    let total = 0;
    masuk.forEach((i) => { total += (Number(i.jumlah) || 0) * (Number(i.hargaBeli) || 0); });
    $('#mTotal').textContent = App.rupiah(total);
    $('#mJml').textContent = masuk.length + ' jenis';
    $('#mSimpan').disabled = !masuk.length || masuk.some((i) => !(Number(i.jumlah) > 0));
  }

  function renderItemsMasuk() {
    const el = $('#mItems');
    if (!el) return;
    if (!masuk.length) {
      el.innerHTML = '<div style="text-align:center;color:var(--teks-pudar);padding:20px 8px;font-size:14px">Belum ada barang. Scan barcode atau cari nama produk di atas.</div>';
    } else {
      el.innerHTML = masuk.map((i, idx) =>
        '<div class="keranjang-item" data-i="' + idx + '">' +
        '<div class="nama"><b>' + App.esc(i.nama) + '</b>' +
        '<div style="display:flex;gap:8px;margin-top:6px">' +
        '<label style="font-size:11px;color:var(--teks-pudar)">Jumlah<br><input data-f="jumlah" type="number" inputmode="numeric" min="1" step="1" value="' + i.jumlah + '" style="width:80px;padding:7px;border-radius:10px;border:1px solid var(--garis);background:var(--kartu);color:var(--teks)"></label>' +
        '<label style="font-size:11px;color:var(--teks-pudar)">Harga beli/pcs<br><input data-f="hargaBeli" type="number" inputmode="numeric" min="0" step="1" value="' + i.hargaBeli + '" style="width:110px;padding:7px;border-radius:10px;border:1px solid var(--garis);background:var(--kartu);color:var(--teks)"></label>' +
        '</div></div>' +
        '<button type="button" class="icon-btn" data-hapus="' + idx + '" aria-label="Hapus" style="color:var(--merah);font-weight:800">&#10005;</button></div>'
      ).join('');
    }
    hitungMasuk();
  }

  async function simpanMasuk() {
    if (!masuk.length) return;
    const tombol = $('#mSimpan');
    tombol.disabled = true;
    try {
      await DB.simpanMasuk({
        items: masuk.map((i) => ({ produkId: i.produkId, jumlah: i.jumlah, hargaBeli: i.hargaBeli })),
        catatan: $('#mCatatan').value
      });
      masuk = [];
      $('#mCatatan').value = '';
      renderItemsMasuk();
      App.toast('Stok bertambah', 'sukses');
      await muatRiwayatMasuk();
    } catch (err) {
      App.toast(err.message || 'Gagal menyimpan', 'gagal', 4000);
      hitungMasuk();
    }
  }

  async function muatRiwayatMasuk() {
    const el = $('#mRiwayat');
    if (!el) return;
    let daftar = [];
    try { daftar = await DB.masukTerbaru(15); } catch (e) { daftar = []; }
    if (!daftar.length) { el.innerHTML = '<li class="kosong">Belum ada</li>'; return; }
    el.innerHTML = daftar.map((m) => {
      const total = m.items.reduce((s, i) => s + i.jumlah, 0);
      const nama = m.items.map((i) => i.nama + ' +' + i.jumlah).join(', ');
      return '<li><div class="kiri"><b>' + App.esc(App.tgl(m.tanggal)) + '</b>' +
        '<small style="display:block;max-width:62vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + App.esc(nama) + '</small>' +
        (m.catatan ? '<small>' + App.esc(m.catatan) + '</small>' : '') + '</div>' +
        '<div class="kanan">+' + total + ' pcs<br><small style="color:var(--teks-pudar)">' + App.rupiah(m.total) + '</small></div></li>';
    }).join('');
  }

  /* =========================================================
     LAPORAN
     ========================================================= */
  const wL = $('#laporanWadah');
  let lPeriode = '7';
  let lData = [];

  function bangunLaporan() {
    wL.innerHTML =
      '<div class="tab-baris" id="lTab">' +
      '<button type="button" data-p="0">Hari ini</button>' +
      '<button type="button" data-p="7">7 hari</button>' +
      '<button type="button" data-p="30">30 hari</button>' +
      '<button type="button" data-p="bln">Bulan ini</button></div>' +
      '<div id="lIsi"></div>';
    $('#lTab').addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      lPeriode = b.dataset.p;
      muatLaporan();
    });
    $('#lIsi').addEventListener('click', (e) => {
      if (e.target.closest('#lCsv')) unduhCsv();
    });
  }

  function rentangLaporan() {
    let dari;
    if (lPeriode === 'bln') { const d = new Date(); dari = new Date(d.getFullYear(), d.getMonth(), 1); }
    else dari = hariLalu(Number(lPeriode) === 0 ? 0 : Number(lPeriode) - 1);
    return { dari: dari.getTime(), sampai: Date.now() + 60000 };
  }

  async function muatLaporan() {
    if (!$('#lIsi')) return;
    document.querySelectorAll('#lTab button').forEach((b) => b.classList.toggle('aktif', b.dataset.p === lPeriode));

    const r = rentangLaporan();
    try { lData = await DB.transaksiRentang(r.dari, r.sampai, false); } catch (e) { lData = []; }
    lData.sort((a, b) => b.tanggal - a.tanggal);

    if (!lData.length) {
      $('#lIsi').innerHTML = '<div class="kartu" style="text-align:center;color:var(--teks-pudar);padding:28px">Belum ada penjualan pada periode ini</div>';
      return;
    }

    let omset = 0, modal = 0, barang = 0;
    const metode = new Map();
    const produk = new Map();
    const hari = new Map();

    lData.forEach((t) => {
      omset += t.total;
      let modalT = 0;
      t.items.forEach((i) => {
        barang += i.jumlah;
        modalT += (i.hargaBeli || 0) * i.jumlah;
        const p = produk.get(i.nama) || { jumlah: 0, omset: 0 };
        p.jumlah += i.jumlah;
        p.omset += i.subtotal;
        produk.set(i.nama, p);
      });
      modal += modalT;

      const m = metode.get(t.metode) || { n: 0, total: 0 };
      m.n += 1; m.total += t.total;
      metode.set(t.metode, m);

      const k = ymd(new Date(t.tanggal));
      const h = hari.get(k) || { n: 0, total: 0 };
      h.n += 1; h.total += t.total;
      hari.set(k, h);
    });

    const laba = omset - modal;
    const rata = omset / lData.length;
    const terlaris = Array.from(produk.entries()).sort((a, b) => b[1].jumlah - a[1].jumlah).slice(0, 10);
    const perHari = Array.from(hari.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));

    const kartu = (judul, nilai, kelas) =>
      '<div class="stat"><span class="stat-isi"><small>' + judul + '</small><b' + (kelas ? ' class="' + kelas + '"' : '') + '>' + nilai + '</b></span></div>';

    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px">' +
      kartu('Omset', App.rupiah(omset)) +
      kartu('Laba kotor', App.rupiah(laba)) +
      kartu('Transaksi', String(lData.length)) +
      kartu('Barang terjual', jml(barang) + ' pcs') +
      kartu('Rata-rata/transaksi', App.rupiah(rata)) + '</div>';

    html += '<p style="color:var(--teks-pudar);font-size:12px;margin-bottom:14px">Laba kotor = omset dikurangi harga beli barang yang terjual. Isi harga beli di menu Stok supaya laba akurat.</p>';

    html += '<div class="kartu" style="margin-bottom:14px"><div class="kartu-kepala"><h2>Per Metode Bayar</h2></div><div class="tabel-bungkus"><table class="tabel"><thead><tr><th>Metode</th><th class="kanan">Transaksi</th><th class="kanan">Total</th></tr></thead><tbody>';
    Array.from(metode.entries()).forEach((x) => {
      html += '<tr><td>' + App.esc(NAMA_METODE[x[0]] || x[0]) + '</td><td class="kanan">' + x[1].n + '</td><td class="kanan">' + App.rupiah(x[1].total) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';

    html += '<div class="kartu" style="margin-bottom:14px"><div class="kartu-kepala"><h2>Produk Terlaris</h2></div><div class="tabel-bungkus"><table class="tabel"><thead><tr><th>Produk</th><th class="kanan">Terjual</th><th class="kanan">Omset</th></tr></thead><tbody>';
    terlaris.forEach((x, idx) => {
      html += '<tr><td>' + (idx + 1) + '. ' + App.esc(x[0]) + '</td><td class="kanan">' + jml(x[1].jumlah) + '</td><td class="kanan">' + App.rupiah(x[1].omset) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';

    html += '<div class="kartu" style="margin-bottom:14px"><div class="kartu-kepala"><h2>Penjualan Per Hari</h2></div><div class="tabel-bungkus"><table class="tabel"><thead><tr><th>Tanggal</th><th class="kanan">Transaksi</th><th class="kanan">Omset</th></tr></thead><tbody>';
    perHari.forEach((x) => {
      const p = x[0].split('-').map(Number);
      html += '<tr><td>' + App.esc(App.tgl(new Date(p[0], p[1] - 1, p[2]).getTime(), false)) + '</td><td class="kanan">' + x[1].n + '</td><td class="kanan">' + App.rupiah(x[1].total) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';

    html += '<button class="btn penuh" id="lCsv" type="button">Unduh Laporan (CSV untuk Excel)</button>';
    $('#lIsi').innerHTML = html;
  }

  function unduhCsv() {
    if (!lData.length) return;
    const q = (v) => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
    const baris = [['No Nota', 'Tanggal', 'Kasir', 'Metode', 'Barang', 'Diskon', 'Total'].map(q).join(',')];
    lData.forEach((t) => {
      baris.push([
        t.noNota, App.tgl(t.tanggal), t.kasir || '', NAMA_METODE[t.metode] || t.metode,
        t.items.map((i) => i.nama + ' x' + i.jumlah).join('; '), t.diskon, t.total
      ].map(q).join(','));
    });
    const blob = new Blob(['\ufeff' + baris.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vinki-toko-laporan-' + ymd(new Date()) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    App.toast('Laporan diunduh', 'sukses');
  }

  /* =========================================================
     PENGAIT
     ========================================================= */
  function segarkanHalaman(h) {
    if (h === 'riwayat') muatRiwayat();
    else if (h === 'masuk') { muatP(); muatRiwayatMasuk(); }
    else if (h === 'laporan') muatLaporan();
  }

  bangunRiwayat();
  bangunMasuk();
  bangunLaporan();

  window.addEventListener('halaman-berubah', (e) => segarkanHalaman(e.detail && e.detail.halaman));

  window.addEventListener('db-berubah', (e) => {
    const st = e.detail && e.detail.store;
    const h = App.halaman();
    if (st === 'produk' || st === 'semua') muatP();
    if ((st === 'transaksi' || st === 'semua') && (h === 'riwayat' || h === 'laporan')) segarkanHalaman(h);
    if ((st === 'masuk' || st === 'semua') && h === 'masuk') muatRiwayatMasuk();
  });

  window.addEventListener('modal-tutup', (e) => {
    if (e.detail && e.detail.id === 'modalScanner' && App.halaman() === 'masuk') {
      const c = $('#mCari'); if (c) c.focus();
    }
  });

  App.siap.then(() => { muatP(); segarkanHalaman(App.halaman()); });

  window.Riwayat = { muat: muatRiwayat };
})();