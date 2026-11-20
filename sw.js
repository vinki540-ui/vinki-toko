/* =========================================================
   VINKI TOKO - sw.js (service worker)
   Tugas: simpan file app di HP supaya bisa jalan offline
   ========================================================= */

// Kalau kamu mengubah file app dan HP masih menampilkan versi lama,
// naikkan angka versi ini (v1 -> v2 -> v3, dst.)
const VERSI = 'vinki-toko-v5';

// Daftar file yang disimpan. File yang belum dibuat dilewati,
// jadi aman walaupun file JS-nya baru dibuat bertahap.
const FILE_APP = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.svg',
  './js/db.js',
  './js/app.js',
  './js/produk.js',
  './js/scanner.js',
  './js/kasir.js',
  './js/dashboard.js',
  './js/riwayat.js'
];

// 1) INSTALL: simpan semua file ke cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSI).then((cache) =>
      Promise.all(
        FILE_APP.map((alamat) =>
          cache.add(alamat).catch(() => { /* file belum ada, lewati */ })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// 2) ACTIVATE: hapus cache versi lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((daftar) =>
      Promise.all(
        daftar
          .filter((nama) => nama !== VERSI)
          .map((nama) => caches.delete(nama))
      )
    ).then(() => self.clients.claim())
  );
});

// 3) FETCH: ambil dari cache dulu (cepat, offline),
//    sambil diam-diam memperbarui dari internet kalau ada sinyal
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(VERSI).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((tersimpan) => {
        const dariInternet = fetch(req)
          .then((respon) => {
            if (respon && respon.status === 200) {
              cache.put(req, respon.clone());
            }
            return respon;
          })
          .catch(() => null);

        if (tersimpan) return tersimpan;

        return dariInternet.then((respon) => {
          if (respon) return respon;
          if (req.mode === 'navigate') return cache.match('./index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        });
      })
    )
  );
});