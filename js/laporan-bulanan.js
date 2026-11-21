/* =========================================================
   VINKI TOKO - js/laporan-bulanan.js
   Unduh laporan per bulan: Excel (.xlsx) dan PDF.
   ========================================================= */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const dua = (n) => String(n).padStart(2, '0');
  const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const METODE = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer' };
  const FORMAT_UANG = '"Rp" #,##0';

  const wadah = $('#laporanWadah');
  if (!wadah) return;

  function ymd(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-' + dua(d.getMonth() + 1) + '-' + dua(d.getDate());
  }
  function waktu(ms) {
    const d = new Date(ms);
    return ymd(ms) + ' ' + dua(d.getHours()) + ':' + dua(d.getMinutes());
  }
  function rp(n) { return App.rupiah(n); }
  function toko() { return (App.setelan && App.setelan.namaToko) || 'Vinki Toko'; }

  /* ---------- Kartu pilihan bulan ---------- */
  function bangunKartu() {
    const sekarang = new Date();
    let opsi = '';
    for (let i = 0; i < 12; i++) {
      const d = new Date(sekarang.getFullYear(), sekarang.getMonth() - i, 1);
      const nilai = d.getFullYear() + '-' + dua(d.getMonth() + 1);
      opsi += '<option value="' + nilai + '">' + NAMA_BULAN[d.getMonth()] + ' ' + d.getFullYear() + '</option>';
    }
    const k = document.createElement('div');
    k.className = 'kartu';
    k.style.marginBottom = '14px';
    k.innerHTML =
      '<div class="kartu-kepala"><h2>Unduh Laporan Bulanan</h2></div>' +
      '<div class="field"><label for="lbBulan">Pilih bulan</label><select id="lbBulan">' + opsi + '</select></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn utama" style="flex:1" id="lbExcel" type="button">Unduh Excel</button>' +
      '<button class="btn" style="flex:1" id="lbPdf" type="button">Simpan PDF</button></div>' +
      '<p style="color:var(--teks-pudar);font-size:12px;margin-top:10px">Excel berisi 6 sheet (ringkasan, transaksi, rincian barang, per produk, stok, barang masuk). Untuk PDF, di jendela cetak pilih <b>Simpan sebagai PDF</b>.</p>';
    wadah.insertBefore(k, wadah.firstChild);
    $('#lbExcel').addEventListener('click', () => jalankan('excel'));
    $('#lbPdf').addEventListener('click', () => jalankan('pdf'));
  }

  /* ---------- Ambil & hitung data satu bulan ---------- */
  async function ambilData(kunci) {
    const p = kunci.split('-').map(Number);
    const dari = new Date(p[0], p[1] - 1, 1).getTime();
    const sampai = new Date(p[0], p[1], 0, 23, 59, 59, 999).getTime();
    const judul = NAMA_BULAN[p[1] - 1] + ' ' + p[0];

    const semua = (await DB.transaksiRentang(dari, sampai, true)).sort((a, b) => a.tanggal - b.tanggal);
    const aktif = semua.filter((t) => t.status !== 'batal');
    const produk = await DB.semuaProduk();
    const ekspor = await DB.eksporSemua();
    const masuk = (ekspor.data.masuk || []).filter((m) => m.tanggal >= dari && m.tanggal <= sampai).sort((a, b) => a.tanggal - b.tanggal);

    let omset = 0, modal = 0, barang = 0;
    const metode = new Map(), perProduk = new Map(), perHari = new Map();
    aktif.forEach((t) => {
      omset += t.total;
      t.items.forEach((i) => {
        barang += i.jumlah;
        const m = (i.hargaBeli || 0) * i.jumlah;
        modal += m;
        const x = perProduk.get(i.nama) || { jumlah: 0, omset: 0, modal: 0 };
        x.jumlah += i.jumlah; x.omset += i.subtotal; x.modal += m;
        perProduk.set(i.nama, x);
      });
      const me = metode.get(t.metode) || { n: 0, total: 0 };
      me.n++; me.total += t.total; metode.set(t.metode, me);
      const k = ymd(t.tanggal);
      const h = perHari.get(k) || { n: 0, total: 0 };
      h.n++; h.total += t.total; perHari.set(k, h);
    });

    return {
      kunci: kunci, judul: judul, semua: semua, aktif: aktif, produk: produk, masuk: masuk,
      omset: omset, modal: modal, laba: omset - modal, barang: barang,
      rata: aktif.length ? omset / aktif.length : 0,
      batal: semua.length - aktif.length,
      metode: Array.from(metode.entries()),
      perProduk: Array.from(perProduk.entries()).sort((a, b) => b[1].jumlah - a[1].jumlah),
      perHari: Array.from(perHari.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))
    };
  }

  /* =========================================================
     EXCEL
     ========================================================= */
  function muatXlsx() {
    return new Promise((ok, gagal) => {
      if (window.XLSX) { ok(); return; }
      const s = document.createElement('script');
      s.src = 'js/xlsx.full.min.js';
      s.onload = () => ok();
      s.onerror = () => gagal(new Error('Pustaka Excel belum ada. Buka app dengan internet sekali lalu coba lagi.'));
      document.head.appendChild(s);
    });
  }

  function buatSheet(aoa, kolomUang, lebarMin) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const lebar = [];
    aoa.forEach((baris) => baris.forEach((v, c) => {
      const panjang = String(v === null || v === undefined ? '' : v).length;
      lebar[c] = Math.max(lebar[c] || (lebarMin || 8), Math.min(panjang + 2, 60));
    }));
    ws['!cols'] = lebar.map((w) => ({ wch: w }));
    Object.keys(ws).forEach((alamat) => {
      if (alamat.charAt(0) === '!') return;
      const sel = ws[alamat];
      if (sel.t !== 'n') return;
      const c = XLSX.utils.decode_cell(alamat).c;
      if (kolomUang.indexOf(c) !== -1) sel.z = FORMAT_UANG;
      else sel.z = '#,##0';
    });
    return ws;
  }

  async function buatExcel(d) {
    await muatXlsx();
    const wb = XLSX.utils.book_new();

    // 1. Ringkasan
    const r = [
      ['Laporan Penjualan', toko()],
      ['Periode', d.judul],
      ['Dibuat', waktu(Date.now())],
      [],
      ['RINGKASAN', ''],
      ['Omset', d.omset],
      ['Modal barang terjual', d.modal],
      ['Laba kotor', d.laba],
      ['Jumlah transaksi', d.aktif.length],
      ['Barang terjual (pcs)', d.barang],
      ['Rata-rata per transaksi', Math.round(d.rata)],
      ['Transaksi dibatalkan (tidak dihitung)', d.batal],
      [],
      ['PER METODE BAYAR', '', ''],
      ['Metode', 'Transaksi', 'Total']
    ];
    d.metode.forEach((x) => r.push([METODE[x[0]] || x[0], x[1].n, x[1].total]));
    const wsR = buatSheet(r, [1, 2], 10);
    ['B6', 'B7', 'B8', 'B11'].forEach((a) => { if (wsR[a]) wsR[a].z = FORMAT_UANG; });
    ['B9', 'B10', 'B12'].forEach((a) => { if (wsR[a]) wsR[a].z = '#,##0'; });
    wsR['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsR, 'Ringkasan');

    // 2. Transaksi
    const t = [['No Nota', 'Tanggal', 'Kasir', 'Metode', 'Status', 'Barang', 'Subtotal', 'Diskon', 'Total', 'Bayar', 'Kembalian']];
    d.semua.forEach((x) => t.push([
      x.noNota, waktu(x.tanggal), x.kasir || '', METODE[x.metode] || x.metode,
      x.status === 'batal' ? 'Batal' : 'Selesai',
      x.items.map((i) => i.nama + ' x' + i.jumlah).join('; '),
      x.subtotal, x.diskon, x.total, x.bayar, x.kembalian
    ]));
    XLSX.utils.book_append_sheet(wb, buatSheet(t, [6, 7, 8, 9, 10]), 'Transaksi');

    // 3. Rincian Barang (hanya transaksi selesai)
    const b = [['Tanggal', 'No Nota', 'Produk', 'Jumlah', 'Harga', 'Subtotal']];
    d.aktif.forEach((x) => x.items.forEach((i) => b.push([waktu(x.tanggal), x.noNota, i.nama, i.jumlah, i.harga, i.subtotal])));
    XLSX.utils.book_append_sheet(wb, buatSheet(b, [4, 5]), 'Rincian Barang');

    // 4. Per Produk
    const pp = [['Produk', 'Terjual (pcs)', 'Omset', 'Modal', 'Laba kotor']];
    d.perProduk.forEach((x) => pp.push([x[0], x[1].jumlah, x[1].omset, x[1].modal, x[1].omset - x[1].modal]));
    XLSX.utils.book_append_sheet(wb, buatSheet(pp, [2, 3, 4]), 'Per Produk');

    // 5. Stok Saat Ini
    const st = [['Produk', 'Barcode', 'Stok', 'Satuan', 'Harga beli', 'Harga jual', 'Nilai modal stok']];
    let nilaiTotal = 0;
    d.produk.forEach((p) => {
      const nilai = (p.stok || 0) * (p.hargaBeli || 0);
      nilaiTotal += nilai;
      st.push([p.nama, p.barcode || '', p.stok, p.satuan, p.hargaBeli, p.hargaJual, nilai]);
    });
    st.push(['TOTAL', '', '', '', '', '', nilaiTotal]);
    XLSX.utils.book_append_sheet(wb, buatSheet(st, [4, 5, 6]), 'Stok Saat Ini');

    // 6. Barang Masuk
    const m = [['Tanggal', 'Produk', 'Jumlah', 'Harga beli', 'Total', 'Catatan']];
    d.masuk.forEach((x) => x.items.forEach((i) => m.push([waktu(x.tanggal), i.nama, i.jumlah, i.hargaBeli, i.jumlah * i.hargaBeli, x.catatan || ''])));
    XLSX.utils.book_append_sheet(wb, buatSheet(m, [3, 4]), 'Barang Masuk');

    const nama = 'Vinki-Toko-' + d.kunci + '.xlsx';
    XLSX.writeFile(wb, nama);
    return nama;
  }

  /* =========================================================
     PDF (lewat jendela cetak: Simpan sebagai PDF)
     ========================================================= */
  function buatPdf(d) {
    const lama = $('#cetakLaporan');
    if (lama) lama.remove();
    const e = App.esc;

    let h = '<h1>Laporan Penjualan ' + e(d.judul) + '</h1>';
    h += '<p class="lp-sub">' + e(toko()) + ' &middot; dibuat ' + e(waktu(Date.now())) + '</p>';

    h += '<table class="lp-ring"><tr>' +
      '<td><small>Omset</small><b>' + rp(d.omset) + '</b></td>' +
      '<td><small>Laba kotor</small><b>' + rp(d.laba) + '</b></td>' +
      '<td><small>Transaksi</small><b>' + d.aktif.length + '</b></td>' +
      '<td><small>Barang terjual</small><b>' + d.barang.toLocaleString('id-ID') + ' pcs</b></td>' +
      '<td><small>Rata-rata</small><b>' + rp(d.rata) + '</b></td></tr></table>';
    if (d.batal) h += '<p class="lp-sub">' + d.batal + ' transaksi dibatalkan dan tidak dihitung.</p>';

    h += '<h2>Per Metode Bayar</h2><table class="lp-tabel"><tr><th>Metode</th><th class="kn">Transaksi</th><th class="kn">Total</th></tr>';
    d.metode.forEach((x) => { h += '<tr><td>' + e(METODE[x[0]] || x[0]) + '</td><td class="kn">' + x[1].n + '</td><td class="kn">' + rp(x[1].total) + '</td></tr>'; });
    h += '</table>';

    h += '<h2>Produk Terlaris</h2><table class="lp-tabel"><tr><th>Produk</th><th class="kn">Terjual</th><th class="kn">Omset</th></tr>';
    d.perProduk.slice(0, 15).forEach((x, i) => { h += '<tr><td>' + (i + 1) + '. ' + e(x[0]) + '</td><td class="kn">' + x[1].jumlah + '</td><td class="kn">' + rp(x[1].omset) + '</td></tr>'; });
    h += '</table>';

    h += '<h2>Penjualan Per Hari</h2><table class="lp-tabel"><tr><th>Tanggal</th><th class="kn">Transaksi</th><th class="kn">Omset</th></tr>';
    d.perHari.forEach((x) => {
      const p = x[0].split('-').map(Number);
      h += '<tr><td>' + e(App.tgl(new Date(p[0], p[1] - 1, p[2]).getTime(), false)) + '</td><td class="kn">' + x[1].n + '</td><td class="kn">' + rp(x[1].total) + '</td></tr>';
    });
    h += '</table>';

    h += '<h2>Daftar Transaksi</h2><table class="lp-tabel"><tr><th>No Nota</th><th>Tanggal</th><th>Metode</th><th>Barang</th><th class="kn">Total</th></tr>';
    d.semua.forEach((x) => {
      const batal = x.status === 'batal';
      h += '<tr' + (batal ? ' class="batal"' : '') + '><td>' + e(x.noNota) + '</td><td>' + e(waktu(x.tanggal)) + '</td><td>' + e(METODE[x.metode] || x.metode) + (batal ? ' (Batal)' : '') + '</td>' +
        '<td>' + e(x.items.map((i) => i.nama + ' x' + i.jumlah).join(', ')) + '</td><td class="kn">' + rp(x.total) + '</td></tr>';
    });
    h += '</table>';

    const div = document.createElement('div');
    div.id = 'cetakLaporan';
    div.innerHTML = h;
    document.body.appendChild(div);

    document.body.classList.add('cetak-laporan');
    const bersih = () => {
      document.body.classList.remove('cetak-laporan');
      window.removeEventListener('afterprint', bersih);
    };
    window.addEventListener('afterprint', bersih);
    setTimeout(bersih, 60000);
    setTimeout(() => window.print(), 150);
  }

  /* ---------- Tombol ---------- */
  async function jalankan(jenis) {
    const tombol = jenis === 'excel' ? $('#lbExcel') : $('#lbPdf');
    const teksAsli = tombol.textContent;
    tombol.disabled = true;
    tombol.textContent = 'Memproses...';
    try {
      const d = await ambilData($('#lbBulan').value);
      if (!d.semua.length) {
        App.toast('Tidak ada penjualan pada ' + d.judul, 'gagal', 3000);
      } else if (jenis === 'excel') {
        const nama = await buatExcel(d);
        App.toast('Excel diunduh: ' + nama, 'sukses', 4000);
      } else {
        buatPdf(d);
      }
    } catch (err) {
      App.toast(err.message || 'Gagal membuat laporan', 'gagal', 4500);
    }
    tombol.disabled = false;
    tombol.textContent = teksAsli;
  }

  bangunKartu();
})();