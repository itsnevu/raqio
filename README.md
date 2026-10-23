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
│   └── scraper/          Python: worker.py (riset, cek kontak, IG, asisten chat)
├── deploy/               compose.dev.yml (Postgres+Redis), compose.yml (produksi), Caddyfile
├── docs/ARCHITECTURE.md  arsitektur target dan tahapan
├── docs/SKOR.md          rumus semua angka (skor prospek, skor kekuatan, skor peringkat publik, ringkasan)
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

Prasyarat: Node 22, Go 1.25, Python 3.12, Docker.

```powershell
# 1. Postgres (port 5433, supaya tidak bentrok dengan Postgres lain di 5432) + Redis.
#    Keduanya hanya di-bind ke 127.0.0.1 (password dev sengaja lemah, jangan terbuka ke jaringan).
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

# 5. Frontend (terminal baru)
cd apps\web
npm install
copy .env.example .env.local      # AUTH_SECRET harus sama dengan apps/api
npm run dev                       # http://localhost:3000
```

Buka http://localhost:3000, daftar akun, lalu riset. `make help` memuat perintah singkatnya.

Catatan: Go membaca env dari proses, bukan dari file `.env`. Di PowerShell: `Get-Content .env | % { $k,$v = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k,$v) }` sebelum `go run .`.

## Tes e2e, monitoring, uji beban

- **E2E (Playwright)** di `e2e/`: `make e2e-install` sekali, lalu `make e2e` saat stack dev jalan (`.\dev.ps1`). Meliputi mode
  tamu, login dan open redirect, riset (hasil instan atau job yang bisa dihentikan), pengaturan dan API key, pantau,
  asisten, dan audit aksesibilitas (axe, pelanggaran serious/critical menggagalkan tes). Laporan HTML: `cd e2e && npm run report`.
- **Monitoring**: `docker compose -f deploy/compose.yml --env-file deploy/.env --profile monitoring up -d` menyalakan
  Prometheus (scrape `api:8080/metrics` dengan `METRICS_TOKEN`) dan Grafana di `127.0.0.1:3001` dengan dashboard
  "Raqio operasional" (request, job, durasi, antrean, webhook, alert). Akses dari laptop: `ssh -L 3001:127.0.0.1:3001 user@vps`.
- **Uji beban (k6)**: `make loadtest` atau lihat `deploy/loadtest/README.md`. Ambang p95 baca < 500 ms, error < 1%.

## Produksi (satu VPS)

```bash
cp deploy/.env.example deploy/.env
# isi DOMAIN, lalu rahasia: PG_PASSWORD=$(openssl rand -hex 24), AUTH_SECRET=$(openssl rand -hex 32),
# METRICS_TOKEN=$(openssl rand -hex 16), SMTP_*, dan BACKUP_AGE_RECIPIENT (kunci publik age, lihat runbook).
# Nilai AUTH_SECRET atau PG_PASSWORD yang kosong membuat compose menolak start.
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
```

Caddy mengurus TLS, HSTS, dan memblok `/metrics` dari luar jaringan privat. Hanya port 80/443 yang terbuka.
Worker bisa diperbanyak lewat `WORKER_REPLICAS`.

Yang diterapkan `deploy/compose.yml`:

- Tiga network: `edge` (caddy, web), `app` (caddy, web, api), `data` (api, worker, backup, postgres).
  Caddy tidak bisa menyentuh Postgres, worker tidak bisa menyentuh web, dan seterusnya.
- Semua container: `restart: unless-stopped`, `no-new-privileges`, `cap_drop: ALL` (Caddy hanya `NET_BIND_SERVICE`),
  batas memori (api 512m, web 512m, worker 2g, postgres 1g). `api` dan `web` berjalan read-only dengan tmpfs.
  Postgres jalan sebagai user `postgres` dan membaca password dari docker secret.
- Image dipin: `caddy:2.11.7-alpine`, `postgres:16.15-alpine`, `golang:1.25-alpine`, distroless dengan digest.
  Dependabot (`.github/dependabot.yml`) mengusulkan pembaruan mingguan.
- Asisten chat berjalan sebagai job di worker (butuh `OPENROUTER_API_KEY`). Alarm operasional ke Telegram atau
  webhook lewat `OPS_*`. Lihat `docs/runbook.md`.
- Backup harian `pg_dump | gzip | age` ke volume `backups`, terenkripsi dengan kunci publik `BACKUP_AGE_RECIPIENT`,
  opsional disalin ke S3 (`BACKUP_S3_URL`). Pulihkan: `docs/runbook.md`.

CI (`.github/workflows/ci.yml`) juga membangun image `api`, `web`, dan `worker`; pada push ke `main` image dipush ke
`ghcr.io/<owner>/<repo>/{api,web,worker}` dengan tag `sha-<commit>` dan `latest`.

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

## Sumber data selain Google Maps

Riset tidak lagi bergantung pada satu sumber. Setelah pindaian Maps, worker (`services/scraper/sources/`) menarik data
dari sumber lain untuk wilayah yang sama dan menggabungkannya dengan aturan yang bisa diperiksa:

