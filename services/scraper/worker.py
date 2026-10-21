"""
worker.py, worker antrian Raqio.

Mengambil job dari tabel `jobs` di Postgres (FOR UPDATE SKIP LOCKED), menjalankan riset lewat market.py,
lalu menulis hasilnya ke tabel `reports` milik org. SQLite lokal (ig.db) tetap dipakai market.py sebagai
cache tempat (lintas org, tidak berisi data milik pelanggan selain yang memang publik di Google Maps).

Jenis job:
  market_run      {industry, area}            -> reports (1 baris)
  market_compare  {industry, areas[]}         -> reports (N baris) + result perbandingan
  market_detail   {report_id, key}            -> perbarui reports.report, result = bisnis yang diperbarui

Usage: DATABASE_URL=postgres://... python worker.py
Bisa dijalankan beberapa replika sekaligus.
"""
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

import psycopg

HERE = os.path.dirname(os.path.abspath(__file__))
DSN = os.environ.get("DATABASE_URL", "postgres://raqio:raqio@127.0.0.1:5433/raqio")
WORKER_ID = f"{socket.gethostname()}:{os.getpid()}"
POLL_SEC = float(os.environ.get("WORKER_POLL", "2"))
JOB_TIMEOUT = int(os.environ.get("JOB_TIMEOUT", str(25 * 60)))
HEARTBEAT_SEC = 30  # API menganggap worker mati kalau heartbeat > 10 menit
STOP = False


def log(msg):
    print(json.dumps({"ts": datetime.now(timezone.utc).isoformat(), "worker": WORKER_ID, "msg": msg}), flush=True)


def connect():
    return psycopg.connect(DSN, autocommit=True)


def claim(conn):
    """Ambil satu job antrian. Mengembalikan dict job atau None."""
    with conn.transaction():
        row = conn.execute("""
            UPDATE jobs SET status='running', started_at=now(), heartbeat_at=now(), attempts=attempts+1
            WHERE id = (SELECT id FROM jobs WHERE status='queued' AND run_after <= now()
                        ORDER BY priority, id LIMIT 1 FOR UPDATE SKIP LOCKED)
            RETURNING id, org_id, kind, params, attempts, max_attempts""").fetchone()
    if not row:
        return None
    return {"id": row[0], "org_id": str(row[1]), "kind": row[2], "params": row[3],
            "attempts": row[4], "max_attempts": row[5]}


def heartbeat(conn, jid):
    conn.execute("UPDATE jobs SET heartbeat_at = now() WHERE id=%s", (jid,))


def append_log(conn, jid, text):
    conn.execute("UPDATE jobs SET log = log || %s, heartbeat_at = now() WHERE id=%s", (text, jid))


def cancel_requested(conn, jid):
    row = conn.execute("SELECT cancel_requested FROM jobs WHERE id=%s", (jid,)).fetchone()
    return bool(row and row[0])


def retry_delay(attempts):
    """Backoff eksponensial: 1, 2, 4 menit, maksimal 15 menit."""
    return min(60 * 2 ** max(attempts - 1, 0), 15 * 60)


def finish(conn, jid, status, result=None, error=None, job=None):
    """Tutup job. Kalau gagal dan masih ada jatah percobaan, kembalikan ke antrian dengan backoff."""
    if status == "failed" and job and job.get("attempts", 0) < job.get("max_attempts", 1) and not cancel_requested(conn, jid):
        delay = retry_delay(job["attempts"])
        conn.execute("UPDATE jobs SET status='queued', error=%s, run_after=now() + %s * interval '1 second', "
                     "log = log || %s WHERE id=%s",
                     (error, delay, f"\n[gagal: {error}; coba lagi dalam {delay // 60} menit]\n", jid))
        return
    conn.execute("UPDATE jobs SET status=%s, result=%s, error=%s, finished_at=now() WHERE id=%s",
                 (status, json.dumps(result, ensure_ascii=False) if result is not None else None, error, jid))


def insert_report(conn, org_id, jid, report):
    row = conn.execute("INSERT INTO reports (org_id, job_id, industry, area, created_at, report) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
                       (org_id, jid, report["industry"], report["area"], report["created"], json.dumps(report, ensure_ascii=False))).fetchone()
    return row[0]


# ---------- jalankan market.py sebagai subprocess (log mengalir ke jobs.log, bisa dibatalkan) ----------

