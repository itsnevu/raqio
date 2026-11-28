#!/usr/bin/env bash
# Jalan DI SERVER sebagai root, lewat /opt/raqio/bin/raqio-gate (dipanggil deploy/deploy.sh dari laptop atau CI).
#   deploy   <sha> <site|app|api|all>   build, uji sebelum pindah, pindah symlink, cek lagi (gagal = kembali otomatis)
#   rollback <site|app|api|all> [sha]   kembali ke release sebelumnya yang pernah live (atau sha tertentu)
#   status
#
# Tata letak di /opt/raqio:
#   releases/<sha>   isi commit (git archive), milik root, read-only untuk user raqio. Skrip, compose, dan
#                    raqio.caddy yang dijalankan root selalu diambil dari sini.
#   builds/<sha>     salinan release milik user raqio: pnpm install, next build, dan pm2 jalan dari sini.
#                    Kode Next tidak pernah jalan sebagai root, dan user raqio tidak bisa mengubah skrip root.
#   current-site, current-app -> builds/<sha>;  current-api -> releases/<sha>  (symlink per bagian, supaya
#                    deploy `site` tidak mengganti app yang belum di-build di release baru)
#   shared/{site,app,api}.env   rahasia dari provision.sh; tidak pernah di-commit atau dicetak
#   history-{site,app,api}      urutan sha yang pernah live, untuk rollback
set -euo pipefail
umask 022

ROOT=/opt/raqio
SHARED="$ROOT/shared"
APPUSER=raqio
KEEP=5
declare -A PORT=([site]=3120 [app]=3121 [api]=8130)
declare -A SMOKE=([site]=3130 [app]=3131)
declare -A CHECK=([site]=/ [app]=/login [api]=/readyz)
declare -A PKG=([site]=raqio-site [app]=raqio-web)
declare -A DIR=([site]=apps/site [app]=apps/scraping)

log() { printf '→ %s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
die() { warn "$*"; exit 1; }

# perintah sebagai user raqio dengan env bersih (rahasia root dan api.env tidak ikut). env -C /: mulai dari /, bukan
# cwd root (/root tidak bisa dibaca raqio; Node gagal mencari package.json di sana)
as_app() {
  sudo -u "$APPUSER" -H env -i -C / HOME="/home/$APPUSER" PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 \
    PM2_HOME="/home/$APPUSER/.pm2" "$@"
}

http_code() { curl -s -o /dev/null -m 5 -w '%{http_code}' "$1" 2>/dev/null || true; }
wait_ok() { # url detik
  local url="$1" n="${2:-60}" code=000
  for _ in $(seq 1 "$n"); do
    code="$(http_code "$url")"
    case "$code" in 2??|3??) return 0 ;; esac
    sleep 1
  done
  warn "$url → http $code"
  return 1
}

compose() { # <dir release> argumen...
  local rel="$1"; shift
  RELEASE="$(basename "$rel")" docker compose -p raqio --env-file "$SHARED/api.env" \
    -f "$rel/deploy/compose.yml" -f "$rel/deploy/vps/compose.vps.yml" "$@"
}

live_sha() { [ -L "$ROOT/current-$1" ] && basename "$(readlink -f "$ROOT/current-$1")" || true; }
set_link() { ln -sfn "$2" "$ROOT/current-$1.new" && mv -T "$ROOT/current-$1.new" "$ROOT/current-$1"; }

pm2_apply() { # <target> <dir release untuk ecosystem>
  as_app pm2 startOrReload "$2/deploy/vps/ecosystem.config.cjs" --only "raqio-$1" --update-env >/dev/null
  as_app pm2 save --force >/dev/null
}

# ---------- build ----------

prepare_build() {
  local b="$ROOT/builds/$SHA" tmp="$ROOT/builds/.tmp-$SHA"
  [ -d "$b" ] && return
  log "salin release ke ruang build milik $APPUSER"
  rm -rf "$tmp"
  cp -a "$REL/." "$tmp/"
  chown -R "$APPUSER:$APPUSER" "$tmp"
  mv -T "$tmp" "$b"
}

install_deps() {
  local b="$ROOT/builds/$SHA"
  [ -f "$b/.deps-ok" ] && return
  log "pnpm install --frozen-lockfile (lockfile + hash integritas paket wajib cocok)"
  as_app bash -c "cd '$b' && pnpm install --frozen-lockfile --reporter=append-only"
  touch "$b/.deps-ok"
}

