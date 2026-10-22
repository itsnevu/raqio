# Raqio

Riset pasar per industri dan wilayah: siapa pemainnya, siapa yang lemah, siapa yang layak dihubungi.
Monorepo multi-tenant (SaaS).

```
raqio/
├── apps/
│   ├── web/              Next.js 15: UI, login/daftar, middleware sesi        → :3000
│   ├── api/              Go: auth, org, kuota, antrian job, endpoint data     → :8080
│   └── mobile/           Flutter (Android, iOS): akun dan data yang sama dengan web
├── services/
│   └── scraper/          Python: worker.py (riset), app.py (fitur IG legacy)  → :8000 (legacy)
├── deploy/               compose.dev.yml (Postgres+Redis), compose.yml (produksi), Caddyfile
├── docs/ARCHITECTURE.md  arsitektur target dan tahapan
└── .github/workflows     CI per app (path filter)
```

Alur data: browser → Next (rewrite) → Go API → Postgres. Riset dijalankan worker Python yang mengambil job dari
tabel `jobs` di Postgres, lalu menulis laporan ke tabel `reports` milik org. Frontend memakai path endpoint yang sama
seperti versi lama (`/market/reports`, `/log`, dst), Go yang melayaninya.

## Jalankan (development)

Cara tercepat, satu terminal untuk semuanya (Postgres, Redis, Go API di container, worker, frontend):

```powershell
.\dev.ps1            # Ctrl+C untuk berhenti; -StopDocker ikut mematikan container
```

Lalu buka http://localhost:3000 dan klik "Coba tanpa daftar". Cara manual per terminal:

Prasyarat: Node 22, Go 1.23, Python 3.12, Docker.

```powershell
# 1. Postgres (port 5433, supaya tidak bentrok dengan Postgres lain di 5432) + Redis
docker compose -f deploy/compose.dev.yml up -d

# 2. Go API
cd apps\api
copy .env.example .env            # isi AUTH_SECRET (acak, min 16 karakter)
go run .                          # http://localhost:8080/healthz

# 3. Worker Python (terminal baru)
cd services\scraper
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt "psycopg[binary]"; playwright install chromium
$env:DATABASE_URL = "postgres://raqio:raqio@127.0.0.1:5433/raqio"
python worker.py

# 4. (opsional) fitur IG legacy: chat agent, scrape IG manual
python app.py                     # :8000, hanya diakses lewat Go API

# 5. Frontend (terminal baru)
cd apps\web
npm install
copy .env.example .env.local      # AUTH_SECRET harus sama dengan apps/api
npm run dev                       # http://localhost:3000
```

Buka http://localhost:3000, daftar akun, lalu riset. `make help` memuat perintah singkatnya.

Catatan: Go membaca env dari proses, bukan dari file `.env`. Di PowerShell: `Get-Content .env | % { $k,$v = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k,$v) }` sebelum `go run .`.

## Produksi (satu VPS)

```bash
cp deploy/.env.example deploy/.env   # isi DOMAIN, PG_PASSWORD, AUTH_SECRET
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
```

Caddy mengurus TLS. Hanya port 80/443 yang terbuka. Worker bisa diperbanyak lewat `WORKER_REPLICAS`.

## Model multi-tenant

- `orgs`, `users`, `memberships` (owner/member), `sessions`. Satu user bisa anggota beberapa org.
- Semua data (`reports`, `leads`, `watches`, `jobs`, `org_settings`, `usage`) punya `org_id`; setiap query difilter dari sesi.
- Kuota per paket (`apps/api/jobs.go`): free 5 riset, 30 cek kontak, 1 wilayah pantau per bulan. Pembayaran belum ada.
- Sesi: cookie HttpOnly `sid.exp.sig`. Next memverifikasi tanda tangan (stateless), Go memverifikasi tanda tangan dan baris `sessions` (bisa dicabut).
- Retensi: laporan dihapus setelah 90 hari (`RETENTION`), job 30 hari. Hapus akun ada di Pengaturan.
- Pendaftaran publik bisa ditutup dengan `ALLOW_REGISTER=0`.
- Email (verifikasi, lupa password, undangan tim): lewat SMTP (`SMTP_*`). Tanpa `SMTP_HOST`, tautan dicatat di log API (mode dev).
- Pembayaran: Xendit Invoice (`XENDIT_SECRET_KEY`, webhook `/billing/webhook/xendit` dengan `XENDIT_CALLBACK_TOKEN`).
  Tanpa key, mode manual: user minta aktivasi, pengelola set `orgs.plan` dan `plan_until` di DB. Paket turun ke free otomatis saat habis.

