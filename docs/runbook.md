# Runbook Raqio (VPS, Docker Compose)

Semua perintah dijalankan di VPS dari root repo. File rahasia ada di `deploy/.env` (salin dari `deploy/.env.example`).

## Deploy pertama kali

```bash
git clone https://github.com/itsnevu/raqio.git && cd raqio
cp deploy/.env.example deploy/.env
# isi DOMAIN, SMTP, Xendit, lalu rahasia (jangan pakai nilai contoh):
#   PG_PASSWORD=$(openssl rand -hex 24)   AUTH_SECRET=$(openssl rand -hex 32)   METRICS_TOKEN=$(openssl rand -hex 16)
#   BACKUP_AGE_RECIPIENT=age1...          (kunci publik, lihat bagian Backup)
docker compose -f deploy/compose.yml --env-file deploy/.env config --quiet   # gagal kalau AUTH_SECRET/PG_PASSWORD kosong
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
```

Caddy mengurus TLS otomatis untuk `DOMAIN`. Hanya port 80 dan 443 yang terbuka. Migrasi DB jalan sendiri saat `api` start.

Susunan container (`deploy/compose.yml`):

| Network | Anggota | Catatan |
|---|---|---|
| `edge` | caddy, web | satu-satunya jalur dari internet |
| `app` | web, api | Next meneruskan `/auth`, `/market`, dst ke `api:8080` |
| `data` | api, worker, backup, postgres | hanya mereka yang bisa membuka Postgres |

Semua container `restart: unless-stopped`, `no-new-privileges`, `cap_drop: ALL`, dan batas memori (api 512m, web 512m,
worker 2g, postgres 1g, caddy dan backup 256m). `api` dan `web` read-only. Kalau salah satu terus restart karena OOM,
naikkan `deploy.resources.limits.memory` service itu di `compose.yml`.

### Asisten chat dan alarm operasional

Asisten (halaman `/`) berjalan sebagai job `chat` di worker: riwayat per org di tabel `chat_sessions` dan
`chat_messages`, kuota `limits.chats` per paket, bisa dihentikan lewat `POST /chat/stop`. Butuh `OPENROUTER_API_KEY`
di env worker; tanpa itu jawabannya "asisten belum dikonfigurasi". `CHAT_ENABLED=0` di api mematikan endpoint.

Alarm operasional tanpa Sentry: isi `OPS_TELEGRAM_CHAT` (bot yang sama dengan `TELEGRAM_BOT_TOKEN`) atau
`OPS_WEBHOOK_URL` + `OPS_WEBHOOK_SECRET`. API mengirim alarm saat panic, respons 5xx lebih dari `OPS_5XX_THRESHOLD`
dalam 5 menit, job gagal final 5 kali dalam 10 menit, webhook pelanggan menyerah, atau DB tidak terjangkau tiga kali
berturut. Jenis alarm yang sama dikirim maksimal sekali per 10 menit.

Ringkasan prospek jatuh tempo dikirim sekali sehari pada `DIGEST_HOUR` (Asia/Jakarta) ke saluran notifikasi org
(email, Telegram, webhook event `lead.reminder`). Tabel `org_digest` mencatat kapan terakhir dikirim.

Legacy Python (`app.py`, `templates/`, service `legacy`) sudah dihapus; worker hanya menjalankan `worker.py`.

### Image dari GHCR

CI mendorong `ghcr.io/itsnevu/raqio/{api,web,worker}:sha-<commit>` dan `:latest` di setiap push ke `main`. Deploy
tetap memakai `--build` dari sumber (sederhana, satu VPS). Kalau ingin memakai image CI, ganti `build:` service
terkait di `compose.yml` dengan `image: ghcr.io/itsnevu/raqio/api:sha-<commit>` dan `docker login ghcr.io` dulu.

## Update versi

```bash
git pull
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
```

Cek sesudahnya:

```bash
docker compose -f deploy/compose.yml ps
curl -s https://DOMAIN/readyz          # {"status":"ready"}
```

## Rollback

```bash
git log --oneline -5                    # cari commit yang sehat
git checkout <sha>
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
```

Migrasi DB tidak otomatis mundur. Kalau rilis yang gagal membawa migrasi baru, pulihkan dari backup (bawah) sebelum rollback kode.

