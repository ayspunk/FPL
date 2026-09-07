/**
 * FPL CORS Proxy — Cloudflare Worker
 *
 * Kenapa ada: FPL API tidak mengirim header Access-Control-Allow-Origin, jadi
 * browser memblokir fetch langsung dari GitHub Pages. Worker ini jadi perantara
 * milik sendiri — menggantikan proxy publik gratisan yang sering mati/rate-limit.
 *
 * Pemakaian:  GET https://<worker>/?url=<FPL API url, URL-encoded>
 * Health:     GET https://<worker>/health
 *
 * Credit: ays
 */

// Hanya origin ini yang boleh memakai worker. Tambah kalau punya domain lain.
const ALLOWED_ORIGINS = [
  'https://ayspunk.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

// Allowlist target. WAJIB — tanpa ini worker jadi open proxy dan bisa disalahgunakan.
const ALLOWED_PREFIX = 'https://fantasy.premierleague.com/api/';

// Endpoint yang berubah cepat di-cache lebih pendek.
const FAST_MOVING = ['/live/', '/event-status/', '/my-team/'];

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}

function json(body, status, origin, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin), ...extra },
  });
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }
    if (url.pathname === '/health') {
      return json({ ok: true, ts: new Date().toISOString() }, 200, origin);
    }

    // Origin tak dikenal: browser akan memblokir responsnya karena header CORS
    // tidak diset, tapi tolak lebih awal supaya tidak membuang kuota upstream.
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: 'Origin not allowed', origin }, 403, origin);
    }

    const target = url.searchParams.get('url');
    if (!target) {
      return json({ error: 'Parameter ?url= wajib diisi' }, 400, origin);
    }
    if (!target.startsWith(ALLOWED_PREFIX)) {
      return json({ error: 'URL target harus diawali ' + ALLOWED_PREFIX }, 400, origin);
    }

    const ttl = FAST_MOVING.some(p => target.includes(p)) ? 20 : 90;

    // Cache edge: hemat request ke FPL sekaligus mempercepat hit berikutnya.
    const cacheKey = new Request('https://cache.invalid/' + encodeURIComponent(target), request);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      const r = new Response(cached.body, cached);
      Object.entries(corsHeaders(origin)).forEach(([k, v]) => r.headers.set(k, v));
      r.headers.set('X-Proxy-Cache', 'HIT');
      return r;
    }

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: {
          // FPL kadang menolak User-Agent non-browser.
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        cf: { cacheTtl: ttl, cacheEverything: true },
      });
    } catch (e) {
      return json({ error: 'Upstream fetch gagal', detail: String(e) }, 502, origin);
    }

    if (!upstream.ok) {
      return json({ error: 'FPL API error', status: upstream.status }, upstream.status, origin);
    }

    const body = await upstream.text();
    const res = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
        'X-Proxy-Cache': 'MISS',
        ...corsHeaders(origin),
      },
    });

    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};
