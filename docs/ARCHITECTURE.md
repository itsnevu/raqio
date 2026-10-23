# Arsitektur Target Raqio

> Status 22 Oktober 2026: Tahap 0 sampai 4 selesai. Python hanya worker (`services/scraper/worker.py`), semua
> endpoint di Go, antrean di Postgres, SSE untuk log, mode tamu, cache lintas org, alert pantauan, outbox webhook,
> RBAC, API key, audit log, asisten chat sebagai job. Rincian audit dan status: `docs/AUDIT.md`.

Dokumen ini menetapkan arsitektur yang dituju supaya Raqio bisa dipakai multi-klien (enterprise),
digarap banyak orang, dan di-scale tanpa menulis ulang. Bagian akhir berisi tahapan migrasi dari
kondisi sekarang.

## 1. Kondisi sekarang (ringkas)

| Bagian | Status | Masalah untuk skala |
|---|---|---|
| `apps/web` (Next.js) | UI jadi, semua data di-rewrite ke Python | Next hanya proxy, auth satu akun dari env |
| `apps/api` (Go) | Kerangka, hanya `/healthz` + reverse proxy | Belum punya domain apa pun |
| `services/scraper` (Python) | Memegang HTTP server, SQLite, job, LLM agent, scraping | Satu proses untuk semua: UI, data, job, scraping. Job pakai thread + subprocess, state di memori, SQLite satu file |

Masalah inti: **tidak ada batas tanggung jawab**. Python sekaligus jadi backend, worker, dan DB.
Scaling berarti menyalin seluruh proses, dan dua instance akan berebut SQLite dan `JOB` global.

## 2. Prinsip

1. **Satu sumber kebenaran**: Postgres. Tidak ada state penting di memori proses atau file lokal.
2. **Satu pintu**: semua request klien lewat Go API. Frontend tidak pernah menyentuh Python.
3. **Python = worker murni**: tidak punya HTTP server, tidak punya UI. Ambil job dari antrean, kerjakan, tulis hasil, selesai.
4. **Multi-tenant sejak awal**: setiap tabel bisnis punya `org_id`. Ditambahkan belakangan jauh lebih mahal.
5. **Modul vertikal**: kode dikelompokkan per domain (market, leads, watch, jobs), bukan per lapisan teknis.
6. **Konfigurasi dari environment**, rahasia tidak pernah di repo. Satu `.env.example` per app.
7. **Bisa jalan di satu VPS dengan Docker Compose**, dan pindah ke Kubernetes tanpa ubah kode.

## 3. Topologi

```
                 +--------------+
  browser -----> | Caddy/Nginx  |  TLS, rate limit, static
                 +------+-------+
            /           | /api/*
   +--------v-------+   v
   | apps/web       |  +------------------+
   | Next.js (SSR)  |->| apps/api  (Go)   |<-- SSE log job, webhook
   +----------------+  | auth, RBAC, REST |
                       | domain, antrean  |
                       +--+----------+----+
                          |          | enqueue (Postgres queue / NATS)
                 +--------v---+  +---v--------------------------+
                 | Postgres   |  | services/scraper (Python)    |  x N replika
                 | + Redis    |<-| worker: gmaps, ig, osm,      |
                 +------------+  | trends, insight LLM          |
                                 +------------------------------+
```

Komponen:

- **Caddy** (atau Nginx): TLS otomatis, satu domain. `/api/*` ke Go, sisanya ke Next.
- **apps/web**: hanya UI. Server Components memanggil Go lewat `API_URL` internal. Tidak ada rewrite ke Python.
- **apps/api**: semua logika bisnis, auth, otorisasi, validasi, antrean job, SSE untuk log.
- **services/scraper**: worker horizontal. Boleh jalan 1 atau 20 replika, tidak saling kenal.
- **Postgres**: data domain + tabel antrean job (`FOR UPDATE SKIP LOCKED`).
- **Redis**: cache, rate limit, pub/sub untuk streaming log job. Opsional di fase awal.
- **Object storage (S3/MinIO)**: artefak besar (HTML report, screenshot, CSV ekspor).