## Log

```bash
docker compose -f deploy/compose.yml logs -f api        # request, scheduler, error
docker compose -f deploy/compose.yml logs -f worker     # job riset, satu baris JSON per kejadian
docker compose -f deploy/compose.yml logs --tail 200 caddy
```

Log API dan worker berformat JSON. Cari job tertentu: `logs worker | grep '"job 123'`.

## Health dan metrik

| Endpoint | Arti |
|---|---|
| `GET /healthz` | proses API hidup, tidak menyentuh DB |
| `GET /readyz` | API siap, DB bisa dicapai. 503 kalau DB putus |
| `GET /metrics` | format Prometheus: request per kelas status, inflight, ditolak rate limit, job per status, umur job antri tertua |

`/metrics` butuh header `Authorization: Bearer <METRICS_TOKEN>` (kosong = selalu ditolak), dan Caddy membalas 404
untuk `/metrics` dari luar jaringan privat. Prometheus sebaiknya ada di docker network `data` atau `app` dan scrape
`api:8080/metrics` langsung. Cek manual dari VPS:

```bash
docker compose -f deploy/compose.yml exec web node -e \
  "fetch('http://api:8080/metrics',{headers:{authorization:'Bearer '+process.argv[1]}}).then(r=>r.text()).then(t=>console.log(t))" "$METRICS_TOKEN"
```

Tanda bahaya:

- `raqio_jobs{status="queued"}` terus naik dan `raqio_jobs_oldest_queued_seconds` lebih dari 900: worker mati atau kurang. Naikkan `WORKER_REPLICAS` di `deploy/.env`, lalu `up -d`.
- `raqio_rate_limited_total` naik cepat: ada klien yang membanjiri. Lihat IP di log Caddy.

## Antrean job

```bash
docker compose -f deploy/compose.yml exec postgres psql -U raqio -c \
  "SELECT id, org_id, kind, status, attempts, max_attempts, heartbeat_at FROM jobs WHERE status IN ('queued','running') ORDER BY id"
```

- Job `running` tanpa heartbeat 10 menit otomatis diantrekan ulang (selama `attempts < max_attempts`), sisanya `failed`.
- Job gagal dicoba ulang dengan jeda 1, 2, 4 menit sampai 15 menit, maksimal 3 kali.
- Paksa ulang satu job: `UPDATE jobs SET status='queued', attempts=0, run_after=now() WHERE id=<id>;`
- Batalkan: `UPDATE jobs SET cancel_requested=true WHERE id=<id>;`

## Peran dan API key

Peran anggota org, dari yang paling rendah: `viewer` (hanya baca), `analyst` (jalankan riset, ubah lead, pantau), `admin` (undang dan keluarkan anggota, pengaturan org, kelola API key), `owner` (billing, hapus org). Undangan membawa peran: `POST /org/invite {"email","role"}`. Seseorang tidak bisa memberi peran lebih tinggi dari miliknya.

API key untuk integrasi, dibuat admin atau owner di `POST /org/api-keys {"label","role"}`. Nilai key hanya ditampilkan sekali. Pemakaian:

```bash
curl -H "Authorization: Bearer rq_..." https://DOMAIN/market/reports
```

Key mengikuti peran yang diberikan saat dibuat (maksimal admin), tidak kena cek CSRF, dan ikut audit log. Cabut dengan `POST /org/api-keys/revoke {"id"}`. Key menjadi tidak berlaku juga kalau akun pembuatnya dihapus.

Stream log job tanpa polling: `GET /log/stream?job=<id>` (SSE, event `log` berisi potongan log baru dan `done` saat selesai).

## Alert pantauan, notifikasi, webhook, hasil instan

Loop `alertLoop` (tiap menit) memeriksa laporan baru, membandingkan dengan laporan sebelumnya untuk industri+wilayah yang sama di org itu, lalu menyimpan `watch_alerts` (ringkasan, tingkat, detail perubahan) dan mengirim ke saluran org di `org_settings`: `notify_email` (kosong = email owner dan admin), `telegram_chat` (butuh `TELEGRAM_BOT_TOKEN` di API), dan `webhook_url` + `webhook_secret`.

