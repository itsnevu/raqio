#!/bin/sh
# Backup Postgres harian ke /backups, simpan 14 hari. Dijalankan service "backup" di compose.yml.
set -eu
mkdir -p /backups
while true; do
  f="/backups/raqio-$(date +%Y%m%d-%H%M).sql.gz"
  if pg_dump "$DATABASE_URL" | gzip > "$f"; then
    echo "backup ok: $f"
  else
    echo "backup GAGAL" >&2; rm -f "$f"
  fi
  find /backups -name 'raqio-*.sql.gz' -mtime +14 -delete
  sleep 86400
done
