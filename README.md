# FPL Dashboard — Setup GitHub Pages + Actions

## Arsitektur

```
┌─────────────────────────────────────────────────┐
│  GitHub Actions (setiap 3 jam)                   │
│  ┌─────────────┐      ┌────────────────────┐    │
│  │ FPL API     │ ───► │ scripts/fetch-fpl.js│    │
│  │ (langsung!) │      │  Hitung EPL/FDR/dll │    │
│  └─────────────┘      └────────┬───────────┘    │
│                                │                 │
│                      ┌─────────▼──────────┐     │
│                      │  data/all.json      │     │
│                      │  data/bootstrap.json │     │
│                      │  data/fixtures.json  │     │
│                      │  data/live.json      │     │
│                      └─────────┬──────────┘     │
└────────────────────────────────┼────────────────┘
                                 │ git push
                       ┌─────────▼──────────┐
                       │  GitHub Pages       │
                       │  ayspunk.github.io  │
                       │  /FPL/              │
                       └─────────┬──────────┘
                                 │ same-origin fetch!
                       ┌─────────▼──────────┐
                       │  FPL Dashboard      │
                       │  (HTML/CSS/JS)      │
                       │  NO CORS PROXY!     │
                       └────────────────────┘
```

## Keuntungan vs Google Sheets / CORS Proxy

| Aspek           | CORS Proxy        | Google Sheets      | GitHub Actions      |
|-----------------|-------------------|--------------------|---------------------|
| Reliability     | ❌ Sering down     | ⚠️ Rate limited    | ✅ 99.9% uptime     |
| CORS            | ❌ Butuh proxy     | ⚠️ Format terbatas | ✅ Same-origin!     |
| Kecepatan       | ⚠️ 2-5 detik      | ⚠️ 3-8 detik       | ✅ <1 detik         |
| Biaya           | ✅ Gratis          | ✅ Gratis           | ✅ Gratis (2000m/bln)|
| Auto-update     | ❌ Tidak           | ⚠️ Perlu trigger   | ✅ Cron setiap 3 jam|
| Setup           | ✅ Tidak perlu     | ⚠️ Apps Script     | ⚠️ Sekali setup    |

## Setup (sekali saja)

### 1. File Structure
```
FPL/
├── index.html
├── app.js
├── style.css
├── data/
│   └── all.json          ← auto-generated
├── scripts/
│   └── fetch-fpl.js      ← data fetcher
└── .github/
    └── workflows/
        └── fetch-fpl.yml ← scheduled action
```

### 2. Push ke GitHub
```bash
cd FPL
git add .
git commit -m "Add GitHub Actions data fetcher"
git push
```

### 3. Enable GitHub Actions
- Buka repo → **Settings** → **Actions** → **General**
- Pastikan "Allow all actions" dipilih
- Buka **Actions** tab → pilih "Fetch FPL Data" → klik **Run workflow** untuk test

### 4. Enable GitHub Pages
- **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: `main` → `/ (root)`
- Tunggu beberapa menit → akses `https://ayspunk.github.io/FPL/`

### 5. Verifikasi
- Cek `https://ayspunk.github.io/FPL/data/all.json` — harus berisi data JSON
- Buka dashboard → data akan dimuat tanpa CORS proxy!

## Manual Trigger
- GitHub → **Actions** → "Fetch FPL Data" → **Run workflow**

## Config
Edit `scripts/fetch-fpl.js` bagian CONFIG:
- `LEAGUE_IDS`: ID liga Anda
- `MY_ENTRY_ID`: Team ID Anda
- `DELAY_MS`: Delay antar request (default 400ms)
