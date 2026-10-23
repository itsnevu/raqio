#!/bin/sh
# Tulis METRICS_TOKEN ke file kredensial (prometheus.yml memakai credentials_file), lalu jalankan Prometheus.
set -eu
printf '%s' "${METRICS_TOKEN:-}" > /etc/prometheus/metrics_token
chmod 600 /etc/prometheus/metrics_token
exec /bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time="${PROM_RETENTION:-30d}" \
  --web.enable-lifecycle
