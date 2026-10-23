#!/bin/sh
# Isi token bot dan chat id dari env ke konfigurasi Alertmanager, lalu jalankan.
set -eu
mkdir -p /etc/alertmanager/run
printf '%s' "${TELEGRAM_BOT_TOKEN:-}" > /etc/alertmanager/run/bot_token
chmod 600 /etc/alertmanager/run/bot_token
chat="${OPS_TELEGRAM_CHAT:-0}"
sed -e "s#__TELEGRAM_CHAT_ID__#${chat}#" -e "s#/etc/alertmanager/bot_token#/etc/alertmanager/run/bot_token#" \
  /etc/alertmanager/alertmanager.tmpl.yml > /etc/alertmanager/run/alertmanager.yml
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ "$chat" = "0" ]; then
  echo "PERINGATAN: TELEGRAM_BOT_TOKEN atau OPS_TELEGRAM_CHAT kosong, alert hanya tampil di UI Alertmanager" >&2
fi
exec /bin/alertmanager --config.file=/etc/alertmanager/run/alertmanager.yml --storage.path=/alertmanager