def run_cmd(conn, jid, script, args):
    cmd = [sys.executable, "-W", "ignore", "-u", script] + args
    append_log(conn, jid, "$ " + script + " " + " ".join(args) + "\n")
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    proc = subprocess.Popen(cmd, cwd=HERE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                            errors="replace", env=env)
    lines, buf, last_flush = [], [], time.time()

    def reader():
        for line in proc.stdout:
            lines.append(line)
            buf.append(line)

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    t0 = time.time()
    last_beat = t0
    cancelled = False
    while proc.poll() is None:
        time.sleep(1)
        # heartbeat tetap jalan walau market.py diam lama (Playwright), supaya API tidak mengira worker mati
        if time.time() - last_beat > HEARTBEAT_SEC:
            heartbeat(conn, jid)
            last_beat = time.time()
        if buf and time.time() - last_flush > 1.5:
            chunk, buf[:] = "".join(buf), []
            append_log(conn, jid, chunk)
            last_flush = time.time()
        if cancel_requested(conn, jid) or time.time() - t0 > JOB_TIMEOUT or STOP:
            cancelled = True
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
    t.join(timeout=5)
    if buf:
        append_log(conn, jid, "".join(buf))
    append_log(conn, jid, f"\n[selesai, exit code {proc.returncode}]\n")
    return "".join(lines), proc.returncode, cancelled


def sqlite_report(rid):
    import market
    conn = market.db()
    try:
        row = conn.execute("SELECT report FROM market_reports WHERE id=?", (rid,)).fetchone()
    finally:
        conn.close()
    return json.loads(row[0]) if row else None


def last_error_line(out):
    tail = [l for l in out.strip().splitlines() if l.strip() and not l.startswith("[selesai")]
    return (tail[-1] if tail else "gagal tanpa pesan")[:300]


# ---------- handler per jenis job ----------

def run_market_cmd(conn, jid, args):
    return run_cmd(conn, jid, "market.py", args)


def do_market_run(conn, job):
    import re
    p = job["params"]
    out, code, cancelled = run_market_cmd(conn, job["id"], ["--industry", p["industry"], "--area", p["area"]])
    if cancelled:
        return "cancelled", None, "Dihentikan."
    m = re.findall(r"REPORT_ID=(\d+)", out)
    if not m:  # laporan sudah tersimpan sebelum baris terakhir, jadi exit code bukan patokan
        return "failed", None, last_error_line(out)
    rep = sqlite_report(int(m[-1]))
    pg_id = insert_report(conn, job["org_id"], job["id"], rep)
    if p.get("watch"):
        conn.execute("UPDATE watches SET last_run=now() WHERE org_id=%s AND lower(industry)=lower(%s) AND lower(area)=lower(%s)",
                     (job["org_id"], p["industry"], p["area"]))
    append_log(conn, job["id"], f"REPORT_PG_ID={pg_id}\n")
    return "done", {"report_id": pg_id}, None


def do_market_compare(conn, job):
    import re
    import market
    p = job["params"]
    areas = [a for a in p.get("areas") or [] if a][:8]
    out, code, cancelled = run_market_cmd(conn, job["id"], ["--industry", p["industry"], "--areas", ";".join(areas), "--reuse-days", "0"])
    if cancelled:
        return "cancelled", None, "Dihentikan."
    if "COMPARE_DONE" not in out:
        return "failed", None, last_error_line(out)
    id_map = {}
    for sid in re.findall(r"REPORT_ID=(\d+)", out):
        rep = sqlite_report(int(sid))
        if rep:
            id_map[int(sid)] = insert_report(conn, job["org_id"], job["id"], rep)
    res = market.compare(p["industry"], areas)
    for row in res.get("areas") or []:
        row["report_id"] = id_map.get(row.get("report_id"), row.get("report_id"))
    return "done", res, None


