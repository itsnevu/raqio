#!/bin/sh
# Backup Postgres berkala untuk service `backup` di deploy/compose.yml.
#   pg_dump | gzip | age (bila BACKUP_AGE_RECIPIENT diisi)  ->  /backups/raqio-<waktu>.sql.gz[.age]
# Lalu hapus yang lebih tua dari KEEP_DAYS hari, dan opsional salin ke S3 (BACKUP_S3_URL).
# Koneksi DB lewat PGHOST/PGUSER/PGDATABASE/PGPASSWORD. Pulihkan: lihat docs/runbook.md.
#
# Dijalankan di image postgres:16-alpine; age dan aws-cli dipasang lewat apk saat start bila dibutuhkan,
# supaya versi pg_dump selalu sama dengan server dan tidak perlu image tambahan.

set -u

DIR=${BACKUP_DIR:-/backups}
KEEP_DAYS=${KEEP_DAYS:-14}
INTERVAL=${BACKUP_INTERVAL_SECONDS:-86400}
RECIPIENT=${BACKUP_AGE_RECIPIENT:-}
S3_URL=${BACKUP_S3_URL:-}
ONCE=${BACKUP_ONCE:-0}

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup: $*"; }
have() { command -v "$1" >/dev/null 2>&1; }

if [ -n "$RECIPIENT" ] && ! have age; then
	apk add --no-cache age >/dev/null 2>&1 || log "GAGAL memasang age, backup akan tanpa enkripsi"
fi
if [ -n "$S3_URL" ] && ! have aws; then
	apk add --no-cache aws-cli >/dev/null 2>&1 || log "GAGAL memasang aws-cli, upload S3 dilewati"
fi

if [ -z "$RECIPIENT" ]; then
	log "PERINGATAN: BACKUP_AGE_RECIPIENT kosong, backup TIDAK terenkripsi (hanya gzip). Isi di deploy/.env"
elif ! have age; then
	log "PERINGATAN: age tidak tersedia, backup TIDAK terenkripsi"
fi

run_once() {
	ts=$(date -u +%Y%m%d-%H%M%S)
	mkdir -p "$DIR"
	if [ -n "$RECIPIENT" ] && have age; then
		f="$DIR/raqio-$ts.sql.gz.age"
		# busybox sh mendukung pipefail: gagal bila pg_dump, gzip, atau age gagal
		(set -o pipefail; pg_dump --no-password | gzip -6 | age -r "$RECIPIENT" -o "$f.part")
	else
		f="$DIR/raqio-$ts.sql.gz"
		(set -o pipefail; pg_dump --no-password | gzip -6 >"$f.part")
	fi
	rc=$?
	if [ "$rc" -ne 0 ] || [ ! -s "$f.part" ]; then
		rm -f "$f.part"
		log "GAGAL pg_dump (exit $rc)"
		return 1
	fi
	mv "$f.part" "$f"
	log "ok $f ($(du -h "$f" | cut -f1))"

	# retensi lokal
	find "$DIR" -maxdepth 1 -type f -name 'raqio-*.sql.gz*' -mtime +"$KEEP_DAYS" -print -delete 2>/dev/null |
		while read -r old; do log "hapus $old (lebih dari $KEEP_DAYS hari)"; done

	# salinan offsite
	if [ -n "$S3_URL" ]; then
		if have aws && aws s3 cp --only-show-errors "$f" "${S3_URL%/}/$(basename "$f")"; then
			log "upload ok ${S3_URL%/}/$(basename "$f")"
		else
			log "GAGAL upload ke $S3_URL"
		fi
	fi
	return 0
}

if [ "$ONCE" = "1" ]; then
	run_once
	exit $?
fi

while true; do
	run_once || true
	sleep "$INTERVAL"
done