Webhook: POST JSON `{event, org_id, at, data}` dengan header `X-Raqio-Event` (`ping`, `report.done`, `watch.alert`) dan `X-Raqio-Signature: sha256=<HMAC-SHA256 body dengan secret>`. Dicoba 3 kali dengan backoff. Tes dari UI Pengaturan atau `POST /org/webhook/test`.

Hasil instan: `POST /market/run` menyalin laporan org mana pun untuk pasangan yang sama dalam `MARKET_CACHE_DAYS` hari (default 7) tanpa job dan tanpa kuota, balasan `{"cached":true,"report_id":..}`. Kirim `{"fresh":true}` untuk memaksa pindai ulang. `GET /market/suggest` memberi pasangan yang tersedia instan, dipakai chip "Coba instan" di halaman riset.

## Monitoring (Prometheus dan Grafana)

```bash
docker compose -f deploy/compose.yml --env-file deploy/.env --profile monitoring up -d
ssh -L 3001:127.0.0.1:3001 user@vps      # lalu buka http://localhost:3001 (admin / GRAFANA_ADMIN_PASSWORD)
```

Prometheus men-scrape `api:8080/metrics` tiap 30 detik memakai `METRICS_TOKEN` (file `deploy/monitoring/prometheus.yml`),
retensi `PROM_RETENTION` (default 30 hari). Dashboard "Raqio operasional" diprovisi dari
`deploy/monitoring/grafana/dashboards/raqio.json`: request per kelas status, inflight, rate limit, job per status, umur
antrean tertua, durasi job p50 dan p90 per jenis, job gagal 24 jam, outbox webhook, alert pantauan, job asisten, laju 5xx.
Cek target: `docker compose ... exec prometheus wget -qO- http://localhost:9090/api/v1/targets`.

### Uji restore otomatis

`deploy/restore-check.sh` memulihkan backup terbaru ke database sementara `raqio_restore_check`, menghitung baris
org, user, laporan, job, lalu menghapusnya. Jalankan mingguan lewat cron di VPS:

```bash
# /etc/cron.weekly/raqio-restore-check
cd /opt/raqio && docker compose -f deploy/compose.yml --env-file deploy/.env run --rm   -e BACKUP_AGE_KEY_FILE=/run/age.key -v /root/raqio-backup.key:/run/age.key:ro backup sh /restore-check.sh   || curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" -d chat_id="$OPS_TELEGRAM_CHAT" -d text="Raqio: uji restore backup GAGAL"
```

Skrip keluar dengan kode 1 kalau restore gagal atau tabel `orgs` kosong, jadi cron bisa mengirim alarm.

### Alert Prometheus ke Telegram

Profile `monitoring` juga menjalankan Alertmanager (`deploy/monitoring/alertmanager.yml`) yang mengirim ke
`OPS_TELEGRAM_CHAT` lewat `TELEGRAM_BOT_TOKEN`. Aturan di `deploy/monitoring/alerts.yml`: API tidak bisa di-scrape 2 menit,
job antre lebih dari 15 menit, 5xx lebih dari 4 per menit, job gagal lebih dari 5 dalam 24 jam, outbox webhook lebih dari
50 pending, rate limit lebih dari 100 per menit. Alarm dari API sendiri (`OPS_*`) tetap jalan tanpa Prometheus; keduanya
saling melengkapi (Prometheus melihat dari luar, termasuk saat API mati).

## Tes e2e dan uji beban

- `make e2e` menjalankan Playwright di `e2e/` terhadap `E2E_BASE_URL` (default dev `http://localhost:3000`) dan
  `E2E_API_URL` (default `http://localhost:8080`). Di CI, job `e2e` menjalankan API dan web lalu suite yang sama.
- `make loadtest` menjalankan k6 (`deploy/loadtest/k6-api.js`) terhadap stack dev. Lihat `deploy/loadtest/README.md`.

## Logo bisnis

Worker mengambil logo saat riset (apple-touch-icon / ikon / og:image website, foto profil Instagram dari cache, lalu foto kartu
Google Maps) dan menyimpannya di tabel `business_logos` (PNG 256 px, global per bisnis, kolom `phash` = sidik jari gambar).
API menyajikannya di `GET /logo/<key>` dengan cache 7 hari; di UI logo bisa diklik untuk diperbesar.