## Mobile (Flutter)

`apps/mobile` adalah app Android dan iOS yang memakai **API, akun, org, dan kuota yang sama dengan web**. Tidak ada
backend terpisah: app login ke `/auth/login`, menyimpan cookie sesi `raqio_session`, dan mengirimnya di setiap
request. Riset yang dibuat di HP muncul di web, dan sebaliknya.

```powershell
cd apps\mobile
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:8080   # emulator Android ke API di laptop
flutter run --dart-define=API_URL=https://raqio.example.com   # produksi
```

iOS simulator memakai `http://localhost:8080`. HP fisik: pakai IP laptop di jaringan yang sama, dan API harus
bisa diakses dari luar loopback. Alamat API dibakar saat build lewat `--dart-define`, defaultnya 10.0.2.2:8080.

Layar: Masuk/Daftar, Riset (form, progres job, laporan), Laporan (ringkasan dengan kesimpulan yang sama persis
dengan web, daftar pemain, prospek), panel detail bisnis (WhatsApp dengan draf, cek kontak, status follow up),
Prospek, Pantau, Akun. Logika skor dan kesimpulan di `lib/biz.dart` adalah port langsung dari `apps/web/lib/biz.ts`
dan punya tes paritas. Tes: `flutter analyze` dan `flutter test` (tanpa Android SDK).

## Panduan pengguna (tur)

Tiap halaman punya tur interaktif (driver.js) yang muncul otomatis sekali per browser dan bisa diputar ulang
lewat menu Lanjutan > Panduan. Isi langkah ada di `apps/web/lib/tours.ts`; langkah yang elemennya belum ada
(misalnya sebelum ada laporan) dilewati otomatis.

## Dokumentasi API

Spesifikasi OpenAPI ada di `apps/api/openapi.yaml`, dilayani di `/openapi.yaml`, dan Swagger UI di `/docs`
(matikan dengan `DOCS=0`). Tipe TypeScript untuk frontend dibuat dari spesifikasi itu:

```powershell
cd apps\web; npm run gen:api     # menulis lib/api.gen.d.ts, CI memastikan file ini selalu sinkron
```

Metrik format Prometheus di `/metrics`, kesiapan di `/readyz`.

## Tes dan lint

```powershell
cd apps\api;          go vet ./... ; go test ./...   # tes integrasi butuh Postgres (TEST_DATABASE_URL, default :5433), dilewati kalau tidak ada
cd services\scraper;  ruff check . ; pytest tests -q
cd apps\web;          npx tsc --noEmit ; npm test ; npm run build
```

## Yang belum, dan peringatan

- **Sumber data masih scraping Google Maps dan website bisnis** lewat Playwright. Ini melanggar ToS Google dan
  akan diblokir pada volume SaaS. Sebelum ada pelanggan berbayar, ganti `services/scraper/gmaps.py` ke Google Places
  API atau penyedia pihak ketiga. Audit lengkap ada di percakapan pengembangan dan `docs/ARCHITECTURE.md`.
- Pelaporan error terpusat (Sentry) belum; log JSON ada di stdout tiap service.
- Analisis akun IG di panel detail bisnis sudah lewat worker (`/business`, `/run`). Yang masih Python legacy: chat agent,
  `/tools`, `/competitors`, `/report`; tersembunyi dari menu kecuali `NEXT_PUBLIC_LEGACY=1`.
- Draf kebijakan privasi di `/privacy` perlu ditinjau penasihat hukum.
