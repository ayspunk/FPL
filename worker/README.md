# FPL CORS Proxy — Cloudflare Worker

Perantara milik sendiri untuk FPL API, menggantikan proxy publik gratisan yang
sering mati atau kena rate limit bersama.

**Kenapa perlu:** FPL API tidak mengirim header `Access-Control-Allow-Origin`,
jadi browser selalu memblokir fetch langsung dari GitHub Pages. Itu aturan
browser, bukan bug — tidak ada cara menembusnya dari sisi klien.

**Gratis:** 100.000 request/hari di free tier Cloudflare Workers.

---

## Deploy

Butuh akun Cloudflare (gratis, tanpa kartu kredit). Jalankan dari folder ini:

```
cd worker
npx wrangler login      # buka browser untuk otorisasi
npx wrangler deploy
```

`wrangler deploy` akan mencetak URL worker, bentuknya:

```
https://fpl-proxy.<subdomain>.workers.dev
```

## Sambungkan ke dashboard

Salin URL itu ke `app.js`, field `CFG.workerUrl`:

```js
workerUrl: 'https://fpl-proxy.<subdomain>.workers.dev',
```

Begitu terisi, worker otomatis jadi proxy **#1** dan dicoba sebelum semua proxy
publik. Kalau worker mati, kode tetap jatuh ke `r.jina.ai` dan sisanya.

Setelah itu naikkan `CACHE_NAME` di `sw.js` (mis. `fpl-dash-v3` → `v4`) supaya
PWA yang sudah terpasang di HP menarik `app.js` versi baru.

## Verifikasi

> **Penting:** jangan tes pakai `npx wrangler dev` biasa — mode itu mengirim
> request dari mesin Anda, dan jaringan Anda memblokir `premierleague.com`,
> jadi hasilnya pasti gagal walau worker-nya benar. Tes worker yang sudah
> ter-deploy, atau pakai `npx wrangler dev --remote`.

```
curl "https://fpl-proxy.<subdomain>.workers.dev/health"
curl "https://fpl-proxy.<subdomain>.workers.dev/?url=https%3A%2F%2Ffantasy.premierleague.com%2Fapi%2Fevent-status%2F"
```

Yang kedua harus mengembalikan JSON `{"status":[...]}`. Header `X-Proxy-Cache`
menunjukkan `HIT` atau `MISS`.

Kalau muncul error 502 "Upstream fetch gagal", berarti egress Cloudflare tidak
bisa menjangkau FPL — kecil kemungkinannya, tapi itulah satu hal yang memang
belum bisa diverifikasi sebelum deploy.

## Konfigurasi

Di `src/index.js`, bagian atas:

| Konstanta | Fungsi |
|---|---|
| `ALLOWED_ORIGINS` | Origin yang boleh memakai worker. Tambahkan domain lain di sini |
| `ALLOWED_PREFIX` | Dikunci ke `https://fantasy.premierleague.com/api/`. **Jangan dilonggarkan** — tanpa ini worker jadi open proxy dan bisa disalahgunakan orang lain |
| `FAST_MOVING` | Endpoint yang di-cache pendek (20 detik). Sisanya 90 detik |

## Catatan

Cache edge menahan request berulang ke FPL, jadi kuota 100k/hari praktis sulit
tersentuh untuk pemakaian pribadi maupun satu liga.