def do_market_detail(conn, job):
    """Cek kontak satu bisnis: cepat (±15 detik), dijalankan in-process."""
    import datastore
    import gmaps
    import market
    p = job["params"]
    row = conn.execute("SELECT report FROM reports WHERE id=%s AND org_id=%s", (p["report_id"], job["org_id"])).fetchone()
    if not row:
        return "failed", None, "laporan tidak ada"
    rep = row[0]
    biz = next((x for x in rep.get("all") or [] if market.lead_key(x) == p["key"]), None)
    if not biz or not biz.get("maps_url"):
        return "failed", None, "bisnis tidak ada di laporan"
    biz.pop("_detailed", None)
    append_log(conn, job["id"], f"Cek kontak {biz.get('name')}\n")
    gmaps.details([biz], limit=1)
    if not biz.get("_detailed"):
        return "failed", None, "Google Maps tidak merespons, coba lagi sebentar lagi"
    if biz.get("website") and not biz.get("instagram"):
        market.find_instagram([biz], limit=1)
    biz.update({k: v for k, v in (datastore.clean_place(dict(biz)) or {}).items() if k in ("phone", "website", "instagram")})
    if biz.get("phone"):
        biz["whatsapp"] = market.wa_link(biz["phone"])
    biz["lead_score"], biz["lead_reasons"] = market.lead_score(biz)
    conn.execute("UPDATE reports SET report=%s WHERE id=%s", (json.dumps(rep, ensure_ascii=False), p["report_id"]))
    # perbarui cache tempat lokal juga, supaya riset berikutnya tidak perlu cek ulang
    try:
        sconn = market.db()
        got = sconn.execute("SELECT data FROM places WHERE place_id=?", (biz.get("place_id"),)).fetchone()
        if got:
            d = json.loads(got[0])
            d.update({k: biz[k] for k in ("phone", "website", "instagram", "_detailed") if biz.get(k)})
            sconn.execute("UPDATE places SET data=? WHERE place_id=?", (json.dumps(d, ensure_ascii=False), biz["place_id"]))
            sconn.commit()
        sconn.close()
    except Exception as e:
        log(f"cache tempat gagal diperbarui: {e}")
    return "done", biz, None


def do_ig_profile(conn, job):
    """Scrape satu akun IG lewat ig_scraper.py, lalu salin profilnya ke Postgres (cache bersama)."""
    import re
    import sqlite3
    u = str(job["params"].get("username", "")).lower()
    if not re.fullmatch(r"[A-Za-z0-9._]{1,30}", u):
        return "failed", None, "username tidak valid"
    args = ["--mode", "direct", "--targets", u, "--out", "hasil"]
    if job["params"].get("force"):
        args += ["--refresh-hours", "0"]
    out, code, cancelled = run_cmd(conn, job["id"], "ig_scraper.py", args)
    if cancelled:
        return "cancelled", None, "Dihentikan."
    db = os.path.join(os.environ.get("RAQIO_DATA_DIR", HERE), "ig.db")
    sconn = sqlite3.connect(db)
    try:
        row = sconn.execute("SELECT data, followers, last_scraped, followers_history FROM profiles WHERE lower(username)=?", (u,)).fetchone()
    finally:
        sconn.close()
    if not row:
        return "failed", None, last_error_line(out) if code else "akun tidak ditemukan atau Instagram menolak"
    data, followers, last, hist = row
    conn.execute("""INSERT INTO ig_profiles (username, data, followers, history, last_scraped) VALUES (%s,%s,%s,%s,%s)
        ON CONFLICT (username) DO UPDATE SET data=excluded.data, followers=excluded.followers,
        history=excluded.history, last_scraped=excluded.last_scraped""",
                 (u, data, followers, hist or "[]", last or datetime.now(timezone.utc).isoformat()))
    return "done", {"username": u, "followers": followers}, None


HANDLERS = {"market_run": do_market_run, "market_compare": do_market_compare, "market_detail": do_market_detail,
            "ig_profile": do_ig_profile}


def handle(conn, job):
    jid = job["id"]
    log(f"job {jid} {job['kind']} mulai")
    fn = HANDLERS.get(job["kind"])
    if not fn:
        finish(conn, jid, "failed", error=f"jenis job tidak dikenal: {job['kind']}")
        return
    try:
        status, result, err = fn(conn, job)
    except Exception as e:  # noqa: BLE001
        status, result, err = "failed", None, f"{type(e).__name__}: {e}"[:500]
        log(f"job {jid} exception: {err}")
    finish(conn, jid, status, result, err, job=job)
    log(f"job {jid} {status}" + (f": {err}" if err else ""))


def main():
    def stop(*_):
        global STOP
        STOP = True
        log("berhenti setelah job ini selesai")

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    log("worker siap, DSN=" + DSN.split("@")[-1])
    conn = None
    while not STOP:
        try:
            if conn is None or conn.closed:
                conn = connect()
            job = claim(conn)
            if not job:
                time.sleep(POLL_SEC)
                continue
            handle(conn, job)
        except psycopg.OperationalError as e:
            log(f"db putus: {e}; coba lagi 5 detik")
            conn = None
            time.sleep(5)


if __name__ == "__main__":
    main()
