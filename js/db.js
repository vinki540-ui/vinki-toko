/* =========================================================
   VINKI TOKO - js/db.js
   Database offline (IndexedDB): produk, transaksi, barang masuk,
   pengaturan, plus backup dan restore.
   Dipakai lewat objek global: DB
   ========================================================= */
(function () {
  'use strict';

  const NAMA_DB = 'vinki-toko';
  const VERSI_DB = 1;
  let dbPromise = null;

  /* ---------- Alat bantu kecil ---------- */
  function minta(req) {
    return new Promise((ok, gagal) => {
      req.onsuccess = () => ok(req.result);
      req.onerror = () => gagal(req.error);
    });
  }

  function selesai(tx) {
    return new Promise((ok, gagal) => {
      tx.oncomplete = () => ok();
      tx.onerror = () => gagal(tx.error);
      tx.onabort = () => gagal(tx.error || new Error('Transaksi database dibatalkan'));
    });
  }

  function angka(nilai, bawaan) {
    const n = Number(nilai);
    return isFinite(n) ? n : (bawaan === undefined ? 0 : bawaan);
  }

  function dua(n) { return String(n).padStart(2, '0'); }

  function kunciTanggal(ms) {
    const d = new Date(ms);
    return d.getFullYear() + dua(d.getMonth() + 1) + dua(d.getDate());
  }

  function kabari(namaStore) {
    try {
      window.dispatchEvent(new CustomEvent('db-berubah', { detail: { store: namaStore } }));
    } catch (e) { /* abaikan */ }
  }

  /* ---------- Buka database ---------- */
  function buka() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((ok, gagal) => {
      if (!window.indexedDB) {
        gagal(new Error('Browser ini tidak mendukung penyimpanan offline (IndexedDB).'));
        return;
      }
      const req = indexedDB.open(NAMA_DB, VERSI_DB);

      req.onupgradeneeded = () => {
        const db = req.result;

        if (!db.objectStoreNames.contains('produk')) {
          const s = db.createObjectStore('produk', { keyPath: 'id', autoIncrement: true });
          s.createIndex('barcode', 'barcode', { unique: false });
          s.createIndex('nama', 'nama', { unique: false });
        }
        if (!db.objectStoreNames.contains('transaksi')) {
          const s = db.createObjectStore('transaksi', { keyPath: 'id', autoIncrement: true });
          s.createIndex('tanggal', 'tanggal', { unique: false });
          s.createIndex('noNota', 'noNota', { unique: false });
        }
        if (!db.objectStoreNames.contains('masuk')) {
          const s = db.createObjectStore('masuk', { keyPath: 'id', autoIncrement: true });
          s.createIndex('tanggal', 'tanggal', { unique: false });
        }
        if (!db.objectStoreNames.contains('pengaturan')) {
          db.createObjectStore('pengaturan', { keyPath: 'kunci' });
        }
      };

      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        ok(db);
      };
      req.onerror = () => { dbPromise = null; gagal(req.error); };
      req.onblocked = () => { /* ada tab lama yang masih terbuka */ };
    });
    return dbPromise;
  }

  /* =========================================================
     PRODUK
     ========================================================= */
  function rapikanProduk(p, lama) {
    const d = Object.assign({}, lama || {}, p);
    d.nama = String(d.nama || '').trim();
    if (!d.nama) throw new Error('Nama produk wajib diisi');
    d.barcode = String(d.barcode || '').trim();
    d.hargaJual = angka(d.hargaJual);
    d.hargaBeli = angka(d.hargaBeli);
    d.stok = angka(d.stok);
    d.stokMin = angka(d.stokMin, 5);
    d.satuan = String(d.satuan || 'pcs').trim() || 'pcs';
    d.favorit = !!d.favorit;
    d.foto = d.foto || null;
    d.diubah = Date.now();
    if (!d.dibuat) d.dibuat = d.diubah;
    if (d.id === null || d.id === undefined) delete d.id;
    return d;
  }

  async function semuaProduk() {
    const db = await buka();
    const daftar = await minta(db.transaction('produk').objectStore('produk').getAll());
    daftar.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
    return daftar;
  }

  async function ambilProduk(id) {
    const db = await buka();
    return (await minta(db.transaction('produk').objectStore('produk').get(id))) || null;
  }

  async function cariBarcode(kode) {
    kode = String(kode || '').trim();
    if (!kode) return null;
    const db = await buka();
    const hasil = await minta(db.transaction('produk').objectStore('produk').index('barcode').getAll(kode));
    return hasil.length ? hasil[0] : null;
  }

  async function simpanProduk(p) {
    const db = await buka();
    const tx = db.transaction('produk', 'readwrite');
    const st = tx.objectStore('produk');
    const tungguTx = selesai(tx);
    try {
      let lama = null;
      if (p.id !== null && p.id !== undefined) lama = await minta(st.get(p.id));
      const data = rapikanProduk(p, lama);

      if (data.barcode) {
        const sama = await minta(st.index('barcode').getAll(data.barcode));
        const bentrok = sama.find((x) => x.id !== data.id);
        if (bentrok) throw new Error('Barcode ini sudah dipakai produk: ' + bentrok.nama);
      }

      const id = await minta(st.put(data));
      await tungguTx;
      data.id = id;
      kabari('produk');
      return data;
    } catch (e) {
      try { tx.abort(); } catch (x) { /* sudah selesai */ }
      tungguTx.catch(() => {});
      throw e;
    }
  }

  async function hapusProduk(id) {
    const db = await buka();
    const tx = db.transaction('produk', 'readwrite');
    tx.objectStore('produk').delete(id);
    await selesai(tx);
    kabari('produk');
  }

  /* =========================================================
     TRANSAKSI (penjualan) - stok berkurang otomatis
     data = { items:[{produkId, nama, harga, jumlah}], diskon, bayar, metode, kasir }
     ========================================================= */
  async function simpanTransaksi(data) {
    if (!data || !data.items || !data.items.length) {
      throw new Error('Keranjang masih kosong');
    }
    const db = await buka();
    const tx = db.transaction(['produk', 'transaksi', 'pengaturan'], 'readwrite');
    const sp = tx.objectStore('produk');
    const st = tx.objectStore('transaksi');
    const sg = tx.objectStore('pengaturan');
    const tungguTx = selesai(tx);

    try {
      const sekarang = Date.now();
      const items = [];
      let subtotal = 0;

      for (const it of data.items) {
        const jumlah = angka(it.jumlah, 1);
        const harga = angka(it.harga);
        let hargaBeli = 0;

        if (it.produkId !== null && it.produkId !== undefined) {
          const p = await minta(sp.get(it.produkId));
          if (p) {
            hargaBeli = p.hargaBeli || 0;
            p.stok = Math.max(0, (p.stok || 0) - jumlah);
            p.diubah = sekarang;
            await minta(sp.put(p));
          }
        }

        items.push({
          produkId: (it.produkId === undefined ? null : it.produkId),
          nama: String(it.nama || ''),
          harga: harga,
          jumlah: jumlah,
          hargaBeli: hargaBeli,
          subtotal: harga * jumlah
        });
        subtotal += harga * jumlah;
      }

      // Nomor nota urut per hari: TRX-YYMMDD-0001
      const kunci = 'nota-' + kunciTanggal(sekarang);
      const baris = await minta(sg.get(kunci));
      const urut = (baris ? baris.nilai : 0) + 1;
      await minta(sg.put({ kunci: kunci, nilai: urut }));

      const diskon = Math.max(0, angka(data.diskon));
      const total = Math.max(0, subtotal - diskon);
      const bayar = angka(data.bayar, total);

      const rekam = {
        noNota: 'TRX-' + kunciTanggal(sekarang).slice(2) + '-' + String(urut).padStart(4, '0'),
        tanggal: sekarang,
        items: items,
        subtotal: subtotal,
        diskon: diskon,
        total: total,
        bayar: bayar,
        kembalian: Math.max(0, bayar - total),
        metode: data.metode || 'tunai',
        kasir: data.kasir || '',
        status: 'selesai'
      };

      rekam.id = await minta(st.add(rekam));
      await tungguTx;
      kabari('transaksi');
      kabari('produk');
      return rekam;
    } catch (e) {
      try { tx.abort(); } catch (x) { /* sudah selesai */ }
      tungguTx.catch(() => {});
      throw e;
    }
  }

  // Batalkan transaksi: stok dikembalikan, nota ditandai "batal"
  async function batalkanTransaksi(id) {
    const db = await buka();
    const tx = db.transaction(['produk', 'transaksi'], 'readwrite');
    const sp = tx.objectStore('produk');
    const st = tx.objectStore('transaksi');
    const tungguTx = selesai(tx);

    try {
      const t = await minta(st.get(id));
      if (!t) throw new Error('Transaksi tidak ditemukan');
      if (t.status === 'batal') throw new Error('Transaksi ini sudah dibatalkan');

      for (const it of t.items) {
        if (it.produkId !== null && it.produkId !== undefined) {
          const p = await minta(sp.get(it.produkId));
          if (p) {
            p.stok = (p.stok || 0) + it.jumlah;
            p.diubah = Date.now();
            await minta(sp.put(p));
          }
        }
      }

      t.status = 'batal';
      t.dibatalkan = Date.now();
      await minta(st.put(t));
      await tungguTx;
      kabari('transaksi');
      kabari('produk');
      return t;
    } catch (e) {
      try { tx.abort(); } catch (x) { /* sudah selesai */ }
      tungguTx.catch(() => {});
      throw e;
    }
  }

  async function ambilTransaksi(id) {
    const db = await buka();
    return (await minta(db.transaction('transaksi').objectStore('transaksi').get(id))) || null;
  }

  // Transaksi antara dua waktu (milidetik). Yang dibatalkan tidak ikut,
  // kecuali termasukBatal = true
  async function transaksiRentang(dari, sampai, termasukBatal) {
    const db = await buka();
    const rentang = IDBKeyRange.bound(dari, sampai);
    const daftar = await minta(db.transaction('transaksi').objectStore('transaksi').index('tanggal').getAll(rentang));
    return termasukBatal ? daftar : daftar.filter((t) => t.status !== 'batal');
  }

  async function terbaru(namaStore, jumlah) {
    const db = await buka();
    return new Promise((ok, gagal) => {
      const hasil = [];
      const req = db.transaction(namaStore).objectStore(namaStore).index('tanggal').openCursor(null, 'prev');
      req.onsuccess = () => {
        const kursor = req.result;
        if (kursor && hasil.length < jumlah) {
          hasil.push(kursor.value);
          kursor.continue();
        } else {
          ok(hasil);
        }
      };
      req.onerror = () => gagal(req.error);
    });
  }

  function transaksiTerbaru(jumlah) { return terbaru('transaksi', jumlah || 10); }

  /* =========================================================
     BARANG MASUK - stok bertambah otomatis
     data = { items:[{produkId, jumlah, hargaBeli}], catatan }
     ========================================================= */
  async function simpanMasuk(data) {
    if (!data || !data.items || !data.items.length) {
      throw new Error('Belum ada barang yang dimasukkan');
    }
    const db = await buka();
    const tx = db.transaction(['produk', 'masuk'], 'readwrite');
    const sp = tx.objectStore('produk');
    const sm = tx.objectStore('masuk');
    const tungguTx = selesai(tx);

    try {
      const sekarang = Date.now();
      const items = [];
      let total = 0;

      for (const it of data.items) {
        const p = await minta(sp.get(it.produkId));
        if (!p) throw new Error('Produk tidak ditemukan');
        const jumlah = angka(it.jumlah);
        if (jumlah <= 0) throw new Error('Jumlah harus lebih dari 0: ' + p.nama);
        const hargaBeli = angka(it.hargaBeli, p.hargaBeli || 0);

        p.stok = (p.stok || 0) + jumlah;
        if (hargaBeli > 0) p.hargaBeli = hargaBeli;
        p.diubah = sekarang;
        await minta(sp.put(p));

        items.push({ produkId: p.id, nama: p.nama, jumlah: jumlah, hargaBeli: hargaBeli });
        total += jumlah * hargaBeli;
      }

      const rekam = {
        tanggal: sekarang,
        items: items,
        total: total,
        catatan: String(data.catatan || '').trim()
      };
      rekam.id = await minta(sm.add(rekam));
      await tungguTx;
      kabari('masuk');
      kabari('produk');
      return rekam;
    } catch (e) {
      try { tx.abort(); } catch (x) { /* sudah selesai */ }
      tungguTx.catch(() => {});
      throw e;
    }
  }

  function masukTerbaru(jumlah) { return terbaru('masuk', jumlah || 20); }

  /* =========================================================
     PENGATURAN (nama kasir, nama toko, tema, dll.)
     ========================================================= */
  async function ambilSetelan(kunci, bawaan) {
    const db = await buka();
    const baris = await minta(db.transaction('pengaturan').objectStore('pengaturan').get(kunci));
    return baris ? baris.nilai : bawaan;
  }

  async function simpanSetelan(kunci, nilai) {
    const db = await buka();
    const tx = db.transaction('pengaturan', 'readwrite');
    tx.objectStore('pengaturan').put({ kunci: kunci, nilai: nilai });
    await selesai(tx);
    kabari('pengaturan');
  }

  /* =========================================================
     BACKUP & RESTORE
     ========================================================= */
  const DAFTAR_STORE = ['produk', 'transaksi', 'masuk', 'pengaturan'];

  async function eksporSemua() {
    const db = await buka();
    const tx = db.transaction(DAFTAR_STORE);
    const data = {};
    for (const nama of DAFTAR_STORE) {
      data[nama] = await minta(tx.objectStore(nama).getAll());
    }
    return {
      app: 'vinki-toko',
      versi: VERSI_DB,
      tanggal: new Date().toISOString(),
      data: data
    };
  }

  async function buatFileBackup() {
    const isi = await eksporSemua();
    const d = new Date();
    const nama = 'vinki-toko-backup-' + d.getFullYear() + '-' + dua(d.getMonth() + 1) + '-' + dua(d.getDate()) +
      '_' + dua(d.getHours()) + dua(d.getMinutes()) + '.json';
    const blob = new Blob([JSON.stringify(isi)], { type: 'application/json' });
    return { blob: blob, nama: nama };
  }

  async function unduhBackup() {
    const f = await buatFileBackup();
    const url = URL.createObjectURL(f.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.nama;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    await simpanSetelan('backupTerakhir', Date.now());
    return f.nama;
  }

  // PERHATIAN: semua data sekarang DIGANTI dengan isi file backup
  async function imporSemua(isi) {
    if (!isi || isi.app !== 'vinki-toko' || !isi.data) {
      throw new Error('File ini bukan backup Vinki Toko');
    }
    const db = await buka();
    const tx = db.transaction(DAFTAR_STORE, 'readwrite');
    const tungguTx = selesai(tx);
    const hitung = {};
    try {
      for (const nama of DAFTAR_STORE) {
        const st = tx.objectStore(nama);
        st.clear();
        const baris = Array.isArray(isi.data[nama]) ? isi.data[nama] : [];
        for (const b of baris) st.put(b);
        hitung[nama] = baris.length;
      }
      await tungguTx;
    } catch (e) {
      try { tx.abort(); } catch (x) { /* sudah selesai */ }
      tungguTx.catch(() => {});
      throw e;
    }
    kabari('semua');
    return hitung;
  }

  // Hapus SEMUA data (dipakai tombol reset di Pengaturan, dengan konfirmasi)
  async function resetSemua() {
    const db = await buka();
    const tx = db.transaction(DAFTAR_STORE, 'readwrite');
    DAFTAR_STORE.forEach((nama) => tx.objectStore(nama).clear());
    await selesai(tx);
    kabari('semua');
  }

  // Minta browser agar data tidak dihapus otomatis saat memori HP penuh
  async function mintaPenyimpananTetap() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        return await navigator.storage.persist();
      }
    } catch (e) { /* abaikan */ }
    return false;
  }

  /* ---------- Buka ke luar ---------- */
  window.DB = {
    buka, semuaProduk, ambilProduk, cariBarcode, simpanProduk, hapusProduk,
    simpanTransaksi, batalkanTransaksi, ambilTransaksi, transaksiRentang, transaksiTerbaru,
    simpanMasuk, masukTerbaru,
    ambilSetelan, simpanSetelan,
    eksporSemua, buatFileBackup, unduhBackup, imporSemua, resetSemua,
    mintaPenyimpananTetap
  };
})();