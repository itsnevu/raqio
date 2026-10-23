#!/bin/sh
# Uji restore backup terbaru ke database sementara, lalu hitung baris tabel inti. Jalankan di VPS:
#   docker compose -f deploy/compose.yml --env-file deploy/.env run --rm -e BACKUP_AGE_KEY_FILE=/run/age.key \
#     -v /root/raqio-backup.key:/run/age.key:ro backup sh /restore-check.sh
# Tanpa BACKUP_AGE_KEY_FILE hanya backup .sql.gz (tanpa enkripsi) yang bisa diuji.
# Keluar dengan kode 1 kalau restore gagal atau tabel inti kosong. Cocok dipanggil cron mingguan (lihat runbook).
set -eu
dir=/backups
latest=$(ls -t "$dir"/raqio-*.sql.gz* 2>/dev/null | head -1 || true)
[ -n "$latest" ] || { echo "tidak ada file backup di $dir" >&2; exit 1; }
db="raqio_restore_check"
echo "memakai $latest"
case "$latest" in
  *.age)
    [ -n "${BACKUP_AGE_KEY_FILE:-}" ] || { echo "backup terenkripsi, set BACKUP_AGE_KEY_FILE" >&2; exit 1; }
    command -v age >/dev/null 2>&1 || apk add --no-cache age >/dev/null
    dump() { age -d -i "$BACKUP_AGE_KEY_FILE" "$latest" | gunzip -c; } ;;
  *) dump() { gunzip -c "$latest"; } ;;
esac
psql -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db" >/dev/null
# pg_dump format plain dari backup.sh: restore dengan psql
dump | psql -v ON_ERROR_STOP=1 -q -d "$db" >/dev/null
rows=$(psql -At -d "$db" -c "SELECT (SELECT count(*) FROM orgs)||' org, '||(SELECT count(*) FROM users)||' user, '||(SELECT count(*) FROM reports)||' laporan, '||(SELECT count(*) FROM jobs)||' job'")
orgs=$(psql -At -d "$db" -c "SELECT count(*) FROM orgs")
psql -d postgres -c "DROP DATABASE $db" >/dev/null
echo "restore OK: $rows"
[ "$orgs" -gt 0 ] || { echo "PERINGATAN: tabel orgs kosong setelah restore" >&2; exit 1; }
