# Raqio

Monorepo. Satu repo, tiga bagian:

```
raqio/
├── apps/
│   ├── web/        Next.js (frontend, port 3000)
│   └── api/        Go (backend utama, port 8080, masih kerangka)
└── services/
    └── scraper/    Python (scraping Google Maps, IG, laporan, port 8000)
```

Frontend memanggil endpoint data dengan path yang sama seperti versi lama (`/market/reports`, `/log`, dst).
Next meneruskannya ke service Python lewat rewrite di `apps/web/next.config.ts`.

## Jalankan (development)

Dua terminal.

**Terminal 1, service scraper (Python):**

```powershell
cd services\scraper
python -m venv .venv            # sekali saja
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt # sekali saja
playwright install chromium     # sekali saja
copy .env.example .env          # opsional, isi token kalau mau alert / AI
python app.py                   # http://localhost:8000
```

**Terminal 2, frontend (Next.js):**

```powershell
cd apps\web
npm install                     # sekali saja
copy .env.example .env.local    # sekali saja, lalu isi AUTH_USER, AUTH_PASS, AUTH_SECRET
npm run dev                     # http://localhost:3000
```

Buka http://localhost:3000, kamu diarahkan ke `/login`. Halaman `/tools`, `/competitors`, dan `/report` masih dirender Python dan ikut diteruskan.

## Login

Semua halaman dan endpoint data dikunci oleh `apps/web/middleware.ts`. Sesi disimpan di cookie HttpOnly yang
ditandatangani HMAC dengan `AUTH_SECRET`, berlaku 7 hari. Untuk sekarang hanya ada satu akun dari env
(`AUTH_USER` / `AUTH_PASS`). Multi-user dan penyimpanan akun direncanakan di backend Go.

Catatan: service Python di port 8000 tetap bisa diakses langsung tanpa login dari mesin yang sama. Jangan
buka port 8000 ke luar, cukup port 3000.

**Backend Go (opsional, belum dipakai frontend):**

```powershell
cd apps\api
go run .                        # http://localhost:8080/healthz
```

## Tes

```powershell
cd services\scraper
pip install -r requirements-dev.txt
pytest tests
```