Filter supaya tidak asal ambil (`services/scraper/logo.py`):

- Host sosial/marketplace/peta (Instagram, Facebook, wa.me, Shopee, Tokopedia, GoFood, Google, …) dilewati.
- Host agregator tautan (Linktree, bio.link, beacons.ai, lynk.id, …) hanya boleh gambar profilnya (og:image), bukan favicon
  platform (asterisk hijau Linktree).
- Gambar lebih kecil dari 32 px atau polos (satu warna) ditolak.
- Gambar yang sama dipakai 3+ bisnis berbeda dianggap logo platform/tema: dihapus, sidik jarinya masuk tabel `logo_generic`
  dan tidak akan dipakai lagi. `logo.py --backfill` menjalankan pembersihan ini dulu (`purge_generic`).

Laporan lama yang belum punya logo diisi dengan:

```bash
docker compose -f deploy/compose.yml --env-file deploy/.env run --rm worker python logo.py --backfill --reports 50
```

## Stream log job (SSE) lewat proxy

`GET /log/stream` mengirim `Cache-Control: no-cache, no-transform`. Tanpa `no-transform`, kompresi gzip di proxy (Next dev,
Caddy) menahan event sampai koneksi ditutup sehingga panel progres diam di "Menunggu giliran worker" padahal job jalan.
Klien juga punya pengaman: kalau 8 detik tidak ada event pertama, EventSource ditutup dan jatuh ke polling `GET /log?job=`.

## Jejak audit

Setiap request tulis yang bersesi (POST/PATCH/DELETE) dan setiap login dicatat ke tabel `audit_log` beserta org, user, IP, request id, dan status HTTP. Retensi 365 hari.

```bash
docker compose -f deploy/compose.yml exec postgres psql -U raqio -c   "SELECT at, action, status, ip, user_id FROM audit_log WHERE org_id='<org>' ORDER BY id DESC LIMIT 50"
```

Setiap respons API membawa header `X-Request-Id`. Nilai yang sama ada di log API (`rid`) dan di `audit_log.request_id`, jadi satu keluhan pengguna bisa dilacak ujung ke ujung.

## Backup dan pulihkan

Service `backup` (skrip `deploy/backup.sh`, image `postgres:16.15-alpine` supaya `pg_dump` seversi dengan server)
tiap 24 jam menjalankan `pg_dump | gzip | age` ke volume `backups`, menyimpan `BACKUP_KEEP_DAYS` hari (default 14),
lalu opsional menyalin ke S3. Dump berisi hash password dan `webhook_secret`, jadi enkripsi wajib di produksi.

Siapkan kunci **di mesin lain, bukan di VPS** (`age` ada di apt, brew, dan scoop):

```bash
age-keygen -o raqio-backup.key            # simpan file ini di tempat aman (password manager, vault)
grep 'public key' raqio-backup.key        # age1... masuk ke BACKUP_AGE_RECIPIENT di deploy/.env
```

Tanpa `BACKUP_AGE_RECIPIENT`, backup tetap jalan tapi hanya gzip dan log backup mencetak PERINGATAN tiap putaran.
Offsite: isi `BACKUP_S3_URL=s3://bucket/raqio` plus `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`
(dan `AWS_ENDPOINT_URL` untuk MinIO/R2). `age` dan `aws-cli` dipasang lewat `apk` saat container start, jadi container
backup butuh akses keluar.

```bash
docker compose -f deploy/compose.yml logs --tail 5 backup                   # "backup: ok /backups/raqio-....sql.gz.age (12M)"
docker run --rm -v deploy_backups:/b alpine ls -lh /b                        # nama volume: <project>_backups, project = nama folder compose (deploy)
docker compose -f deploy/compose.yml run --rm -e BACKUP_ONCE=1 backup        # backup manual sekali jalan (sebelum migrasi besar)
```

Kalau tidak memakai S3, salin ke luar VPS secara berkala (volume ikut hilang kalau disk rusak):

```bash
docker run --rm -v deploy_backups:/b -v $PWD:/out alpine sh -c 'cp /b/$(ls -t /b | head -1) /out/'
scp raqio-*.sql.gz.age user@mesin-lain:/backup/raqio/
```

