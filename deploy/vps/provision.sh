#!/usr/bin/env bash
# Setup server raqio (Ubuntu 24.04), sekali per server baru, dijalankan root lewat: bash deploy/deploy.sh setup
# Aman diulang (idempoten). Yang dilakukan:
#   - SSH hanya kunci (tanpa password), root hanya dengan kunci, tanpa forwarding; firewall hanya 22/80/443
#   - repo apt resmi Docker, NodeSource (Node 24), Caddy; kunci GPG-nya dicek fingerprint sebelum dipercaya
#   - user non-root `raqio` (pm2 + build Next), pm2 jalan saat boot sebagai raqio
#   - /opt/raqio/{releases,builds,shared,bin}; rahasia BARU di shared/*.env (acak, tidak pernah dicetak)
#   - raqio-gate (pintu deploy) dan, bila ada, kunci CI yang dibatasi ke raqio-gate saja
set -euo pipefail
umask 022
export DEBIAN_FRONTEND=noninteractive
SRC="${1:?folder berisi raqio-gate.sh}"
ROOT=/opt/raqio
APPUSER=raqio
PM2_VERSION=7.1.2

log() { printf '→ %s\n' "$*"; }
die() { printf '! %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "harus root"
. /etc/os-release
[ "$ID" = ubuntu ] || die "hanya diuji di Ubuntu"

# unduh kunci apt, tolak bila fingerprint beda dari yang dipin (pengecekan kedua di atas HTTPS)
trusted_key() { # <url> <fingerprint> <tujuan .gpg>
  local tmp; tmp="$(mktemp)"
  curl -fsSL --proto '=https' --tlsv1.2 "$1" -o "$tmp"
  local fpr; fpr="$(gpg --show-keys --with-colons "$tmp" 2>/dev/null | awk -F: '/^fpr/{print $10; exit}')"
  [ "$fpr" = "$2" ] || { rm -f "$tmp"; die "kunci $1 fingerprint $fpr, harusnya $2. Berhenti."; }
  gpg --dearmor --yes -o "$3" "$tmp"
  chmod 644 "$3"
  rm -f "$tmp"
}

log "SSH: hanya kunci, tanpa forwarding"
cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'CONF'
# Dibaca lebih dulu dari 50-cloud-init.conf; OpenSSH memakai nilai pertama yang ditemukan.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
PermitEmptyPasswords no
MaxAuthTries 3
LoginGraceTime 20
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
PermitTunnel no
CONF
chmod 600 /etc/ssh/sshd_config.d/00-hardening.conf
sshd -t && systemctl reload ssh

log "firewall: 22, 80, 443"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
for p in 22/tcp 80/tcp 443/tcp 443/udp; do ufw allow "$p" >/dev/null; done
ufw --force enable >/dev/null

log "paket dasar + pembaruan keamanan"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
apt-get -y -q install ca-certificates curl gnupg jq unattended-upgrades sudo util-linux
install -d -m 755 /etc/apt/keyrings

log "repo apt resmi (kunci dicek fingerprint)"
trusted_key https://download.docker.com/linux/ubuntu/gpg 9DC858229FC7DD38854AE2D88D81803C0EBFCD88 /etc/apt/keyrings/docker.gpg
trusted_key https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key 6F71F525282841EEDAF851B42F59B5F99B1BE0B4 /etc/apt/keyrings/nodesource.gpg
trusted_key https://dl.cloudsmith.io/public/caddy/stable/gpg.key 65760C51EDEA2017CEA2CA15155B6D79CA56EA34 /etc/apt/keyrings/caddy.gpg
ARCH="$(dpkg --print-architecture)"
echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
echo "deb [signed-by=/etc/apt/keyrings/caddy.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" > /etc/apt/sources.list.d/caddy-stable.list
printf 'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 600\n' > /etc/apt/preferences.d/nodesource
apt-get update -q
apt-get -y -q install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nodejs caddy

log "docker: rotasi log, live-restore, no-new-privileges"
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "local",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "live-restore": true,
  "no-new-privileges": true
}
JSON
systemctl restart docker

log "Node $(node -v): corepack (pnpm sesuai packageManager) + pm2 $PM2_VERSION"
corepack enable
npm install -g --no-fund --no-audit "pm2@$PM2_VERSION" >/dev/null

log "user $APPUSER (non-root, tanpa login, bukan anggota grup docker/sudo)"
id "$APPUSER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/home/$APPUSER" --shell /usr/sbin/nologin "$APPUSER"
chmod 750 "/home/$APPUSER"

log "folder $ROOT"
install -d -m 755 -o root -g root "$ROOT" "$ROOT/releases" "$ROOT/builds" "$ROOT/bin"
install -d -m 750 -o root -g "$APPUSER" "$ROOT/shared"
install -d -m 700 -o root -g root "$ROOT/incoming"
install -m 755 -o root -g root "$SRC/raqio-gate.sh" "$ROOT/bin/raqio-gate"
ln -sfn "$ROOT/bin/raqio-gate" /usr/local/sbin/raqio-gate

