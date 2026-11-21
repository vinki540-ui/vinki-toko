/* =========================================================
   VINKI TOKO - js/mode-scan.js
   Satu mode aktif di layar Transaksi: Kamera ATAU Scanner alat.
   ========================================================= */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const KUNCI = 'vinki-mode-scan';

  const btnAlatLama = $('#kBtnAlat');
  const btnKamera = $('#kBtnKamera');
  const input = $('#kInput');
  if (!btnAlatLama || !btnKamera || !input) return;

  let mode = 'kamera';
  try { mode = localStorage.getItem(KUNCI) === 'alat' ? 'alat' : 'kamera'; } catch (e) { /* abaikan */ }

  // Tombol lama disembunyikan, tapi tetap dipakai untuk mengatur keyboard dan fokus
  btnAlatLama.style.display = 'none';

  const kartu = input.closest('.kartu');
  const baris = kartu.querySelector('.kasir-scan');
  const bar = document.createElement('div');
  bar.innerHTML =
    '<div style="display:flex;gap:8px;margin-bottom:8px">' +
    '<button type="button" class="btn" id="mdKamera" style="flex:1">Kamera</button>' +
    '<button type="button" class="btn" id="mdAlat" style="flex:1">Scanner alat</button></div>' +
    '<div id="mdInfo" style="font-size:12px;font-weight:600;color:var(--teks-pudar);margin-bottom:10px"></div>';
  kartu.insertBefore(bar, baris);

  const mdKamera = $('#mdKamera');
  const mdAlat = $('#mdAlat');
  const info = $('#mdInfo');

  function terapkan() {
    const alat = mode === 'alat';
    const nyala = /Nyala/.test(btnAlatLama.textContent);
    if (nyala !== alat) btnAlatLama.click();

    mdKamera.classList.toggle('utama', !alat);
    mdAlat.classList.toggle('utama', alat);
    btnKamera.disabled = alat;
    btnKamera.style.opacity = alat ? '0.4' : '';
    input.placeholder = alat ? 'Arahkan scanner ke barcode' : 'Ketik nama produk';
    info.textContent = alat
      ? 'Scanner alat aktif: tekan tombol di scanner. Kamera dimatikan.'
      : 'Kamera aktif: tap tombol Kamera untuk scan.';
  }

  function pilih(m) {
    mode = m;
    try { localStorage.setItem(KUNCI, m); } catch (e) { /* abaikan */ }
    terapkan();
  }

  mdKamera.addEventListener('click', () => pilih('kamera'));
  mdAlat.addEventListener('click', () => pilih('alat'));

  // Mode Kamera: ketikan super cepat dari scanner alat diabaikan (tidak dobel scan)
  let terakhir = 0;
  let cepat = 0;
  let burst = false;
  input.addEventListener('input', () => {
    const n = Date.now();
    cepat = (n - terakhir < 50) ? cepat + 1 : 0;
    terakhir = n;
    if (cepat >= 5) burst = true;
    if (!input.value) { burst = false; cepat = 0; }
  }, true);

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (mode === 'kamera' && burst) {
      e.preventDefault();
      e.stopImmediatePropagation();
      input.value = '';
      input.dispatchEvent(new Event('input'));
      burst = false; cepat = 0;
      if (window.App) App.toast('Scanner alat sedang tidak aktif. Pilih "Scanner alat" dulu.', '', 2800);
      return;
    }
    burst = false; cepat = 0;
  }, true);

  // Mode Scanner alat: keyboard HP hanya muncul kalau kolom di-tap
  input.addEventListener('pointerdown', () => { if (mode === 'alat') input.setAttribute('inputmode', 'text'); });
  input.addEventListener('blur', () => { if (mode === 'alat') input.setAttribute('inputmode', 'none'); });

  terapkan();
})();