Kenapa antrean di Postgres dulu, bukan RabbitMQ/Kafka: lintas bahasa (Go enqueue, Python consume)
tanpa infra tambahan, transaksional bersama data, cukup sampai ribuan job per jam. Kalau sudah lewat itu,
ganti ke NATS JetStream dengan mengubah satu adapter di masing-masing sisi.

## 4. Struktur repo target

```
raqio/
├── apps/
│   ├── web/                         Next.js 15, App Router
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (app)/               layout dengan Shell, butuh sesi
│   │   │   │   ├── market/
│   │   │   │   ├── prospects/
│   │   │   │   ├── watch/
│   │   │   │   └── settings/        org, anggota, API key
│   │   │   └── api/                 hanya route yang memang milik Next
│   │   ├── features/                komponen + hook per domain (market/, leads/, watch/, jobs/)
│   │   ├── components/ui/           komponen generik (Button, Table, Card, Toast)
│   │   ├── lib/
│   │   │   ├── api/                 client ke Go, typed, satu tempat (fetch wrapper + tipe dari OpenAPI)
│   │   │   ├── auth/                baca sesi dari cookie, redirect
│   │   │   └── format.ts            port dari biz.ts (fmt angka, WA link, dll)
│   │   └── middleware.ts            cek cookie sesi, tidak ada logika bisnis
│   │
│   └── api/                         Go 1.23+
│       ├── cmd/api/main.go          wiring: config, db, router, server
│       ├── internal/
│       │   ├── config/              load env, validasi di startup
│       │   ├── http/                router (chi), middleware (auth, org, logging, recover, CORS), response helper
│       │   ├── auth/                login, sesi, password hash, API key, RBAC
│       │   ├── org/                 organisasi, anggota, peran
│       │   ├── market/              laporan riset pasar: handler.go, service.go, repo.go, model.go
│       │   ├── leads/               papan prospek, status, catatan, pengingat
│       │   ├── watch/               pantauan berkala, perubahan antar snapshot
│       │   ├── business/            entitas bisnis (hasil scraping bersih), dedupe key
│       │   ├── jobs/                antrean: enqueue, status, log stream (SSE), retry, cancel
│       │   ├── insight/             pemanggilan LLM (OpenRouter), prompt, guard "tanpa em dash"
│       │   └── notify/              Telegram, Slack, email
│       ├── pkg/                     util yang boleh dipakai luar (phone, url normalizer, pagination)
│       ├── db/
│       │   ├── migrations/          goose, SQL murni, satu file per perubahan
│       │   └── queries/             sqlc, SQL -> kode Go bertipe
│       ├── api/openapi.yaml         kontrak REST, dipakai web untuk generate tipe
│       └── Dockerfile
│
├── services/
│   └── scraper/                     Python 3.12, paket terinstal (bukan skrip lepas)
│       ├── pyproject.toml
│       ├── raqio_scraper/
│       │   ├── worker.py            loop: ambil job, dispatch ke handler, laporkan progres
│       │   ├── jobs/                satu modul per jenis job: market_scan.py, ig_profile.py, watch_check.py, insight.py
│       │   ├── sources/             adapter per sumber: gmaps.py, instagram/, osm.py, trends.py, socialblade.py, website.py
│       │   ├── cleaning/            port dari datastore.py: normalize, validate, filter_area, dedupe
│       │   ├── scoring/             lead_score, relevance, power score (port dari market.py)
│       │   ├── store/               repo Postgres (psycopg3), tidak ada SQLite
│       │   ├── net/                 proxy rotator, session, retry, rate limit, compliance
│       │   └── config.py
│       ├── tests/
│       └── Dockerfile
│
├── packages/
│   └── contracts/                   skema job (JSON Schema) yang disepakati Go dan Python
│
├── deploy/
│   ├── compose.yml                  produksi satu VPS
│   ├── compose.dev.yml              dev: hanya Postgres + Redis, app jalan lokal
│   ├── Caddyfile
│   └── k8s/                         nanti, kalau sudah perlu
│
├── docs/
│   ├── ARCHITECTURE.md              dokumen ini
│   ├── adr/                         keputusan arsitektur, satu file per keputusan
│   └── runbook.md                   cara deploy, rollback, cek log
│
├── .github/workflows/ci.yml         lint + test + build per app, path filter
├── Makefile                         make dev, make test, make migrate, make build
└── README.md
```

