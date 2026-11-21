/* =========================================================
   VINKI TOKO - js/kunci.js
   Layar terkunci: ID Perangkat + kode aktivasi (dicek offline).
   ========================================================= */
(function () {
  'use strict';

  const NOMOR_WA = '6281938674970';
  const K_ID = 'vinki-id-perangkat';
  const K_KODE = 'vinki-kode-aktivasi';
  const HURUF = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let overlay = null;
  const dikunci = [];

  function baca(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function tulis(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  function buatId() {
    const b = new Uint8Array(8);
    crypto.getRandomValues(b);
    let s = '';
    for (let i = 0; i < 8; i++) s += HURUF.charAt(b[i] % HURUF.length);
    return s.slice(0, 4) + '-' + s.slice(4);
  }

  function ambilId() {
    let id = baca(K_ID);
    if (!/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(id)) {
      id = buatId();
      tulis(K_ID, id);
    }
    return id;
  }

  function dariB64(s, url) {
    if (url) s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const b = atob(s);
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }

  async function periksa(id, kode) {
    try {
      if (!window.KUNCI_PENGECEK || !crypto.subtle) return false;
      const kunci = await crypto.subtle.importKey(
        'spki', dariB64(window.KUNCI_PENGECEK, false),
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const ttd = dariB64(kode, true);
      if (ttd.length !== 64) return false;
      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' }, kunci, ttd,
        new TextEncoder().encode('vinki-toko:' + id));
    } catch (e) {
      return false;
    }
  }

  function idbBuka() {
    return new Promise((ok, gagal) => {
      try {
        const r = indexedDB.open('vinki-cadangan-aktivasi', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => gagal(r.error);
      } catch (e) { gagal(e); }
    });
  }

  async function idbBaca(k) {
    try {
      const db = await idbBuka();
      return await new Promise((ok) => {
        const q = db.transaction('kv').objectStore('kv').get(k);
        q.onsuccess = () => ok(q.result || '');
        q.onerror = () => ok('');
      });
    } catch (e) { return ''; }
  }

  async function idbTulis(k, v) {
    try {
      const db = await idbBuka();
      await new Promise((ok) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(v, k);
        tx.oncomplete = () => ok();
        tx.onerror = () => ok();
        tx.onabort = () => ok();
      });
    } catch (e) { /* abaikan */ }
  }

  // Pulihkan ID dan kode dari cadangan kalau penyimpanan utama kosong
  async function pulihkan() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* abaikan */ }
    for (const k of [K_ID, K_KODE]) {
      if (!baca(k)) {
        const v = await idbBaca(k);
        if (v) tulis(k, v);
      }
    }
  }

  // Salin ID dan kode ke penyimpanan cadangan
  async function cadangkan() {
    for (const k of [K_ID, K_KODE]) {
      const v = baca(k);
      if (v) await idbTulis(k, v);
    }
  }

  function esc(t) {
    return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function kunciApp() {
    Array.from(document.body.children).forEach((el) => {
      if (el === overlay || el.tagName === 'SCRIPT') return;
      if (!el.inert) { el.inert = true; dikunci.push(el); }
    });
  }

  function bukaApp() {
    dikunci.forEach((el) => { el.inert = false; });
    dikunci.length = 0;
    if (overlay) { overlay.remove(); overlay = null; }
    document.documentElement.classList.remove('terkunci');
  }

  function tampilLayar() {
    const id = ambilId();
    document.documentElement.classList.add('terkunci');
    overlay = document.createElement('div');
    overlay.id = 'layarKunci';
    overlay.innerHTML =
      '<div class="kunci-kotak">' +
      '<img src="icon.svg" alt="" width="72" height="72" style="border-radius:18px;background:#fff">' +
      '<h1>Vinki Toko</h1>' +
      '<p>Aplikasi ini perlu diaktifkan dulu di perangkat ini.</p>' +
      '<div class="kunci-label">ID Perangkat kamu</div>' +
      '<div class="kunci-id" id="kunciId">' + esc(id) + '</div>' +
      '<div class="kunci-baris">' +
      '<button type="button" class="kunci-btn abu" id="kunciSalin">Salin ID</button>' +
      '<button type="button" class="kunci-btn hijau" id="kunciWa">Kirim ID lewat WhatsApp</button></div>' +
      '<div class="kunci-label" style="margin-top:18px">Kode aktivasi</div>' +
      '<textarea id="kunciKode" rows="3" placeholder="Tempel kode dari admin di sini" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>' +
      '<div class="kunci-salah" id="kunciSalah"></div>' +
      '<button type="button" class="kunci-btn utama" id="kunciAktif">Aktifkan</button>' +
      '<small>Kode hanya berlaku untuk ID perangkat ini. Kalau ganti HP atau data Chrome terhapus, ID berubah dan perlu kode baru.</small>' +
      '</div>';
    document.body.appendChild(overlay);
    kunciApp();

    document.getElementById('kunciSalin').addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(id); e.target.textContent = 'Tersalin!'; }
      catch (x) { e.target.textContent = 'Tahan lalu salin manual'; }
      setTimeout(() => { e.target.textContent = 'Salin ID'; }, 1500);
    });

    document.getElementById('kunciWa').addEventListener('click', () => {
      const teks = 'Halo, saya mau aktivasi Vinki Toko.\nID Perangkat saya: ' + id;
      window.open('https://wa.me/' + NOMOR_WA + '?text=' + encodeURIComponent(teks), '_blank');
    });

    const aktif = document.getElementById('kunciAktif');
    const salah = document.getElementById('kunciSalah');
    aktif.addEventListener('click', async () => {
      const kode = document.getElementById('kunciKode').value.replace(/\s+/g, '');
      salah.textContent = '';
      if (!kode) { salah.textContent = 'Tempel kode aktivasinya dulu.'; return; }
      aktif.disabled = true;
      const ok = await periksa(id, kode);
      aktif.disabled = false;
      if (!ok) { salah.textContent = 'Kode tidak cocok dengan perangkat ini. Pastikan kode utuh dan dibuat untuk ID di atas.'; return; }
      tulis(K_KODE, kode);
      cadangkan();
      bukaApp();
    });
  }

  /* Kartu status di halaman Pengaturan */
  window.addEventListener('pengaturan-dirender', (e) => {
    const w = e.detail && e.detail.wadah;
    if (!w || w.querySelector('#kartuAktivasi')) return;
    const k = document.createElement('div');
    k.className = 'kartu';
    k.id = 'kartuAktivasi';
    k.style.marginBottom = '14px';
    k.innerHTML = '<div class="kartu-kepala"><h2>Aktivasi</h2></div>' +
      '<p style="margin-bottom:6px">Status: <b style="color:var(--hijau)">Teraktivasi</b></p>' +
      '<p style="color:var(--teks-pudar);font-size:13px">ID Perangkat: <b style="color:var(--teks)">' + esc(ambilId()) + '</b></p>';
    w.insertBefore(k, w.lastElementChild);
  });

  /* Mulai */
  (async function () {
    await pulihkan();
    if (!window.isSecureContext || !window.crypto || !crypto.subtle) {
      tampilLayar();
      document.getElementById('kunciSalah').textContent = 'Buka app lewat alamat https (bukan file langsung).';
      return;
    }
    const id = ambilId();
    const kode = baca(K_KODE);
    cadangkan();
    if (kode && await periksa(id, kode)) return;
    if (kode) { try { localStorage.removeItem(K_KODE); } catch (e) { /* abaikan */ } }
    tampilLayar();
  })();
})();