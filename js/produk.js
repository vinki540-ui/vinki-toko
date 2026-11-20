/* =========================================================
   VINKI TOKO - js/produk.js
   Halaman Stok: daftar produk, cari, filter, tambah/edit/hapus,
   foto produk, input barcode.
   Dipakai file lain lewat objek global: Produk
   ========================================================= */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const UKURAN_HALAMAN = 60;

  let semua = [];
  let tampilJumlah = UKURAN_HALAMAN;
  let sedangEdit = null;     // produk yang sedang diedit (null = produk baru)
  let fotoBaru;              // undefined = tidak berubah, null = dihapus, string = foto baru

  /* =========================================================
     MUAT & TAMPILKAN DAFTAR
     ========================================================= */
  async function muat() {
    try {
      semua = await DB.semuaProduk();
    } catch (e) {
      semua = [];
    }
    render();
  }

  function saring() {
    const q = ($('#cariProduk').value || '').trim().toLowerCase();
    const f = $('#filterStok').value;
    return semua.filter((p) => {
      if (q && p.nama.toLowerCase().indexOf(q) === -1 && String(p.barcode).indexOf(q) === -1) return false;
      if (f === 'menipis') return p.stok > 0 && p.stok <= p.stokMin;
      if (f === 'habis') return p.stok <= 0;
      if (f === 'tanpa-barcode') return !p.barcode;
      return true;
    });
  }

  function fotoHtml(p) {
    if (p.foto) return '<img class="produk-foto" loading="lazy" alt="" src="' + p.foto + '">';
    return '<span class="produk-foto">' + App.esc((p.nama || '?').trim().charAt(0).toUpperCase()) + '</span>';
  }

  function render() {
    const w = $('#produkWadah');
    if (!w) return;

    if (!semua.length) {
      w.innerHTML = '<div class="kartu" style="text-align:center;padding:28px 16px">' +
        '<p style="font-weight:800;font-size:16px;margin-bottom:6px">Belum ada produk</p>' +
        '<p style="color:var(--teks-pudar);margin-bottom:14px">Tambahkan jajanan pertama kamu. Scan barcode-nya, isi nama dan harga, selesai.</p>' +
        '<button class="btn utama" data-aksi="tambah">Tambah Produk</button></div>';
      return;
    }

    const daftar = saring();
    if (!daftar.length) {
      w.innerHTML = '<div class="kartu" style="text-align:center;color:var(--teks-pudar);padding:24px">Tidak ada produk yang cocok</div>';
      return;
    }

    const tampil = daftar.slice(0, tampilJumlah);
    let html = '<p style="color:var(--teks-pudar);font-size:13px;margin-bottom:8px">' + daftar.length + ' produk' +
      (daftar.length !== semua.length ? ' (dari ' + semua.length + ')' : '') + '</p>';

    html += '<div class="produk-daftar">';
    for (const p of tampil) {
      const habis = p.stok <= 0;
      const tipis = !habis && p.stok <= p.stokMin;
      html += '<div class="produk-item" data-id="' + p.id + '" role="button" tabindex="0">' +
        fotoHtml(p) +
        '<div class="produk-info"><b>' + (p.favorit ? '★ ' : '') + App.esc(p.nama) + '</b>' +
        '<small>' + (p.barcode ? App.esc(p.barcode) : 'Tanpa barcode') + '</small></div>' +
        '<div class="produk-harga">' + App.rupiah(p.hargaJual) +
        '<small class="' + (habis ? 'habis' : tipis ? 'menipis' : '') + '">' +
        (habis ? 'Habis' : 'Stok ' + App.esc(p.stok) + ' ' + App.esc(p.satuan)) + '</small></div>' +
        '</div>';
    }
    html += '</div>';

    if (daftar.length > tampilJumlah) {
      html += '<button class="btn penuh" style="margin-top:12px" data-aksi="lebih">Tampilkan lebih banyak (' +
        (daftar.length - tampilJumlah) + ' lagi)</button>';
    }
    w.innerHTML = html;
  }

  /* =========================================================
     FOTO: diperkecil ke maks 320px, disimpan sebagai JPEG kecil
     ========================================================= */
  function perkecilFoto(file) {
    return new Promise((ok, gagal) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const maks = 320;
          const skala = Math.min(1, maks / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * skala));
          c.height = Math.max(1, Math.round(img.height * skala));
          const g = c.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          ok(c.toDataURL('image/jpeg', 0.72));
        } catch (e) {
          URL.revokeObjectURL(url);
          gagal(e);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); gagal(new Error('Foto tidak bisa dibaca')); };
      img.src = url;
    });
  }

  function tampilPratinjau() {
    const el = $('#pratinjauFoto');
    if (!el) return;
    let src = null;
    if (fotoBaru === undefined) src = sedangEdit ? sedangEdit.foto : null;
    else src = fotoBaru;

    if (src) {
      el.innerHTML = '<img src="' + src + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px">';
    } else {
      el.innerHTML = '<span style="color:var(--teks-pudar);font-size:12px;text-align:center;padding:6px">Belum ada foto</span>';
    }
    const hapus = $('#btnHapusFoto');
    if (hapus) hapus.hidden = !src;
  }

  /* =========================================================
     FORM TAMBAH / EDIT
     ========================================================= */
  function nilai(v) { return (v === null || v === undefined) ? '' : App.esc(v); }

  async function bukaForm(id) {
    sedangEdit = null;
    fotoBaru = undefined;
    if (id !== null && id !== undefined) {
      sedangEdit = await DB.ambilProduk(Number(id));
      if (!sedangEdit) { App.toast('Produk tidak ditemukan', 'gagal'); return; }
    }
    const p = sedangEdit || { nama: '', barcode: '', hargaJual: '', hargaBeli: '', stok: '', stokMin: 5, satuan: 'pcs', favorit: false };

    $('#modalProdukJudul').textContent = sedangEdit ? 'Edit Produk' : 'Tambah Produk';
    $('#modalProdukIsi').innerHTML = `
      <form id="formProduk" autocomplete="off">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">
          <div id="pratinjauFoto" style="width:84px;height:84px;border-radius:12px;background:var(--utama-muda);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0"></div>
          <div style="display:flex;flex-direction:column;gap:8px;flex:1">
            <label class="btn kecil" for="inputFoto" style="cursor:pointer">Ambil / Pilih Foto</label>
            <input type="file" id="inputFoto" accept="image/*" hidden>
            <button type="button" class="btn kecil bahaya" id="btnHapusFoto" hidden>Hapus Foto</button>
          </div>
        </div>

        <div class="field">
          <label for="pNama">Nama produk *</label>
          <input id="pNama" maxlength="60" required value="${nilai(p.nama)}" placeholder="Contoh: Chitato Sapi Panggang 68g">
        </div>

        <div class="field">
          <label for="pBarcode">Barcode</label>
          <div class="baris-input">
            <input id="pBarcode" inputmode="numeric" maxlength="30" value="${nilai(p.barcode)}" placeholder="Scan atau ketik, boleh kosong">
            <button type="button" class="btn" id="btnScanBarcode">Scan</button>
          </div>
          <small id="infoBarcode">Kosongkan kalau jajanan tidak punya barcode</small>
        </div>

        <div class="baris-2">
          <div class="field">
            <label for="pJual">Harga jual (Rp) *</label>
            <input id="pJual" type="number" inputmode="numeric" min="0" step="1" required value="${nilai(p.hargaJual)}">
          </div>
          <div class="field">
            <label for="pBeli">Harga beli (Rp)</label>
            <input id="pBeli" type="number" inputmode="numeric" min="0" step="1" value="${nilai(p.hargaBeli)}">
          </div>
        </div>

        <div class="baris-2">
          <div class="field">
            <label for="pStok">Stok</label>
            <input id="pStok" type="number" inputmode="numeric" min="0" step="1" value="${nilai(p.stok)}" placeholder="0">
          </div>
          <div class="field">
            <label for="pStokMin">Peringatan stok menipis</label>
            <input id="pStokMin" type="number" inputmode="numeric" min="0" step="1" value="${nilai(p.stokMin)}">
          </div>
        </div>

        <div class="baris-2">
          <div class="field">
            <label for="pSatuan">Satuan</label>
            <input id="pSatuan" maxlength="12" value="${nilai(p.satuan)}" placeholder="pcs">
          </div>
          <div class="field">
            <label for="pFavorit">Tombol favorit</label>
            <select id="pFavorit">
              <option value="0" ${p.favorit ? '' : 'selected'}>Tidak</option>
              <option value="1" ${p.favorit ? 'selected' : ''}>Ya, tampil di layar kasir</option>
            </select>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">
          <button class="btn utama besar" type="submit">Simpan</button>
          ${sedangEdit ? '' : '<button class="btn penuh" type="button" id="btnSimpanLagi">Simpan &amp; Tambah Lagi</button>'}
          ${sedangEdit ? '<button class="btn bahaya penuh" type="button" id="btnHapusProduk">Hapus Produk</button>' : ''}
        </div>
      </form>
    `;

    pasangFormPengait(); pulihkanDraft();
    tampilPratinjau();
    App.bukaModal('modalProduk');
    setTimeout(() => { const n = $('#pNama'); if (n) n.focus(); }, 80);
  }

  function pasangFormPengait() {
    const form = $('#formProduk');

    form.addEventListener('submit', (e) => { e.preventDefault(); simpan(false); });

    const lagi = $('#btnSimpanLagi');
    if (lagi) lagi.addEventListener('click', () => {
      if (!form.reportValidity()) return;
      simpan(true);
    });

    const hapus = $('#btnHapusProduk');
    if (hapus) hapus.addEventListener('click', async () => {
      const ya = await App.konfirmasi('Hapus "' + sedangEdit.nama + '"? Riwayat penjualan lama tetap tersimpan.');
      if (!ya) return;
      try {
        await DB.hapusProduk(sedangEdit.id);
        App.tutupModal('modalProduk');
        App.toast('Produk dihapus', 'sukses');
      } catch (err) {
        App.toast('Gagal menghapus: ' + (err.message || err), 'gagal', 4000);
      }
    });

    // Foto
    $('#inputFoto').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        fotoBaru = await perkecilFoto(f);
        tampilPratinjau();
      } catch (err) {
        App.toast(err.message || 'Foto gagal diproses', 'gagal');
      }
      e.target.value = '';
    });
    $('#btnHapusFoto').addEventListener('click', () => { fotoBaru = null; tampilPratinjau(); });

    // Barcode: Enter (dari scanner alat) jangan kirim form, pindah ke harga
    const bc = $('#pBarcode');
    bc.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cekBarcodeGanda();
        $('#pJual').focus();
      }
    });
    bc.addEventListener('change', cekBarcodeGanda);

    $('#btnScanBarcode').addEventListener('click', () => {
      if (!window.Scanner || !Scanner.mulai) {
        App.toast('Scanner kamera belum siap (dibuat di langkah berikutnya)', '', 3500);
        return;
      }
      Scanner.mulai((kode) => {
        bc.value = kode;
        cekBarcodeGanda();
        const n = $('#pNama');
        if (n && !n.value) n.focus(); else $('#pJual').focus();
      });
    });
  }

  const KUNCI_DRAFT = 'vinki-draft-produk';
  const BIDANG = ['pNama', 'pBarcode', 'pJual', 'pBeli', 'pStok', 'pStokMin', 'pSatuan', 'pFavorit'];

  function simpanDraft() {
    if (sedangEdit) return;
    try {
      const d = {};
      BIDANG.forEach((id) => { const el = $('#' + id); if (el) d[id] = el.value; });
      localStorage.setItem(KUNCI_DRAFT, JSON.stringify(d));
    } catch (e) { /* abaikan */ }
  }

  function hapusDraft() {
    try { localStorage.removeItem(KUNCI_DRAFT); } catch (e) { /* abaikan */ }
  }

  function pulihkanDraft() {
    const form = $('#formProduk');
    if (!form) return;
    form.addEventListener('input', simpanDraft);
    form.addEventListener('change', simpanDraft);
    if (sedangEdit) return;
    try {
      const d = JSON.parse(localStorage.getItem(KUNCI_DRAFT) || 'null');
      if (!d || (!d.pNama && !d.pBarcode)) return;
      BIDANG.forEach((id) => { const el = $('#' + id); if (el && d[id] !== undefined) el.value = d[id]; });
      App.toast('Tulisan sebelumnya dipulihkan', '', 2200);
    } catch (e) { /* abaikan */ }
  }

  async function cekBarcodeGanda() {
    const bc = $('#pBarcode');
    const info = $('#infoBarcode');
    if (!bc || !info) return false;
    const kode = bc.value.trim();
    info.style.color = '';
    if (!kode) { info.textContent = 'Kosongkan kalau jajanan tidak punya barcode'; return false; }
    const ada = await DB.cariBarcode(kode);
    if (ada && (!sedangEdit || ada.id !== sedangEdit.id)) {
      info.textContent = 'Barcode ini sudah dipakai: ' + ada.nama;
      info.style.color = 'var(--merah)';
      return true;
    }
    info.textContent = 'Barcode belum terdaftar, aman dipakai';
    info.style.color = 'var(--hijau)';
    return false;
  }

  async function simpan(tambahLagi) {
    const data = {
      id: sedangEdit ? sedangEdit.id : undefined,
      nama: $('#pNama').value,
      barcode: $('#pBarcode').value,
      hargaJual: $('#pJual').value,
      hargaBeli: $('#pBeli').value,
      stok: $('#pStok').value,
      stokMin: $('#pStokMin').value === '' ? 5 : $('#pStokMin').value,
      satuan: $('#pSatuan').value,
      favorit: $('#pFavorit').value === '1'
    };
    if (fotoBaru !== undefined) data.foto = fotoBaru;

    try {
      const hasil = await DB.simpanProduk(data);
      App.toast('Tersimpan: ' + hasil.nama, 'sukses');
      hapusDraft();
      if (tambahLagi) {
        await bukaForm(null);
      } else {
        App.tutupModal('modalProduk');
      }
    } catch (err) {
      App.toast(err.message || 'Gagal menyimpan', 'gagal', 4000);
    }
  }

  /* =========================================================
     PASANG PENGAIT
     ========================================================= */
  function pasang() {
    $('#btnTambahProduk').addEventListener('click', () => bukaForm(null));

    $('#cariProduk').addEventListener('input', () => { tampilJumlah = UKURAN_HALAMAN; render(); });
    $('#filterStok').addEventListener('change', () => { tampilJumlah = UKURAN_HALAMAN; render(); });

    $('#produkWadah').addEventListener('click', (e) => {
      const aksi = e.target.closest('[data-aksi]');
      if (aksi) {
        if (aksi.dataset.aksi === 'tambah') bukaForm(null);
        if (aksi.dataset.aksi === 'lebih') { tampilJumlah += UKURAN_HALAMAN; render(); }
        return;
      }
      const item = e.target.closest('.produk-item');
      if (item) bukaForm(item.dataset.id);
    });

    $('#produkWadah').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const item = e.target.closest('.produk-item');
      if (item) bukaForm(item.dataset.id);
    });

    window.addEventListener('db-berubah', (e) => {
      const st = e.detail && e.detail.store;
      if (st === 'produk' || st === 'semua') muat();
    });
  }

  pasang();
  App.siap.then(muat);

  /* ---------- Buka ke luar ---------- */
  window.Produk = {
    muat: muat,
    bukaForm: bukaForm,
    daftar: () => semua
  };
})();