Yang **dihapus** setelah migrasi selesai: `services/scraper/app.py`, `templates/`, `report_dashboard.py`
(HTML report jadi halaman Next atau ekspor PDF dari Go), `ig.db`, semua `rewrites` di `next.config.ts`.

## 5. Model data (Postgres)

Semua tabel domain punya `org_id`, `created_at`, `updated_at`. ID pakai UUID v7.

```
orgs            id, name, plan, settings jsonb
users           id, email, password_hash, name, status
memberships     org_id, user_id, role (owner | admin | analyst | viewer)
api_keys        id, org_id, hash, label, last_used_at

businesses      id, org_id, dedupe_key, place_id, name, category, address, lat, lon,
                phone, website, instagram, rating, reviews, raw jsonb, first_seen, last_seen
business_snapshots  business_id, taken_at, rating, reviews, followers, er   (riwayat untuk tren)

market_reports  id, org_id, industry, area, params jsonb, summary jsonb, status, job_id
report_items    report_id, business_id, lead_score, reasons jsonb, relevance, power
category_relevance  org_id, industry, category, verdict, source (rule | llm)

leads           id, org_id, business_id, status, note, remind_at, owner_user_id
lead_events     lead_id, user_id, type, payload jsonb, at

watches         id, org_id, industry, area, interval, last_run_at, next_run_at, enabled
watch_runs      watch_id, report_id, diff jsonb

jobs            id, org_id, type, payload jsonb, status, priority, attempts, max_attempts,
                run_after, locked_by, locked_at, heartbeat_at, result jsonb, error, created_at
job_logs        job_id, seq, at, level, line            (atau Redis stream, dibersihkan 7 hari)

audit_log       org_id, user_id, action, target, at
```

Aturan:

- Worker hanya menulis ke `businesses`, `business_snapshots`, `report_items`, `jobs`, `job_logs`.
- Logika lead score, relevansi, dan power tetap di Python (dekat data mentah), tetapi hasilnya
  disimpan sebagai kolom, bukan dihitung ulang di API.
- Dedupe pakai `dedupe_key` deterministik (port dari `_same`, `name_key`, `norm_phone`) dan unique index
  `(org_id, dedupe_key)` supaya dua worker paralel tidak membuat duplikat.

## 6. Kontrak job (Go ke Python)

Satu jenis job = satu skema payload di `packages/contracts/jobs/*.json`. Contoh:

```json
{ "type": "market_scan", "org_id": "...", "report_id": "...",
  "industry": "coffee shop", "area": "Kemang Jakarta",
  "max_results": 120, "detail_limit": 30 }
```

Siklus:

1. API `POST /v1/market/reports` membuat `market_reports(status=queued)` dan baris `jobs` dalam satu transaksi.
2. Worker `SELECT ... FOR UPDATE SKIP LOCKED` ambil job, set `locked_by=hostname:pid`.
3. Worker kirim progres ke `job_logs` (dan publish ke Redis channel `job:<id>` untuk SSE).
4. Selesai: `jobs.status=done`, `market_reports.status=ready`. Gagal: `attempts++`, backoff eksponensial,
   setelah `max_attempts` jadi `failed` dan `notify` kirim alert.
