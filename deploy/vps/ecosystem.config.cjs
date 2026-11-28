// pm2 untuk dua app Next raqio di VPS, dijalankan sebagai user non-root `raqio` (lihat deploy/remote-deploy.sh).
// Env dibaca dari /opt/raqio/shared/{site,app}.env saat start/reload; file itu dibuat provision.sh, tidak di-commit.
// cwd lewat symlink current-site / current-app, jadi reload selalu memakai release yang sedang aktif.
const fs = require("node:fs");

const ROOT = process.env.RAQIO_ROOT || "/opt/raqio";
const SHARED = `${ROOT}/shared`;

// KEY=VALUE per baris; abaikan komentar dan baris kosong; kutip tunggal/ganda di tepi dibuang.
function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(`${SHARED}/${file}`, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

const next = (name, target, file, port) => ({
  name,
  cwd: `${ROOT}/current-${target}/apps/${target === "site" ? "site" : "scraping"}`,
  script: "node_modules/next/dist/bin/next",
  args: `start -p ${port} -H 127.0.0.1`,
  exec_mode: "fork",
  instances: 1,
  max_memory_restart: "768M",
  kill_timeout: 8000,
  min_uptime: "10s",
  max_restarts: 10,
  time: true,
  env: { ...loadEnv(file), NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", PORT: String(port) },
});

module.exports = {
  apps: [
    next("raqio-site", "site", "site.env", Number(process.env.RAQIO_SITE_PORT || 3120)),
    next("raqio-app", "app", "app.env", Number(process.env.RAQIO_APP_PORT || 3121)),
  ],
};
