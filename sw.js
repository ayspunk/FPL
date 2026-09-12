// ============================================================
// FPL Dashboard — Service Worker (PWA)
// ============================================================
// CACHE_NAME sekarang cuma penanda generasi cache: sejak app shell dilayani
// network-first, rilis app.js/style.css/index.html sudah langsung sampai ke user
// TANPA perlu bump. Bump hanya kalau isi CORE_ASSETS berubah (mis. ganti versi
// Chart.js) atau saat ingin memaksa buang cache lama.
const CACHE_NAME = 'fpl-dash-v9';

// App shell (same-origin) — NETWORK-FIRST.
// Dulu ini cache-first, dan itu artinya setiap rilis selalu tersaji satu versi
// terlambat: saat halaman dimuat, index.html/app.js sudah keburu dilayani dari
// cache lama sebelum SW baru sempat aktif dan claim. skipWaiting() saja tidak
// menyelesaikannya — request-nya sudah terlanjur jalan. Network-first bikin
// rilis langsung kelihatan di buka pertama; cache tetap dipakai kalau offline.
const APP_SHELL = [
  '/FPL/',
  '/FPL/index.html',
  '/FPL/app.js',
  '/FPL/style.css',
];

// Vendor CDN — CACHE-FIRST. Versinya di-pin di URL, jadi isinya tidak pernah
// berubah; tidak ada gunanya menembak jaringan tiap kali.
const VENDOR_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
];

const CORE_ASSETS = [...APP_SHELL, ...VENDOR_ASSETS];

const DATA_CACHE = 'fpl-data-v1';
const DATA_ASSETS = [
  '/FPL/data/all.json',
  '/FPL/data/bootstrap.json',
  '/FPL/data/fixtures.json',
  '/FPL/data/live.json',
  '/FPL/data/snapshots.json',
  '/FPL/data/live-all.json',
  '/FPL/data/weights-history.json',
];

// Install: cache core assets
// skipWaiting() dipanggil duluan dan DI LUAR rantai caching. Sebelumnya ia
// dirangkai setelah addAll, jadi kalau satu aset gagal (Google Fonts / cdnjs
// diblokir atau lambat) .catch() menelan errornya, skipWaiting tidak pernah
// jalan, SW baru nyangkut di status "waiting", activate tidak jalan, dan cache
// lama tidak pernah dihapus — update baru kelihatan setelah app dibuka 2x.
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Per-aset, bukan addAll: addAll bersifat all-or-nothing, satu CDN meleset
      // bikin seluruh cache inti kosong.
      Promise.all(CORE_ASSETS.map(a =>
        cache.add(a).catch(err => console.log('[SW] Lewati cache:', a, err))
      ))
    )
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== DATA_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for data, cache-first for core
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET
  if (e.request.method !== 'GET') return;

  // Data files: network-first (update cache on success)
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(DATA_CACHE).then(cache => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request, { cacheName: DATA_CACHE }))
    );
    return;
  }

  // cacheName wajib di setiap caches.match() di bawah: tanpa opsi itu ia
  // menggeledah SEMUA cache di origin, termasuk generasi lama yang belum sempat
  // terhapus — app.js basi bisa tersaji walau CACHE_NAME sudah naik versi.

  // App shell: network-first, cache sebagai jaring pengaman offline.
  //
  // cache:'no-cache' WAJIB. fetch() biasa masih melewati HTTP cache browser, dan
  // GitHub Pages mengirim Cache-Control: max-age=600 — jadi tanpa ini "network-
  // first" tetap menyajikan app.js basi sampai 10 menit setelah deploy. Ini tidak
  // kelihatan saat diuji lewat python -m http.server, yang tidak mengirim header
  // cache sama sekali. 'no-cache' memaksa revalidasi ke server, bukan unduh ulang:
  // Pages mengirim ETag, jadi kalau tidak berubah balasannya 304 yang murah.
  if (e.request.mode === 'navigate' ||
      APP_SHELL.some(a => url.pathname === a || url.href.includes(a))) {
    e.respondWith(
      fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request, { cacheName: CACHE_NAME }))
    );
    return;
  }

  // Vendor CDN: cache-first (URL sudah ter-pin versinya)
  if (VENDOR_ASSETS.some(a => url.href.includes(a))) {
    e.respondWith(
      caches.match(e.request, { cacheName: CACHE_NAME }).then(cached =>
        cached || fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // Everything else: network with cache fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