Pulihkan ke database baru lalu tukar. Dekripsi butuh file kunci privat (`raqio-backup.key`), yang sengaja tidak ada
di VPS; salin sementara ke VPS lalu hapus, atau dekripsi di mesin lain dan kirim hasil `.sql.gz`-nya:

```bash
docker compose -f deploy/compose.yml stop api worker
docker compose -f deploy/compose.yml exec postgres psql -U raqio -c "DROP DATABASE IF EXISTS raqio_restore; CREATE DATABASE raqio_restore;"

# terenkripsi (.sql.gz.age). Network: <project>_data, project = nama folder compose (deploy)
docker run --rm -i -v deploy_backups:/b -v $PWD/raqio-backup.key:/key:ro --network deploy_data \
  -e PGPASSWORD="$PG_PASSWORD" postgres:16.15-alpine sh -c \
  'apk add --no-cache age >/dev/null && age -d -i /key /b/raqio-YYYYMMDD-HHMMSS.sql.gz.age | gunzip -c | psql -h postgres -U raqio raqio_restore'

# tanpa enkripsi (.sql.gz)
docker run --rm -i -v deploy_backups:/b --network deploy_data -e PGPASSWORD="$PG_PASSWORD" postgres:16.15-alpine \
  sh -c 'gunzip -c /b/raqio-YYYYMMDD-HHMMSS.sql.gz | psql -h postgres -U raqio raqio_restore'

docker compose -f deploy/compose.yml exec postgres psql -U raqio -c \
  "ALTER DATABASE raqio RENAME TO raqio_old; ALTER DATABASE raqio_restore RENAME TO raqio;"
docker compose -f deploy/compose.yml start api worker
shred -u raqio-backup.key                                                     # kalau tadi disalin ke VPS
```

Dari S3: `aws s3 cp s3://bucket/raqio/raqio-....sql.gz.age .` dulu, lalu langkah yang sama dengan `-v $PWD:/b`.

Uji restore sebulan sekali (termasuk dekripsi, supaya tahu kuncinya masih ada), cukup sampai langkah
`psql ... raqio_restore` lalu `DROP DATABASE raqio_restore`.

## Sumber data selain Google Maps (worker)

Paket `services/scraper/sources/` menambah data dari sumber lain setelah pindaian Maps (`MARKET_SOURCES`, default
`overture,osm`; `places_api` dan `tomtom` ikut aktif otomatis kalau `GOOGLE_PLACES_API_KEY` / `TOMTOM_API_KEY` ada;
`none` mematikan). Total waktu dibatasi `SOURCES_BUDGET_SEC` (default 240 detik) dan tiap sumber punya jatah sendiri;
sumber yang gagal tidak menggagalkan riset (status `error` tercatat di `report.sources.providers`).

- **Overture**: DuckDB membaca `s3://overturemaps-us-west-2/release/<rilis>/theme=places/type=place/*` dengan filter kotak
  koordinat (hanya row group yang beririsan yang diunduh). Ekstensi `httpfs` dipasang sekali ke
  `RAQIO_DATA_DIR/duckdb_ext` (butuh akses ke extensions.duckdb.org saat pertama kali). Rilis terbaru dibaca dari katalog
  STAC `stac.overturemaps.org` (cache 7 hari), paksa dengan `OVERTURE_RELEASE=2026-10-21.0`. Hasil per kotak di-cache
  `OVERTURE_CACHE_DAYS` (14) hari di tabel `source_cache` ig.db. Bisnis Overture dengan keyakinan < 0,3 diabaikan,
  0,3 sampai 0,5 hanya untuk melengkapi kontak bisnis Maps, >= 0,5 boleh jadi bisnis tambahan.
- **OSM**: Overpass dengan filter dari kelompok industri (`pipeline.CATEGORIES`) plus pencarian nama; tiga mirror
  dicoba bergantian, cache 7 hari. Server publik sering 502/timeout; kalau semua gagal, status `error` dan riset lanjut.
- **Validasi bisnis tambahan** (`sources.validate_standalone`): buang yang tutup, keyakinan rendah, tanpa kontak;
  website dicek hidup lewat `fetch_safe` (maksimal 25 situs, `VERIFY_WEB_BUDGET_SEC` 60). Hasilnya di
  `report.sources.verify` dan `web_ok` per bisnis.