5. Cancel: API set `status=cancelling`, worker cek flag tiap langkah dan berhenti bersih. Ini mengganti
   `JOB["proc"].kill()` yang sekarang.

Stale lock: job `running` yang `heartbeat_at`-nya lebih tua dari N menit dikembalikan ke `queued`.

## 7. API (Go)

- Prefix `/v1`, JSON, error format seragam `{ "error": { "code", "message", "fields" } }`.
- Auth: cookie sesi HttpOnly (untuk web) **dan** `Authorization: Bearer <api key>` (untuk integrasi).
  Keduanya diselesaikan jadi `Principal{user_id, org_id, role}` di middleware.
- Setiap handler menerima `org_id` dari principal, tidak pernah dari body atau query.
- Endpoint inti (pemetaan dari route Python sekarang):

| Sekarang (Python) | Target (Go) |
|---|---|
| `GET /market/reports` | `GET /v1/market/reports?industry=&area=` |
| `GET /market/report?id=` | `GET /v1/market/reports/{id}` |
| `POST /market/run` | `POST /v1/market/reports` (balas 202 + job_id) |
| `POST /market/detail` | `POST /v1/market/reports/{id}/items/{biz}/enrich` |
| `GET /market/compare`, `POST /market/compare/run` | `POST /v1/market/compare` |
| `POST /market/lead` | `PATCH /v1/leads/{id}` |
| `GET /prospects/data` | `GET /v1/leads?min_score=` |
| `GET /market/watches`, `POST /market/watch` | `GET/POST /v1/watches`, `DELETE /v1/watches/{id}` |
| `GET /watch/data` | `GET /v1/watches/overview` |
| `GET /log`, `POST /stop` | `GET /v1/jobs/{id}/logs` (SSE), `POST /v1/jobs/{id}/cancel` |
| `POST /chat`, `GET /chat/poll` | `POST /v1/insight/chat` (SSE streaming) |

- Pola tiap modul: `handler.go` (HTTP, validasi), `service.go` (aturan bisnis, transaksi), `repo.go` (sqlc).
  Handler tidak menyentuh DB, repo tidak tahu HTTP.
- Kontrak di `openapi.yaml`, tipe TypeScript di web di-generate dari situ (`openapi-typescript`).

## 8. Frontend (Next.js)

- Server Components ambil data langsung dari Go (`API_URL` internal, bukan lewat browser) dan teruskan
  cookie. Client Components hanya untuk interaksi (filter, status job, SSE).
- Satu fetch wrapper di `lib/api/client.ts`: base URL, cookie, error parsing, retry idempoten.
- Halaman per fitur di `features/<domain>/`, bukan satu `page.tsx` 800 baris. Target `market/page.tsx`
  dipecah jadi `ReportHeader`, `PositionMap`, `CategoryMix`, `BizTable`, `BizCard`, `LeadDrawer`.
- Status job ditampilkan lewat SSE `GET /v1/jobs/{id}/logs`, bukan polling `/log` tiap detik.

## 9. Keamanan dan multi-tenant

- Password: argon2id. Sesi: random token 32 byte, disimpan hash-nya di DB, bisa dicabut.
- RBAC minimal: `viewer` baca, `analyst` jalankan job dan ubah lead, `admin` kelola anggota dan watch,
  `owner` billing dan hapus org.
- Semua query repo wajib memfilter `org_id`. Tes integrasi memastikan org A tidak bisa membaca data org B.
- Rate limit per org di edge (Caddy) dan per API key di Go.
- Data hasil scraping berisi telepon dan email bisnis: enkripsi disk di VPS, retensi snapshot dibatasi,
  ekspor dicatat di `audit_log`.
- Worker scraping tidak membuka port apa pun. Hanya koneksi keluar ke Postgres, Redis, dan target scraping.

## 10. Observability

- Log terstruktur JSON di tiga app (Go: `slog`, Python: `structlog`, Next: `pino`), selalu bawa
  `request_id`, `org_id`, `job_id`.
