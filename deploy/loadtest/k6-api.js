// Uji beban Raqio dengan k6. Tidak membuat job riset (tidak memanggil /market/run), hanya jalur baca dan sesi.
//
//   docker run --rm -i --add-host=host.docker.internal:host-gateway \
//     -e BASE=http://host.docker.internal:3000 -e USER=demo@raqio.local -e PASS=demo12345 \
//     -e VUS=5 -e DURATION=30s grafana/k6 run - < deploy/loadtest/k6-api.js
//
// Skenario:
//   baca   : login sekali per VU, lalu campuran GET /auth/me, /market/reports, /prospects/data, /watch/data, /watch/alerts
//   tamu   : POST /auth/guest dengan laju rendah (limiter tamu sengaja ketat; 429 dihitung "ditolak", bukan error)
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE = __ENV.BASE || "http://localhost:3000";
const USER = __ENV.USER || "demo@raqio.local";
const PASS = __ENV.PASS || "demo12345";
const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || "30s";

const readLatency = new Trend("raqio_read_latency", true);
const readErrors = new Rate("raqio_read_errors"); // status selain 200 dan 429
const rateLimited = new Counter("raqio_rate_limited"); // 429: rate limit per IP (300/menit default), bukan error
const guestRejected = new Counter("raqio_guest_rejected");

export const options = {
  scenarios: {
    baca: { executor: "constant-vus", vus: VUS, duration: DURATION, exec: "baca" },
    tamu: { executor: "constant-arrival-rate", rate: 2, timeUnit: "1m", duration: DURATION, preAllocatedVUs: 1, exec: "tamu" },
  },
  thresholds: {
    raqio_read_errors: ["rate<0.01"],
    raqio_read_latency: ["p(95)<500"],
  },
};

const JSON_HEADERS = { "Content-Type": "application/json", Origin: BASE };

export function setup() {
  const r = http.post(`${BASE}/auth/login`, JSON.stringify({ email: USER, password: PASS }), { headers: JSON_HEADERS });
  if (r.status !== 200) throw new Error(`login gagal: ${r.status} ${r.body}`);
  return { cookie: r.cookies["raqio_session"] ? r.cookies["raqio_session"][0].value : "" };
}

export function baca(data) {
  const jar = http.cookieJar();
  jar.set(BASE, "raqio_session", data.cookie);
  const paths = ["/auth/me", "/market/reports", "/prospects/data", "/watch/data", "/watch/alerts"];
  const p = paths[Math.floor(Math.random() * paths.length)];
  const r = http.get(`${BASE}${p}`, { headers: { Accept: "application/json" }, tags: { path: p } });
  if (r.status === 429) rateLimited.add(1);
  else readLatency.add(r.timings.duration, { path: p });
  readErrors.add(r.status !== 200 && r.status !== 429);
  check(r, { "200 atau 429": (res) => res.status === 200 || res.status === 429 });
  sleep(0.3 + Math.random() * 0.7);
}

export function tamu() {
  const r = http.post(`${BASE}/auth/guest`, "{}", { headers: JSON_HEADERS, tags: { path: "/auth/guest" } });
  if (r.status === 429) guestRejected.add(1);
  check(r, { "200 atau 429": (res) => res.status === 200 || res.status === 429 });
}