- **Penggabungan** (`datastore.dedupe`): bisnis lintas sumber dianggap sama bila telepon HP sama, website sama,
  IG sama, atau jarak <= 400 m dengan nama mirip (token_set_ratio >= 82 dan >= 2/3 kata nama pendek ada di nama
  satunya). Kontak yang kosong diisi, asalnya dicatat di `src_fields`; `on_maps=false` untuk yang tidak ada di Maps.
- Cek cepat dari CLI: `python market.py --industry salon --area "gading serpong" --max 40 --details 3 --sources overture,osm --out x.json`.

## Pengerasan worker (subprocess, batas waktu per tahap, pemutus arus)

Worker menjalankan `market.py`, `ig_scraper.py`, `pipeline.py` sebagai subprocess lewat `services/scraper/procutil.py`:
- **Pohon proses**: anak jalan sebagai grup proses sendiri. Saat job dihentikan (batas waktu, batal, worker berhenti) seluruh
  turunannya ikut mati (Python -> driver Playwright -> Chromium), tidak ada Chromium yatim yang memakan RAM/shm. Service
  `worker` di compose memakai `init: true` supaya zombie dituai.
- **Env anak**: `SMTP_*`, `AUTH_SECRET`, `SLACK_WEBHOOK` tidak diwariskan ke subprocess; `DATABASE_URL`,
  `OPENROUTER_API_KEY`, `TG_TOKEN` tetap diteruskan.
- **Argumen**: industri/wilayah dari pengguna disaring (`procutil.cli_value`): tanpa awalan `-`, tanpa `;`, dipotong.
  Parameter kosong = job gagal permanen (tidak diulang, kuota dikembalikan API).
- **Batas waktu per tahap** (env worker): `DETAILS_BUDGET_SEC` (default 540) untuk tahap ambil telepon/website di Maps,
  `FIND_IG_BUDGET_SEC` (default 150) untuk cari IG dari website (per website 8 detik, halaman kontak hanya dibuka kalau
  beranda tidak memuat email). Yang tidak sempat dicek dilewati, laporan tetap jadi. `JOB_TIMEOUT` (default 25 menit)
  berlaku per wilayah: job bandingkan N wilayah punya batas N x JOB_TIMEOUT, dan `market.py` menulis hasil parsial
  setelah tiap wilayah sehingga wilayah yang selesai tetap disimpan kalau batas habis.
- **Captcha Google**: halaman `/sorry/` atau form captcha saat pencarian = `gmaps.Blocked` (gagal sementara, diulang
  dengan backoff), bukan "tidak ada hasil". Saat ambil detail, blokir menghentikan tahap itu saja.
- **Kampanye**: pengiriman email/WhatsApp gagal `CAMPAIGN_MAX_CONSEC_FAIL` kali berturut-turut (default 5) menjeda
  kampanye dan mengembalikan job sebagai gagal sementara; retry job melanjutkan penerima yang masih pending. Alamat
  email divalidasi (satu alamat, tanpa CRLF). SMTP: port 465 memakai TLS implisit; port lain wajib STARTTLS kalau ada
  kredensial (`SMTP_ALLOW_PLAIN=1` hanya untuk relay internal tanpa login). Gateway WhatsApp dihubungi dengan koneksi
  yang dipin ke IP hasil pemeriksaan (anti DNS rebinding), sama seperti `fetch_safe`.
- **Logo**: gambar yang header-nya lebih dari 16 juta piksel ditolak sebelum didekode (bom dekompresi). `logo.py
  --backfill` mengunduh di luar kunci baris laporan; kunci `FOR UPDATE` hanya saat menempel `logo_key`.
- **Lokasi data**: `pipeline.py` dan cookie anonim `ig_scraper.py` (`ig_state.json`) ikut `RAQIO_DATA_DIR` (volume),
  bukan folder kode.

Angka publik: `GET /stats` (tanpa sesi, cache 60 detik) = bisnis di laporan terbaru per pasangan, baris dipindai, laporan,
pasangan industri+wilayah, logo, job riset/cek kontak/chat selesai, tampilan peringkat 7 hari. Dipakai strip di halaman
Riset. Lencana peringkat `GET /badge/<industri>/<wilayah>/<key>.svg` menerima `?theme=light`.