- Metrik Prometheus: `/metrics` di Go dan worker. Minimal: latency per endpoint, antrean per tipe job
  (queued/running/failed), durasi job, rasio scrape gagal per sumber.
- Tracing OpenTelemetry ke Grafana Tempo atau Jaeger. Trace mengikuti request, job, lalu worker.
- Error ke Sentry (ketiga app). Health: `/healthz` (proses hidup) dan `/readyz` (DB dan Redis bisa dicapai).

## 11. Deploy

**Fase VPS (Docker Compose)**, cukup sampai puluhan klien:

```
services: caddy, web, api, worker (replicas: 2), postgres, redis, minio
volumes : pgdata, miniodata, caddy_data
```

- Image dibangun di CI, push ke GHCR, VPS tinggal `docker compose pull && docker compose up -d`.
- Migrasi DB jalan sebagai init step `api` sebelum serve (`goose up`), idempoten.
- Backup Postgres harian `pg_dump` ke object storage, uji restore sebulan sekali.
- Worker Playwright butuh image dengan Chromium, pisahkan dari image API supaya API tetap kecil.

**Fase berikutnya**: manifest `deploy/k8s/` dengan HPA untuk worker berdasar panjang antrean.
Tidak ada perubahan kode, hanya cara menjalankan.

CI (`.github/workflows/ci.yml`): job terpisah per app dengan `paths:` filter. Go: `vet`, `golangci-lint`,
`go test ./...`. Python: `ruff`, `mypy`, `pytest`. Web: `tsc`, `eslint`, `next build`. Merge ke `main`
membangun image dan memberi tag SHA.

## 12. Tahapan migrasi dari kondisi sekarang

Setiap tahap bisa di-deploy sendiri, sistem tetap jalan di antaranya.

**Tahap 0, rapikan dasar (1 hari)**
- Selesaikan dan commit pemindahan ke monorepo yang sekarang masih tertunda di working tree.
- Tambah `deploy/compose.dev.yml` (Postgres + Redis), `Makefile`, CI dasar.
- `services/scraper` jadi paket `raqio_scraper` dengan `pyproject.toml`, tes yang ada tetap lolos.

**Tahap 1, Postgres dan skema (2 hari)**
- Tulis migrasi untuk tabel di bagian 5. Skrip sekali jalan memindahkan isi `ig.db` ke Postgres dengan `org_id` default.
- Python `store/` menulis ke Postgres. SQLite dihapus.

**Tahap 2, Go pegang auth dan baca data (3 hari)**
- Modul `auth`, `org`, `market` (hanya GET), `leads`, `watch` (GET) di Go.
- Next `lib/api` diarahkan ke Go untuk endpoint baca. Rewrite ke Python dikurangi satu per satu.

**Tahap 3, antrean job (3 hari)**
- Tabel `jobs`, modul `jobs` di Go, `worker.py` di Python. `POST /v1/market/reports` enqueue.
- SSE log menggantikan polling `/log`. `app.py` tidak lagi dipanggil untuk run.

**Tahap 4, matikan HTTP Python (1 hari)**
- Hapus `app.py`, `templates/`, `report_dashboard.py`, dan seluruh `rewrites`. Port 8000 tidak ada lagi.

**Tahap 5, enterprise hardening (berkelanjutan)**
- RBAC penuh, API key, audit log, rate limit, Sentry, metrik, backup teruji, runbook.

## 13. Keputusan yang sengaja ditunda

- Microservice per sumber scraping: tidak perlu. Satu worker dengan banyak job type sudah cukup dan lebih mudah dioperasikan.
- Kafka/RabbitMQ: baru kalau Postgres queue terbukti jadi hambatan.
- GraphQL: REST + OpenAPI cukup, klien hanya satu.
- Memindahkan scoring ke Go: tunggu sampai aturan scoring stabil, sekarang masih sering berubah.

Setiap keputusan baru dicatat sebagai ADR di `docs/adr/`.
