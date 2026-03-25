// ============================================================
// FPL Dashboard — Service Worker (PWA)
// ============================================================
const CACHE_NAME = 'fpl-dash-v1';
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
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.log('[SW] Install error:', err))
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
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Core assets: cache-first
  if (CORE_ASSETS.some(a => url.href.includes(a) || url.pathname === a)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
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