# Next/React wajib versi yang sudah ditambal (CVE-2025-55182 RSC, dll.); versi di bawah batas per jalur ditolak.
check_versions() { # <target>
  as_app node -e '
    const dir = process.argv[1];
    const ver = (p) => require(require.resolve(p + "/package.json", { paths: [dir] })).version.split("-")[0];
    const floors = {
      next: { "15.0": "15.0.5", "15.1": "15.1.9", "15.2": "15.2.6", "15.3": "15.3.6", "15.4": "15.4.8", "15.5": "15.5.7", "16.0": "16.0.7" },
      react: { "19.0": "19.0.1", "19.1": "19.1.2", "19.2": "19.2.1" },
    };
    const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number);
      for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
    const out = [];
    for (const [p, table] of Object.entries(floors)) {
      const v = ver(p), line = v.split(".").slice(0, 2).join("."), lines = Object.keys(table);
      const newest = lines[lines.length - 1] + ".99999";
      const ok = table[line] ? cmp(v, table[line]) >= 0 : cmp(v, newest) > 0;
      if (!ok) { console.error(`! ${p} ${v} belum ditambal (minimal ${table[line] || "jalur lebih baru dari " + lines.at(-1)})`); process.exit(1); }
      out.push(`${p} ${v}`);
    }
    console.log("  versi aman: " + out.join(", "));
  ' "$ROOT/builds/$SHA/${DIR[$1]}"
}

build_next() { # <target>
  local t="$1" b="$ROOT/builds/$SHA"
  if [ -f "$b/.built-$t" ]; then log "$t: sudah di-build untuk $SHA, dipakai ulang"; return; fi
  log "$t: build (${PKG[$t]})"
  as_app bash -c "set -a; . '$SHARED/$t.env'; set +a; cd '$b' && pnpm exec turbo run build --filter='${PKG[$t]}' --cache-dir=/home/$APPUSER/.cache/turbo --output-logs=errors-only"
  check_versions "$t"
  touch "$b/.built-$t"
}

# jalankan build baru di port sementara dan pastikan menjawab, SEBELUM symlink dipindah
smoke_next() { # <target>
  local t="$1" port="${SMOKE[$1]}" logf="/tmp/raqio-smoke-$1.log"
  log "$t: uji build baru di 127.0.0.1:$port${CHECK[$t]} sebelum pindah"
  as_app bash -c "set -a; . '$SHARED/$t.env'; set +a; export NODE_ENV=production PORT=$port; cd '$ROOT/builds/$SHA/${DIR[$t]}' && exec node node_modules/next/dist/bin/next start -p $port -H 127.0.0.1" >"$logf" 2>&1 &
  local pid=$! ok=0
  wait_ok "http://127.0.0.1:$port${CHECK[$t]}" 90 || ok=1
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  pkill -u "$APPUSER" -f "next start -p $port " 2>/dev/null || true
  if [ "$ok" != 0 ]; then tail -n 40 "$logf" >&2; die "$t: build baru tidak menjawab, deploy dibatalkan (yang live tidak berubah)"; fi
}

build_api() {
  log "api + worker: docker build (tag raqio-*:$SHA)"
  compose "$REL" build --pull api worker
}

# ---------- pindah (switch) ----------

switch_next() { # <target>
  local t="$1" prev; prev="$(live_sha "$t")"
  log "$t: pindah current-$t → $SHA${prev:+ (sebelumnya $prev)}"
  set_link "$t" "$ROOT/builds/$SHA"
  pm2_apply "$t" "$REL"
  if ! wait_ok "http://127.0.0.1:${PORT[$t]}${CHECK[$t]}" 60; then
    as_app pm2 logs "raqio-$t" --lines 30 --nostream >&2 || true
    if [ -n "$prev" ] && [ -d "$ROOT/builds/$prev" ]; then
      warn "$t tidak sehat setelah pindah, kembali otomatis ke $prev"
      set_link "$t" "$ROOT/builds/$prev"
      pm2_apply "$t" "$REL"
    fi
    die "$t gagal health check"
  fi
  echo "$SHA" >> "$ROOT/history-$t"
}

# api: kontainer baru dinyalakan, sehat dulu, BARU symlink current-api dipindah
switch_api() {
  local prev; prev="$(live_sha api)"
  log "api: nyalakan raqio-api:$SHA${prev:+ (sebelumnya $prev)}"
  compose "$REL" up -d --no-build postgres backup worker api
  if ! wait_ok "http://127.0.0.1:${PORT[api]}${CHECK[api]}" 90; then
    compose "$REL" logs --tail 40 api >&2 || true
    if [ -n "$prev" ] && docker image inspect "raqio-api:$prev" >/dev/null 2>&1; then
      warn "api tidak sehat, kembali otomatis ke $prev"
      compose "$ROOT/releases/$prev" up -d --no-build worker api
    fi
    die "api gagal health check"
  fi
  set_link api "$REL"
  echo "$SHA" >> "$ROOT/history-api"
}

install_caddy() {
  local src="$REL/deploy/vps/raqio.caddy" dst=/etc/caddy/sites/raqio.caddy
  cmp -s "$src" "$dst" 2>/dev/null && return
  log "caddy: pasang raqio.caddy baru, validasi, lalu reload (bukan restart)"
  install -d -m 755 /etc/caddy/sites
  [ -f "$dst" ] && cp -p "$dst" "$dst.prev"
  install -m 644 "$src" "$dst"
  if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/tmp/raqio-caddy-validate.log 2>&1; then
    tail -n 20 /tmp/raqio-caddy-validate.log >&2
    if [ -f "$dst.prev" ]; then mv -f "$dst.prev" "$dst"; else rm -f "$dst"; fi
    die "raqio.caddy tidak valid; Caddy tidak di-reload, konfigurasi lama tetap jalan"
  fi
  systemctl reload caddy
}