| Sumber | Kunci | Isi | Lisensi |
|---|---|---|---|
| Overture Maps (data Meta/Facebook, Microsoft, Foursquare, AllThePlaces) | tidak perlu | nama, kategori, telepon, website, Instagram, email, alamat, skor keyakinan | CDLA-Permissive 2.0 |
| OpenStreetMap (Overpass) | tidak perlu | nama, kategori, telepon, website, contact:instagram | ODbL, atribusi |
| Google Places API (New) | `GOOGLE_PLACES_API_KEY` | data Maps resmi sesuai ToS, termasuk rating dan ulasan | kuota gratis bulanan |
| TomTom Search | `TOMTOM_API_KEY` | nama, kategori, telepon, website | kuota gratis harian |

Overture ditarik langsung dari Parquet publik di S3 dengan DuckDB (~15 detik per wilayah, di-cache 14 hari).
Aturan validitas: bisnis yang cocok dengan hasil Maps hanya dilengkapi kontaknya (asal tiap kontak dicatat di
`src_fields`); bisnis yang tidak ada di Maps dihitung hanya kalau kategorinya relevan, tidak tutup, keyakinan >= 0,5,
punya kontak, dan website-nya hidup saat dicek. Bisnis tambahan itu tidak punya rating, tidak ikut peringkat, dan
ditandai "tidak muncul di hasil Maps" (belum punya profil, atau di luar hasil teratas Maps; celah yang bisa ditawari: cek dan optimasi profil Google Maps). Pie "Sumber data" di laporan
menampilkan asal daftar bisnis, status tiap sumber, dan hasil validasi. Env: `MARKET_SOURCES` (default
`overture,osm`, `none` = hanya Maps), `OVERTURE_RELEASE`, `SOURCES_BUDGET_SEC`.

## Peringkat publik, sumber data, logo

Tiap baris peringkat memuat turunan angkanya persis (rating Bayesian dari C dan m wilayah, log ulasan vs ulasan terbanyak,
jumlah saluran kontak, lalu poin per bobot 60/25/15) supaya bisa dihitung ulang dengan kalkulator; `GET /rank` ikut
mengirim bahan pasar (`market`). Lencana SVG punya tema gelap dan terang (`?theme=light`) dan menampilkan peringkat, skor,
jumlah ulasan dengan nama industri/wilayah dalam Title Case. Halaman Riset menampilkan strip total data terkumpul dari
`GET /stats` (publik, cache 60 detik).

- **Peringkat publik** di `/top` dan `/top/<industri>/<wilayah>` (tanpa login): urutan memakai skor terbuka
  (60 × kualitas Bayesian + 25 × skala log ulasan + 15 × jangkauan website/IG/WA, rumus di `docs/SKOR.md`), tiap baris bisa
  dibuka untuk melihat komponen skornya, lencana SVG `GET /badge/<industri>/<wilayah>/<key>.svg` untuk ditempel di website
  bisnis, dan penghitung tampilan 7 hari. Sumbernya laporan asli terbaru pasangan itu dari org mana pun, tanpa kontak.
- **Sumber data** di tab Semua pemain: pie chart berapa bisnis yang dicek detail sekarang, yang detailnya dari database
  Raqio (pindaian sebelumnya), dan yang baru daftar Maps saja; tiap irisan dan tiap batang grafik bisa diklik untuk melihat
  bisnisnya. Worker menandai `detail_src`, `ig_src`, `seen_before` per bisnis dan `sources` per laporan.
- **Logo bisnis** diambil worker dengan filter (host sosial dilewati, Linktree dkk. hanya foto profil, gambar yang sama di 3+
  bisnis dibuang sebagai logo platform); lihat runbook bagian "Logo bisnis". Logo diklik di panel bisnis untuk diperbesar.
- **Notifikasi** (mode tamu, verifikasi email, tawaran panduan, pesan singkat, error) tampil di satu bar di bawah header dan
  masing-masing bisa ditutup dengan ×.

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

Metrik format Prometheus di `/metrics` (butuh `Authorization: Bearer <METRICS_TOKEN>`, dan di produksi Caddy hanya
mengizinkannya dari jaringan privat), kesiapan di `/readyz`.

## Tes, lint, audit

```powershell
cd apps\api;          go vet ./... ; go test ./...   # tes integrasi butuh Postgres (TEST_DATABASE_URL, default :5433), dilewati kalau tidak ada
cd services\scraper;  ruff check . ; pytest tests -q
cd apps\web;          npm run lint ; npx tsc --noEmit ; npm test ; npm run build
```

Dari root repo: `make test-api-integration` (tes Go dengan Postgres dev) dan `make audit` (`npm audit --omit=dev`,
`pip-audit`, `govulncheck` lewat container `golang:1.25-alpine`). CI menjalankan ketiganya di setiap PR.

## Yang belum, dan peringatan

- **Sumber data masih scraping Google Maps dan website bisnis** lewat Playwright. Ini melanggar ToS Google dan
  akan diblokir pada volume SaaS. Sebelum ada pelanggan berbayar, ganti `services/scraper/gmaps.py` ke Google Places
  API atau penyedia pihak ketiga. Audit lengkap ada di percakapan pengembangan dan `docs/ARCHITECTURE.md`.
- Pelaporan error terpusat memakai alarm `OPS_*` (Telegram atau webhook), bukan Sentry; log JSON ada di stdout tiap service.
- Semua fitur sudah lewat Go API dan worker; Python legacy (`app.py`, `templates/`) sudah dihapus.
- Draf kebijakan privasi di `/privacy` perlu ditinjau penasihat hukum.
