# Runbook Raqio (VPS, Docker Compose)

Semua perintah dijalankan di VPS dari root repo. File rahasia ada di `deploy/.env` (salin dari `deploy/.env.example`).

## Deploy pertama kali

```bash
git clone https://github.com/itsnevu/raqio.git && cd raqio
cp deploy/.env.example deploy/.env      # isi DOMAIN, PG_PASSWORD, AUTH_SECRET (acak, 32+ karakter), SMTP, Xendit
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
```

Caddy mengurus TLS otomatis untuk `DOMAIN`. Hanya port 80 dan 443 yang terbuka. Migrasi DB jalan sendiri saat `api` start.

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

Scrape `/metrics` dari Prometheus di jaringan internal. Kalau belum ada Prometheus, cek manual: `curl -s https://DOMAIN/metrics`.

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

## Backup dan pulihkan

Service `backup` menjalankan `pg_dump` tiap 24 jam ke volume `backups`, menyimpan `BACKUP_KEEP_DAYS` hari (default 14).

```bash
docker compose -f deploy/compose.yml logs --tail 5 backup                   # "backup ok ..."
docker run --rm -v raqio_backups:/b alpine ls -lh /b                         # daftar file (nama volume: <project>_backups)
```

Salin ke luar VPS secara berkala (wajib, volume ikut hilang kalau disk rusak):

```bash
docker run --rm -v raqio_backups:/b -v $PWD:/out alpine sh -c 'cp /b/$(ls -t /b | head -1) /out/'
scp raqio-*.sql.gz user@mesin-lain:/backup/raqio/
```

Pulihkan ke database baru lalu tukar:

```bash
docker compose -f deploy/compose.yml stop api worker legacy
docker compose -f deploy/compose.yml exec postgres psql -U raqio -c "DROP DATABASE IF EXISTS raqio_restore; CREATE DATABASE raqio_restore;"
docker run --rm -i -v raqio_backups:/b --network raqio_default postgres:16-alpine \
  sh -c 'gunzip -c /b/raqio-YYYYMMDD-HHMMSS.sql.gz | PGPASSWORD=$PG_PASSWORD psql -h postgres -U raqio raqio_restore'
docker compose -f deploy/compose.yml exec postgres psql -U raqio -c \
  "ALTER DATABASE raqio RENAME TO raqio_old; ALTER DATABASE raqio_restore RENAME TO raqio;"
docker compose -f deploy/compose.yml start api worker legacy
```

Uji restore sebulan sekali, cukup sampai langkah `psql ... raqio_restore` lalu `DROP DATABASE raqio_restore`.

## Variabel penting di deploy/.env

| Variabel | Fungsi |
|---|---|
| `WORKER_REPLICAS` | jumlah worker riset paralel |
| `RATE_LIMIT_PER_MINUTE` | batas request per IP (default 300) |
| `JOB_RATE_LIMIT_PER_MINUTE` | batas job baru per org (default 10) |
| `BACKUP_KEEP_DAYS` | retensi backup |
| `ALLOW_REGISTER` | 0 untuk menutup pendaftaran publik |