# simpan KEEP release/build terbaru, ditambah yang sedang live; hapus image docker milik release yang sudah dihapus
cleanup() {
  local live=" $(live_sha site) $(live_sha app) $(live_sha api) " d sha img
  for d in releases builds; do
    while read -r sha; do
      [ -n "$sha" ] || continue
      [[ "$live" == *" $sha "* ]] && continue
      rm -rf "${ROOT:?}/$d/$sha"
    done < <(ls -1t "$ROOT/$d" 2>/dev/null | grep -E '^[0-9a-f]{12}$' | tail -n +$((KEEP + 1)))
  done
  while read -r img; do
    [ -d "$ROOT/releases/${img##*:}" ] || docker image rm "$img" >/dev/null 2>&1 || true
  done < <(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E '^raqio-(api|worker):[0-9a-f]{12}$' || true)
}

targets() { case "$1" in all) echo "api app site" ;; *) echo "$1" ;; esac; }

status() {
  local t
  for t in site app api; do
    printf '  %-5s live=%-12s port %-5s http %s\n' "$t" "$(live_sha "$t")" "${PORT[$t]}" "$(http_code "http://127.0.0.1:${PORT[$t]}${CHECK[$t]}")"
  done
  echo "  release tersimpan: $(ls -1t "$ROOT/releases" 2>/dev/null | grep -E '^[0-9a-f]{12}$' | tr '\n' ' ')"
}

# ---------- perintah ----------

cmd="${1:-}"; shift || true
case "$cmd" in
  deploy)
    SHA="${1:?sha}"; WHAT="${2:-all}"
    REL="$ROOT/releases/$SHA"
    [ -d "$REL" ] || die "release $SHA tidak ada"
    for f in site.env app.env api.env; do [ -f "$SHARED/$f" ] || die "$SHARED/$f belum ada; jalankan: bash deploy/deploy.sh setup"; done
    log "deploy $SHA ($WHAT)"
    # 1) build + uji semua dulu; kalau ada yang gagal, tidak ada yang berubah di produksi
    T="$(targets "$WHAT")"
    if [[ " $T " == *" site "* || " $T " == *" app "* ]]; then prepare_build; install_deps; fi
    for t in $T; do
      case "$t" in
        site|app) build_next "$t"; smoke_next "$t" ;;
        api) build_api ;;
      esac
    done
    # 2) pindah: api dulu (app bergantung padanya), lalu app, lalu site; masing-masing dicek dan kembali otomatis bila gagal
    for t in $T; do
      case "$t" in
        api) switch_api ;;
        site|app) switch_next "$t" ;;
      esac
    done
    install_caddy
    cleanup
    status
    log "✓ live: $SHA ($WHAT)"
    ;;
  rollback)
    WHAT="${1:?target}"; WANT="${2:-}"
    for t in $(targets "$WHAT"); do
      cur="$(live_sha "$t")"
      to="$WANT"
      if [ -z "$to" ]; then
        # entri history terakhir sebelum posisi terakhir release yang sedang live
        mapfile -t hist < <(grep -E '^[0-9a-f]{12}$' "$ROOT/history-$t" 2>/dev/null || true)
        idx=-1
        for i in "${!hist[@]}"; do [ "${hist[$i]}" = "$cur" ] && idx=$i; done
        for ((i = idx - 1; i >= 0; i--)); do
          c="${hist[$i]}"; [ "$c" != "$cur" ] || continue
          if [ "$t" = api ]; then docker image inspect "raqio-api:$c" >/dev/null 2>&1 && { to="$c"; break; }
          else [ -f "$ROOT/builds/$c/.built-$t" ] && { to="$c"; break; }; fi
        done
      fi
      [ -n "$to" ] || die "$t: tidak ada release lebih lama yang masih tersimpan"
      [ "$to" != "$cur" ] || { log "$t: sudah di $to"; continue; }
      log "$t: rollback $cur → $to"
      if [ "$t" = api ]; then
        docker image inspect "raqio-api:$to" >/dev/null 2>&1 || die "image raqio-api:$to tidak ada"
        compose "$ROOT/releases/$to" up -d --no-build worker api
        wait_ok "http://127.0.0.1:${PORT[api]}${CHECK[api]}" 90 || die "api $to tidak sehat setelah rollback"
        set_link api "$ROOT/releases/$to"
      else
        [ -f "$ROOT/builds/$to/.built-$t" ] || die "build $t untuk $to tidak ada"
        set_link "$t" "$ROOT/builds/$to"
        pm2_apply "$t" "$ROOT/releases/$to"
        wait_ok "http://127.0.0.1:${PORT[$t]}${CHECK[$t]}" 60 || die "$t $to tidak sehat setelah rollback"
      fi
      log "✓ $t kembali ke $to"
    done
    status
    ;;
  status)
    status
    ;;
  *)
    die "pakai: deploy <sha> <target> | rollback <target> [sha] | status"
    ;;
esac
