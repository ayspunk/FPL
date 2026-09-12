// ============================================================
// FPL Dashboard — Service Worker (PWA)
// ============================================================
// Bump this version string whenever app.js/style.css/index.html changes —
// it's the only way installed PWAs (HP) detect the update and refresh their cache.
const CACHE_NAME = 'fpl-dash-v8';
const CORE_ASSETS = [
  '/FPL/',
  '/FPL/index.html',
  '/FPL/app.js',
  '/FPL/style.css',
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
];

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

  // Core assets: cache-first
  if (CORE_ASSETS.some(a => url.href.includes(a) || url.pathname === a)) {
    e.respondWith(
      // cacheName wajib: caches.match() tanpa opsi menggeledah SEMUA cache di
      // origin, termasuk generasi lama yang belum sempat terhapus — app.js basi
      // bisa tersaji walau CACHE_NAME sudah naik versi.
      caches.match(e.request, { cacheName: CACHE_NAME }).then(cached => {
        // Return cached but also update in background
        const fetchPromise = fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        }).catch(() => null);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Everything else: network with cache fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
