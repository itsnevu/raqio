#!/usr/bin/env bash
# Deploy raqio ke VPS dengan satu perintah (Git Bash di Windows, atau CI):
#   bash deploy/deploy.sh [site|app|api|all]          kirim HEAD sebagai release baru, build di server, pindah bila sehat
#   bash deploy/deploy.sh rollback [site|app|api|all] [SHA]   kembali ke release sebelumnya (default all)
#   bash deploy/deploy.sh status
#   bash deploy/deploy.sh setup                       sekali per server baru: paket, user raqio, firewall, rahasia baru
#
# Keamanan jalur kirim (anti man-in-the-middle):
#   - kunci host server dipin di deploy/vps/known_hosts; StrictHostKeyChecking=yes, hanya ssh-ed25519, file
#     known_hosts lain diabaikan. Server palsu atau kunci host berubah = koneksi ditolak, tidak ada "yes" otomatis.
#   - arsip dihitung sha256 di sini dan dicek ulang di server sebelum dibuka (raqio-gate receive).
#   - dependensi dikunci: pnpm --frozen-lockfile (hash integritas), go.sum, image docker dengan tag/digest.
#
# Host: alias ssh "quarn-vps" (~/.ssh/config) atau RAQIO_HOST=root@IP; opsi tambahan lewat RAQIO_SSH_OPTS (mis. -i kunci).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

HOST="${RAQIO_HOST:-quarn-vps}"
KNOWN="$PWD/deploy/vps/known_hosts"
read -r -a EXTRA <<< "${RAQIO_SSH_OPTS:-}"
SSH=(ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$KNOWN" -o GlobalKnownHostsFile=/dev/null
  -o HostKeyAlgorithms=ssh-ed25519 -o UpdateHostKeys=no -o ForwardAgent=no -o ClearAllForwardings=yes
  -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=30 "${EXTRA[@]}")

gate() { "${SSH[@]}" "$HOST" raqio-gate "$@"; }

CMD="${1:-all}"
case "$CMD" in
  setup)
    echo "→ setup server $HOST (paket, user raqio, firewall, rahasia baru di /opt/raqio/shared)"
    files=(provision.sh raqio-gate.sh)
    # kunci publik CI (opsional): dipasang dengan batasan command="/opt/raqio/bin/raqio-gate",restrict
    if [ -f "${RAQIO_CI_PUBKEY:-$HOME/.ssh/raqio_ci.pub}" ]; then
      cp "${RAQIO_CI_PUBKEY:-$HOME/.ssh/raqio_ci.pub}" deploy/vps/.ci.pub; files+=(.ci.pub)
      trap 'rm -f deploy/vps/.ci.pub' EXIT
    fi
    tar -C deploy/vps -cf - "${files[@]}" | "${SSH[@]}" "$HOST" \
      'd=$(mktemp -d) && tar -xf - -C "$d" && bash "$d/provision.sh" "$d"; rc=$?; rm -rf "$d"; exit $rc'
    exit
    ;;
  status) gate status; exit ;;
  rollback)
    WHAT="${2:-all}"
    echo "→ rollback $WHAT${3:+ ke $3} di $HOST"
    gate rollback "$WHAT" ${3:+"$3"}
    exit
    ;;
  site|app|api|all) WHAT="$CMD" ;;
  *) echo "pakai: bash deploy/deploy.sh [site|app|api|all] | rollback [target] [sha] | status | setup" >&2; exit 2 ;;
esac

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "! ada perubahan yang belum di-commit: TIDAK ikut deploy (hanya HEAD yang dikirim)."
fi

SHA="$(git rev-parse --short=12 HEAD)"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
# yang tidak dipakai server dikeluarkan dari arsip (aplikasi mobile, media situs lama, dokumen, biner Windows)
git archive --format=tar.gz HEAD -- . \
  ':(exclude)apps/mobile' ':(exclude)apps/web/public/media' ':(exclude)docs' ':(exclude)e2e' \
  ':(exclude)apps/api/api.exe' ':(exclude)services/scraper/duckdb_ext' ':(exclude)research' > "$TMP"
SUM="$(sha256sum "$TMP" | cut -d' ' -f1)"
SIZE="$(du -h "$TMP" | cut -f1)"

echo "→ kirim $SHA ($(git log -1 --pretty=%s | cut -c1-60)) ke $HOST, $SIZE, sha256 ${SUM:0:16}…"
gate receive "$SHA" "$SUM" < "$TMP"
gate deploy "$SHA" "$WHAT"
