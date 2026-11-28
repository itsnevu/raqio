#!/usr/bin/env bash
# Pintu masuk deploy di server: /opt/raqio/bin/raqio-gate (dipasang provision.sh, milik root, tidak bisa diubah
# user raqio). deploy/deploy.sh (laptop) dan CI memanggil skrip ini lewat SSH.
#
# Kunci CI di /root/.ssh/authorized_keys dibatasi ke skrip ini:
#   restrict,command="/opt/raqio/bin/raqio-gate" ssh-ed25519 AAAA... raqio-ci
# jadi kunci itu tidak bisa membuka shell, forwarding, atau perintah lain. Perintah yang diterima:
#   receive  <sha12> <sha256>          arsip tar.gz dari stdin; disimpan hanya bila checksum cocok
#   deploy   <sha12> <site|app|api|all>
#   rollback <site|app|api|all> [sha12]
#   status
set -euo pipefail
umask 022
ROOT=/opt/raqio
MAX_BYTES=$((700 * 1024 * 1024))

if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
  read -r -a ARGS <<< "$SSH_ORIGINAL_COMMAND"
else
  ARGS=("$@")
fi
# klien mengirim "raqio-gate <perintah> ..."; nama program di depan dibuang
if [ "${#ARGS[@]}" -gt 0 ] && [[ "${ARGS[0]}" == *raqio-gate ]]; then ARGS=("${ARGS[@]:1}"); fi

die() { echo "! $*" >&2; exit 2; }
is_sha() { [[ "${1:-}" =~ ^[0-9a-f]{12}$ ]]; }
is_what() { [[ "${1:-}" =~ ^(site|app|api|all)$ ]]; }

# skrip deploy dari release yang sedang live (untuk rollback/status); release milik root, jadi aman dijalankan root
live_script() {
  local t
  for t in api app site; do
    if [ -L "$ROOT/current-$t" ]; then
      local sha; sha="$(basename "$(readlink -f "$ROOT/current-$t")")"
      if [ -f "$ROOT/releases/$sha/deploy/remote-deploy.sh" ]; then echo "$ROOT/releases/$sha/deploy/remote-deploy.sh"; return; fi
    fi
  done
  local newest; newest="$(ls -1dt "$ROOT"/releases/*/deploy/remote-deploy.sh 2>/dev/null | head -1 || true)"
  [ -n "$newest" ] || die "belum ada release di server"
  echo "$newest"
}

lock() {
  exec 9>"$ROOT/.deploy.lock"
  flock -n 9 || die "deploy lain sedang berjalan di server, coba lagi nanti"
}

verb="${ARGS[0]:-}"
case "$verb" in
  receive)
    [ "${#ARGS[@]}" -eq 3 ] || die "pakai: receive <sha12> <sha256>"
    sha="${ARGS[1]}"; sum="${ARGS[2]}"
    is_sha "$sha" || die "sha release tidak valid"
    [[ "$sum" =~ ^[0-9a-f]{64}$ ]] || die "checksum tidak valid"
    lock
    install -d -m 700 "$ROOT/incoming"
    rel="$ROOT/releases/$sha"
    staging="$ROOT/releases/.incoming-$sha"
    tmp="$(mktemp -p "$ROOT/incoming")"
    trap 'rm -f "$tmp"; rm -rf "$staging"' EXIT
    head -c "$((MAX_BYTES + 1))" > "$tmp"
    [ "$(stat -c %s "$tmp")" -le "$MAX_BYTES" ] || die "arsip lebih dari $((MAX_BYTES / 1024 / 1024)) MB, ditolak"
    echo "$sum  $tmp" | sha256sum -c --status - || die "checksum arsip tidak cocok (rusak atau diubah di jalan), ditolak"
    if [ -d "$rel" ] && [ "$(cat "$rel/.archive-sha256" 2>/dev/null)" = "$sum" ]; then
      echo "→ release $sha sudah ada di server (checksum sama), dipakai ulang"
      exit 0
    fi
    if [ -d "$rel" ]; then
      for t in site app api; do
        [ "$(basename "$(readlink -f "$ROOT/current-$t" 2>/dev/null)")" = "$sha" ] && die "release $sha sedang live dengan isi berbeda; buat commit baru"
      done
      rm -rf "$rel" "$ROOT/builds/$sha"
    fi
    rm -rf "$staging"
    install -d -m 755 "$staging"
    # GNU tar: path absolut dan '..' ditolak; pemilik file selalu root (bukan dari arsip)
    tar -xzf "$tmp" -C "$staging" --no-same-owner --no-same-permissions
    echo "$sum" > "$staging/.archive-sha256"
    chown -R root:root "$staging"
    chmod -R go-w "$staging"
    mv -T "$staging" "$rel"
    echo "→ diterima: $sha ($(du -sh "$rel" | cut -f1), sha256 cocok)"
    ;;
  deploy)
    [ "${#ARGS[@]}" -eq 3 ] || die "pakai: deploy <sha12> <site|app|api|all>"
    sha="${ARGS[1]}"; what="${ARGS[2]}"
    is_sha "$sha" || die "sha release tidak valid"
    is_what "$what" || die "target harus site, app, api, atau all"
    [ -f "$ROOT/releases/$sha/deploy/remote-deploy.sh" ] || die "release $sha belum diterima server"
    lock
    bash "$ROOT/releases/$sha/deploy/remote-deploy.sh" deploy "$sha" "$what"
    ;;
  rollback)
    [ "${#ARGS[@]}" -ge 2 ] && [ "${#ARGS[@]}" -le 3 ] || die "pakai: rollback <site|app|api|all> [sha12]"
    what="${ARGS[1]}"; sha="${ARGS[2]:-}"
    is_what "$what" || die "target harus site, app, api, atau all"
    [ -z "$sha" ] || is_sha "$sha" || die "sha release tidak valid"
    lock
    bash "$(live_script)" rollback "$what" ${sha:+"$sha"}
    ;;
  status)
    [ "${#ARGS[@]}" -eq 1 ] || die "pakai: status"
    bash "$(live_script)" status
    ;;
  *)
    die "perintah tidak dikenal; pakai receive, deploy, rollback, atau status"
    ;;
esac