# rahasia baru: dibuat sekali, tidak ditimpa saat setup diulang, tidak pernah dicetak
if [ ! -f "$ROOT/shared/api.env" ]; then
  log "rahasia baru di $ROOT/shared (acak, tidak dicetak)"
  AUTH_SECRET="$(openssl rand -hex 32)"
  ( umask 077
    cat > "$ROOT/shared/api.env" <<ENV
# Dibuat provision.sh $(date -u +%F). Rahasia acak BARU; jangan di-commit, jangan dicetak.
# Dipakai docker compose (api, worker, postgres, backup). Setelah mengubah: bash deploy/deploy.sh api
DOMAIN=app.raqio.xyz
API_PORT=8130
PG_PASSWORD=$(openssl rand -hex 24)
# harus sama persis dengan AUTH_SECRET di app.env
AUTH_SECRET=$AUTH_SECRET
# harus sama dengan RAQIO_SSO_SECRET di server WA-Suite
SSO_SECRET=$(openssl rand -hex 32)
METRICS_TOKEN=$(openssl rand -hex 16)
INVITE_ONLY=1
ALLOW_REGISTER=1
DOCS=0
CHAT_ENABLED=1
SMTP_FROM="Raqio <no-reply@raqio.xyz>"
# ---- kunci layanan luar: isi manual (nilai lama dianggap bocor, pakai yang baru) ----
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
TELEGRAM_BOT_TOKEN=
XENDIT_SECRET_KEY=
XENDIT_CALLBACK_TOKEN=
GOOGLE_PLACES_API_KEY=
TOMTOM_API_KEY=
# kunci publik age (age1...) untuk mengenkripsi backup harian
BACKUP_AGE_RECIPIENT=
ENV
    cat > "$ROOT/shared/app.env" <<ENV
# Dibuat provision.sh $(date -u +%F). Dipakai build + pm2 raqio-app (apps/scraping). Setelah mengubah: bash deploy/deploy.sh app
API_URL=http://127.0.0.1:8130
APP_URL=https://app.raqio.xyz
NEXT_PUBLIC_APP_URL=https://app.raqio.xyz
NEXT_PUBLIC_MARKETING_URL=https://raqio.xyz
AUTH_SECRET=$AUTH_SECRET
AUTO_GUEST=0
# alamat WA-Suite untuk SSO (kosong = tombol Customer Service menampilkan "belum tersedia")
WASUITE_APP_URL=
ENV
    cat > "$ROOT/shared/site.env" <<ENV
# Dibuat provision.sh $(date -u +%F). Dipakai build + pm2 raqio-site (apps/site). Setelah mengubah: bash deploy/deploy.sh site
NEXT_PUBLIC_SCRAPING_APP_URL=https://app.raqio.xyz
ENV
  )
  unset AUTH_SECRET
fi
chown root:root "$ROOT/shared/api.env"; chmod 600 "$ROOT/shared/api.env"
chown root:"$APPUSER" "$ROOT/shared/app.env" "$ROOT/shared/site.env"; chmod 640 "$ROOT/shared/app.env" "$ROOT/shared/site.env"

log "pm2 jalan saat boot sebagai $APPUSER"
env PATH="$PATH" pm2 startup systemd -u "$APPUSER" --hp "/home/$APPUSER" >/dev/null
systemctl enable "pm2-$APPUSER" >/dev/null 2>&1 || true

log "Caddy: Caddyfile utama hanya mengimpor /etc/caddy/sites/*.caddy"
install -d -m 755 /etc/caddy/sites
if ! grep -q 'import /etc/caddy/sites/\*.caddy' /etc/caddy/Caddyfile 2>/dev/null; then
  [ -f /etc/caddy/Caddyfile ] && cp -p /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M%S)"
  cat > /etc/caddy/Caddyfile <<'CADDY'
# Setiap aplikasi punya file sendiri di /etc/caddy/sites/ (raqio: deploy/vps/raqio.caddy di repo raqio).
# Setelah mengubah: caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy  (reload, bukan restart)
import /etc/caddy/sites/*.caddy
CADDY
  systemctl reload caddy || systemctl restart caddy
fi

if [ ! -f /swapfile ] && ! swapon --show | grep -q .; then
  log "swap 4 GB (cadangan saat build Next + Chromium worker)"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if [ -f "$SRC/.ci.pub" ]; then
  key="$(awk '$1 ~ /^ssh-ed25519$/ {print $1, $2, "raqio-ci"; exit}' "$SRC/.ci.pub")"
  [ -n "$key" ] || die ".ci.pub bukan kunci ssh-ed25519"
  install -d -m 700 /root/.ssh; touch /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys
  if ! grep -qF "${key#* }" /root/.ssh/authorized_keys; then
    log "kunci CI dipasang, hanya boleh menjalankan raqio-gate"
    echo "restrict,command=\"$ROOT/bin/raqio-gate\" $key" >> /root/.ssh/authorized_keys
  fi
fi

log "pembaruan keamanan otomatis: $(grep -c '"1"' /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null || echo 0)/2 aktif"
log "✓ setup selesai. Isi kunci layanan luar di $ROOT/shared/api.env (SMTP, OpenRouter, ...) bila perlu."