## Variabel penting di deploy/.env

| Variabel | Fungsi |
|---|---|
| `AUTH_SECRET` | wajib, `openssl rand -hex 32`; mengganti nilainya mengeluarkan semua sesi |
| `PG_PASSWORD` | wajib, password Postgres; dipakai postgres (lewat docker secret), api, worker, backup |
| `METRICS_TOKEN` | bearer token untuk `/metrics`; kosong = ditolak |
| `DOCS` | 1 untuk menyalakan Swagger UI di `/docs` (default 0 di produksi) |
| `TRUSTED_PROXIES` | CIDR proxy yang boleh mengisi `X-Forwarded-For`; kosong = jaringan privat. Isi CIDR CDN bila di belakang CDN dan aktifkan `trusted_proxies` di `deploy/Caddyfile` |
| `CHAT_ENABLED` | 0 mematikan asisten chat (endpoint `/chat` membalas 503) |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | kunci dan model LLM untuk asisten (worker) |
| `OPS_TELEGRAM_CHAT`, `OPS_WEBHOOK_URL`, `OPS_WEBHOOK_SECRET`, `OPS_5XX_THRESHOLD` | alarm operasional |
| `DIGEST_HOUR` | jam pengiriman ringkasan prospek jatuh tempo (default 8) |
| `TELEGRAM_BOT_TOKEN` | notifikasi alert ke Telegram |
| `GUEST_MAX_PER_HOUR` | batas riset tamu per jam (global); kosong = default di kode |
| `MARKET_CACHE_DAYS` | umur laporan lintas org yang dipakai ulang sebagai hasil instan (default 7) |
| `SUGGEST_MIN_ORGS` | pasangan muncul di `/market/suggest` hanya bila diriset minimal N org (default 3) |
| `WORKER_REPLICAS` | jumlah worker riset paralel |
| `RATE_LIMIT_PER_MINUTE` | batas request per IP (default 300) |
| `JOB_RATE_LIMIT_PER_MINUTE` | batas job baru per org (default 10) |
| `BACKUP_KEEP_DAYS` | retensi backup lokal |
| `BACKUP_AGE_RECIPIENT` | kunci publik age untuk mengenkripsi backup |
| `BACKUP_S3_URL`, `AWS_*` | salinan backup offsite |
| `ALLOW_REGISTER` | 0 untuk menutup pendaftaran publik |

## Development: port infra

`deploy/compose.dev.yml` mem-bind Postgres (`127.0.0.1:5433`) dan Redis (`127.0.0.1:6379`) hanya ke loopback karena
password dev lemah. Container dev lain tetap bisa mencapainya lewat `host.docker.internal:5433` (dipakai `dev.ps1`).

## Siklus paket, notifikasi job, dan data (Okt 2026)

- **Peringatan paket**: scheduler mengirim email H-3 sebelum `plan_until` (sekali per periode, penanda `orgs.expiry_warned_at`) dan email saat benar-benar turun ke Free. Banner 7 hari terakhir tampil di app (Nav).
- **Email "laporan siap / riset gagal"**: scheduler menandai `jobs.notified`; hanya job yang selesai < 1 jam yang dikirim (setelah downtime sisanya ditandai lewat). Butuh SMTP_* terisi; tanpa itu hanya log.
- **Laporan "data keliru" /top**: tabel `rank_reports` (maks 5/IP/hari). Baca: `SELECT * FROM rank_reports ORDER BY created_at DESC LIMIT 50;` lalu tindak lanjuti dan hapus barisnya.
- **Riset ulang peringkat publik**: `RANK_REFRESH_ORG=<uuid org pengelola>` mengaktifkan pemindaian ulang pasangan /top yang ramai dilihat dan lebih tua dari `RANK_REFRESH_DAYS` (default 7), maksimal 2 per putaran scheduler, memakai kuota org itu.
- **Ekspor data org**: `GET /org/export` (admin) mengunduh seluruh data org sebagai JSON — jawaban untuk permintaan portabilitas data.
- **Prioritas antrean**: job riset paket team/pro mendahului free (`planPriority`), cek kontak tetap menyela (-5), pantauan dan riset peringkat mengalah (10).
