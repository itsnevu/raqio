"""
worker.py, worker antrian Raqio.

Mengambil job dari tabel `jobs` di Postgres (FOR UPDATE SKIP LOCKED), menjalankan riset lewat market.py,
lalu menulis hasilnya ke tabel `reports` milik org. SQLite lokal (ig.db) tetap dipakai market.py sebagai
cache tempat (lintas org, tidak berisi data milik pelanggan selain yang memang publik di Google Maps).

Jenis job:
  market_run      {industry, area}            -> reports (1 baris)
  market_compare  {industry, areas[]}         -> reports (N baris) + result perbandingan
  market_detail   {report_id, key}            -> market.py --detail (subprocess), perbarui reports.report,
                                                 result = bisnis yang diperbarui
  ig_profile      {username, force?}          -> ig_profiles (cache bersama)
  chat            {sid, message, message_id, limits, app_url, context?, org_name?, plan?, role?, verified?}
                                              -> agent.run_agent di thread; log tool ("🔧 nama({args})") ke job_logs;
                                                 result {answer, model, report_ids}; chat_messages (assistant) dan
                                                 chat_sessions.history ditulis satu transaksi dengan finish.
                                                 Gagal: "OPENROUTER_API_KEY belum diisi" (permanen); batal: "Dihentikan.";
                                                 batas waktu CHAT_TIMEOUT (default 600 detik, transien).

Kontrak dengan API (migrasi 007, semuanya opsional dan dideteksi saat start lewat information_schema):
  jobs.locked_by      : diisi WORKER_ID saat claim; semua UPDATE finish/insert laporan bersyarat
                        `status='running' AND locked_by=WORKER_ID` (fencing). 0 baris = job diambil alih.
  job_logs            : baris log per job (job_id, seq, line, at) selain jobs.log (64 KB terakhir).
  reports.summary     : JSONB ringkasan laporan, diisi saat insert.
Job chat memakai tabel chat_sessions / chat_messages (migrasi 008).

Perilaku STOP (SIGTERM/SIGINT): job yang sedang jalan dikembalikan ke antrian (queued, attempts-1), bukan
cancelled; kalau subprocess sudah hampir selesai (sudah ada REPORT_ID=) ditunggu maksimal 20 detik dulu.

Env: DATABASE_URL (wajib), APP_URL (tautan laporan di jawaban chat, default http://localhost:3000),
OPENROUTER_API_KEY (chat). File services/scraper/.env (format `export KEY="nilai"`) dimuat saat start untuk dev,
tanpa menimpa env yang sudah ada; di container env datang dari compose.

Usage: DATABASE_URL=postgres://... python worker.py
Bisa dijalankan beberapa replika sekaligus.
"""
import json
import os
import re
import signal
import socket
import tempfile
import threading
import time
from datetime import datetime, timezone

import psycopg

import procutil

HERE = os.path.dirname(os.path.abspath(__file__))


def load_env(path=os.path.join(HERE, ".env")):
    """Isi os.environ dari .env (format `export KEY="nilai"`), tanpa menimpa yang sudah di-set.
    Dipindahkan dari app.py legacy supaya worker dev membaca OPENROUTER_API_KEY, OPENROUTER_MODEL, TG_TOKEN."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = re.match(r'\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s#]*))', line)
            if m and m.group(1) not in os.environ:
                val = next(g for g in m.groups()[1:] if g is not None)
                if val:
                    os.environ[m.group(1)] = val


load_env()

DSN = os.environ.get("DATABASE_URL", "postgres://raqio:raqio@127.0.0.1:5433/raqio")
APP_URL = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")
WORKER_ID = os.environ.get("WORKER_ID") or f"{socket.gethostname()}:{os.getpid()}"
POLL_SEC = float(os.environ.get("WORKER_POLL", "2"))
JOB_TIMEOUT = int(os.environ.get("JOB_TIMEOUT", str(25 * 60)))
DETAIL_TIMEOUT = int(os.environ.get("DETAIL_TIMEOUT", "60"))
CHAT_TIMEOUT = int(os.environ.get("CHAT_TIMEOUT", "600"))
HEARTBEAT_SEC = 30  # API menganggap worker mati kalau heartbeat > 10 menit
CANCEL_CHECK_SEC = 5
LOG_FLUSH_SEC = 1.5
STOP_GRACE_SEC = 20  # tunggu subprocess yang hampir selesai saat STOP
LOG_KEEP = 64 * 1024  # jobs.log hanya menyimpan sekian karakter terakhir
MAX_COMPARE_AREAS = int(os.environ.get("MAX_COMPARE_AREAS", "8"))  # sama dengan market.py
CACHE_PURGE_EVERY = 6 * 3600
EXIT_PERMANENT = 2  # market.py: kesalahan input/permanen
STOP = False

# dideteksi sekali saat start (detect_schema); False = fallback ke perilaku lama tanpa kolom itu
SCHEMA = {"locked_by": False, "job_logs": False, "summary": False}
_LOG_SEQ = {}  # job_id -> seq terakhir di job_logs

PERMANENT_MARKERS = (
    "tidak ada hasil dari google maps", "semua hasil tersaring", "laporan tidak ada", "bisnis tidak ditemukan",
    "bisnis tidak ada di laporan", "username tidak valid", "jenis job tidak dikenal", "tidak valid",
)


class JobTakenOver(Exception):
    """UPDATE bersyarat locked_by mengenai 0 baris: job sudah diambil alih worker lain atau dibatalkan API."""


class Deferred:
    """Pekerjaan tulis yang harus satu transaksi dengan finish (insert/update laporan). fn(conn) -> result."""

    def __init__(self, fn):
        self.fn = fn


def log(msg):
    print(json.dumps({"ts": datetime.now(timezone.utc).isoformat(), "worker": WORKER_ID, "msg": msg}), flush=True)


def connect():
    return psycopg.connect(DSN, autocommit=True)


def detect_schema(conn):
    """Cek sekali kolom/tabel dari migrasi 007; kalau belum ada, pakai perilaku lama."""
    rows = conn.execute("""SELECT table_name, column_name FROM information_schema.columns
                           WHERE table_schema = current_schema() AND table_name IN ('jobs', 'reports', 'job_logs')""").fetchall()
    cols = {(t, c) for t, c in rows}
    SCHEMA["locked_by"] = ("jobs", "locked_by") in cols
    SCHEMA["job_logs"] = all(("job_logs", c) in cols for c in ("job_id", "seq", "line"))
    SCHEMA["summary"] = ("reports", "summary") in cols
    return dict(SCHEMA)


def _rows(cur):
    """rowcount kursor; -1 (tidak diketahui, mis. koneksi palsu di tes) dianggap berhasil."""
    return getattr(cur, "rowcount", -1)


def fence():
    """Potongan WHERE + parameter untuk fencing. Tanpa kolom locked_by hanya syarat status='running'."""
    if SCHEMA["locked_by"]:
        return " AND status='running' AND locked_by=%s", (WORKER_ID,)
    return " AND status='running'", ()


def claim(conn):
    """Ambil satu job antrian. Mengembalikan dict job atau None."""
    lock_sql, lock_params = (", locked_by=%s", (WORKER_ID,)) if SCHEMA["locked_by"] else ("", ())
    with conn.transaction():
        row = conn.execute(f"""
            UPDATE jobs SET status='running', started_at=now(), heartbeat_at=now(), attempts=attempts+1{lock_sql}
            WHERE id = (SELECT id FROM jobs WHERE status='queued' AND run_after <= now()
                        ORDER BY priority, id LIMIT 1 FOR UPDATE SKIP LOCKED)
            RETURNING id, org_id, kind, params, attempts, max_attempts""", lock_params).fetchone()
    if not row:
        return None
    return {"id": row[0], "org_id": str(row[1]), "kind": row[2], "params": row[3],
            "attempts": row[4], "max_attempts": row[5]}


def heartbeat(conn, jid):
    f_sql, f_params = fence()
    cur = conn.execute(f"UPDATE jobs SET heartbeat_at = now() WHERE id=%s{f_sql}", (jid, *f_params))
    if _rows(cur) == 0:
        raise JobTakenOver(f"job {jid} diambil alih (heartbeat 0 baris)")


def _log_lines(conn, jid, text):
    """Tulis baris ke job_logs (batch, seq naik per job). Diabaikan kalau tabelnya belum ada."""
    if not SCHEMA["job_logs"] or not text:
        return
    lines = [l for l in text.split("\n") if l.strip()]
    if not lines:
        return
    if jid not in _LOG_SEQ:
        row = conn.execute("SELECT coalesce(max(seq), 0) FROM job_logs WHERE job_id=%s", (jid,)).fetchone()
        _LOG_SEQ[jid] = int(row[0]) if row else 0
    seq = _LOG_SEQ[jid]
    values, params = [], []
    for l in lines:
        seq += 1
        values.append("(%s,%s,%s)")
        params += [jid, seq, l[:4000]]
    conn.execute("INSERT INTO job_logs (job_id, seq, line) VALUES " + ",".join(values), params)
    _LOG_SEQ[jid] = seq


def append_log(conn, jid, text):
    """Tambah teks ke jobs.log (dipotong ke 64 KB terakhir) + job_logs; sekaligus heartbeat dan cek fencing."""
    f_sql, f_params = fence()
    cur = conn.execute(f"UPDATE jobs SET log = right(log || %s, {LOG_KEEP}), heartbeat_at = now() WHERE id=%s{f_sql}",
                       (text, jid, *f_params))
    if _rows(cur) == 0:
        raise JobTakenOver(f"job {jid} diambil alih (log 0 baris)")
    _log_lines(conn, jid, text)


def cancel_requested(conn, jid):
    row = conn.execute("SELECT cancel_requested FROM jobs WHERE id=%s", (jid,)).fetchone()
    return bool(row and row[0])


def retry_delay(attempts):
    """Backoff eksponensial: 1, 2, 4 menit, maksimal 15 menit."""
    return min(60 * 2 ** max(attempts - 1, 0), 15 * 60)


def is_permanent(error, job=None):
    """Error yang tidak akan berhasil kalau diulang: teks tertentu, atau exit code 2 dari market.py."""
    if job and job.get("permanent"):
        return True
    e = (error or "").lower()
    return any(m in e for m in PERMANENT_MARKERS)


def finish(conn, jid, status, result=None, error=None, job=None):
    """Tutup job (bersyarat locked_by). Mengembalikan False kalau job sudah diambil alih (tidak ada yang ditulis).
    - failed transien dan masih ada jatah: kembali ke antrian dengan backoff, started_at direset.
    - requeued (worker berhenti): kembali ke antrian sekarang, attempts dikurangi 1.
    - lainnya: status final."""
    f_sql, f_params = fence()
    unlock = ", locked_by=NULL" if SCHEMA["locked_by"] else ""
    if status == "requeued":
        line = "\n[worker berhenti, job diantrekan ulang]\n"
        cur = conn.execute(f"UPDATE jobs SET status='queued', attempts=greatest(attempts-1, 0), run_after=now(), "
                           f"started_at=NULL, heartbeat_at=NULL{unlock}, log = right(log || %s, {LOG_KEEP}) "
                           f"WHERE id=%s{f_sql}", (line, jid, *f_params))
        if _rows(cur) == 0:
            return False
        _log_lines(conn, jid, line)
        return True
    if (status == "failed" and job and not is_permanent(error, job)
            and job.get("attempts", 0) < job.get("max_attempts", 1) and not cancel_requested(conn, jid)):
        delay = retry_delay(job["attempts"])
        line = f"\n[gagal: {error}; coba lagi dalam {delay // 60} menit]\n"
        cur = conn.execute(f"UPDATE jobs SET status='queued', error=%s, run_after=now() + %s * interval '1 second', "
                           f"started_at=NULL{unlock}, log = right(log || %s, {LOG_KEEP}) WHERE id=%s{f_sql}",
                           (error, delay, line, jid, *f_params))
        if _rows(cur) == 0:
            return False
        _log_lines(conn, jid, line)
        return True
    cur = conn.execute(f"UPDATE jobs SET status=%s, result=%s, error=%s, finished_at=now() WHERE id=%s{f_sql}",
                       (status, json.dumps(result, ensure_ascii=False) if result is not None else None, error, jid,
                        *f_params))
    return _rows(cur) != 0


def insert_report(conn, org_id, jid, report):
    """Simpan laporan. created_at memakai now() DB (default kolom); report["created"] tetap ada di JSON."""
    cols, marks = "org_id, job_id, industry, area, report", "%s,%s,%s,%s,%s"
    params = [org_id, jid, report["industry"], report["area"], json.dumps(report, ensure_ascii=False)]
    if SCHEMA["summary"]:
        cols += ", summary"
        marks += ",%s"
        params.append(json.dumps(report.get("summary") or {}, ensure_ascii=False))
    row = conn.execute(f"INSERT INTO reports ({cols}) VALUES ({marks}) RETURNING id", params).fetchone()
    return row[0]


# ---------- jalankan market.py sebagai subprocess (log mengalir ke jobs.log, bisa dibatalkan) ----------

def run_cmd(conn, jid, script, args, timeout=None):
    """Jalankan script Python sebagai subprocess. Mengembalikan (output, exit_code, cancelled) dengan cancelled
    False | "cancel" (diminta pengguna) | "timeout" (timeout detik, default JOB_TIMEOUT) | "stop" (worker berhenti)."""
    timeout = JOB_TIMEOUT if timeout is None else timeout
    args = [str(a) for a in args]
    append_log(conn, jid, "$ " + script + " " + " ".join(args) + "\n")
    # DATABASE_URL ikut diteruskan supaya market.py --detail membaca laporan dari Postgres yang sama; rahasia lain (SMTP,
    # AUTH_SECRET) tidak diwariskan. Anak jalan sebagai grup proses sendiri supaya Chromium ikut mati saat dihentikan.
    proc = procutil.popen(script, args, cwd=HERE, env=procutil.child_env({"DATABASE_URL": DSN}))
    lines, buf = [], []
    near_done = threading.Event()

    def reader():
        for line in proc.stdout:
            lines.append(line)
            buf.append(line)
            if "REPORT_ID=" in line or "COMPARE_DONE" in line:
                near_done.set()

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    t0 = time.time()
    last_beat = last_flush = last_cancel = t0
    cancelled = False
    stop_since = None

    def kill():
        procutil.kill_tree(proc)

    try:
        while proc.poll() is None:
            time.sleep(0.5)
            now = time.time()
            # heartbeat tetap jalan walau market.py diam lama (Playwright), supaya API tidak mengira worker mati
            if now - last_beat > HEARTBEAT_SEC:
                heartbeat(conn, jid)
                last_beat = now
            if buf and now - last_flush > LOG_FLUSH_SEC:
                n = len(buf)  # baris yang masuk setelah titik ini ikut flush berikutnya (tidak hilang seperti tukar-list)
                chunk = "".join(buf[:n])
                del buf[:n]
                append_log(conn, jid, chunk)
                last_flush = last_beat = now
            if now - last_cancel > CANCEL_CHECK_SEC:
                last_cancel = now
                if cancel_requested(conn, jid):
                    cancelled = "cancel"
                    kill()
                    break
            if now - t0 > timeout:
                cancelled = "timeout"
                kill()
                break
            if STOP:
                if stop_since is None:
                    stop_since = now
                # hampir selesai: beri waktu menulis laporan, maksimal STOP_GRACE_SEC
                if not near_done.is_set() or now - stop_since > STOP_GRACE_SEC:
                    cancelled = "stop"
                    kill()
                    break
    finally:
        if proc.poll() is None:
            kill()
    t.join(timeout=5)
    tail = "".join(buf)
    note = {"cancel": "\n[dibatalkan]\n", "timeout": f"\n[melebihi batas waktu {_durasi(timeout)}]\n",
            "stop": ""}.get(cancelled, f"\n[selesai, exit code {proc.returncode}]\n")
    append_log(conn, jid, tail + note)
    return "".join(lines), proc.returncode, cancelled


def last_error_line(out):
    tail = [l for l in out.strip().splitlines() if l.strip() and not l.startswith("[selesai")]
    return (tail[-1] if tail else "gagal tanpa pesan")[:300]


def read_out(path):
    """Hasil JSON yang ditulis market.py lewat --out; None kalau tidak ada / rusak."""
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


class OutFile:
    """File sementara untuk hasil subprocess (--out). Dihapus setelah dibaca."""

    def __init__(self, jid):
        fd, self.path = tempfile.mkstemp(prefix=f"raqio-job{jid}-", suffix=".json")
        os.close(fd)
        os.unlink(self.path)  # market.py yang membuatnya (atomik lewat rename); tidak ada = gagal

    def read(self):
        return read_out(self.path)

    def cleanup(self):
        try:
            os.unlink(self.path)
        except OSError:
            pass


def _subprocess_failure(job, out, code, data):
    """Status gagal untuk hasil subprocess tanpa laporan: pakai pesan dari file --out kalau ada."""
    if data and data.get("error"):
        if data.get("permanent") or code == EXIT_PERMANENT:
            job["permanent"] = True
        return "failed", None, str(data["error"])[:300]
    if code == EXIT_PERMANENT:
        job["permanent"] = True
    return "failed", None, last_error_line(out)


def _durasi(detik):
    return f"{detik // 60} menit" if detik >= 60 else f"{detik} detik"


def _cancelled(cancelled, timeout=None):
    if cancelled == "stop":
        return "requeued", None, None
    if cancelled == "timeout":
        return "failed", None, f"melebihi batas waktu {_durasi(JOB_TIMEOUT if timeout is None else timeout)}"  # transien
    return "cancelled", None, "Dihentikan."


# ---------- handler per jenis job ----------

def run_market_cmd(conn, jid, args, timeout=None):
    return run_cmd(conn, jid, "market.py", args, timeout=timeout)


def do_market_run(conn, job):
    p = job["params"] or {}
    ind, area = procutil.cli_value(p.get("industry"), 60), procutil.cli_value(p.get("area"), 80)
    if not ind or not area:
        job["permanent"] = True
        return "failed", None, "parameter riset tidak valid (industri/wilayah kosong)"
    out_file = OutFile(job["id"])
    try:
        out, code, cancelled = run_market_cmd(conn, job["id"], ["--industry", ind, "--area", area, "--out", out_file.path])
        if cancelled:
            return _cancelled(cancelled)
        data = out_file.read()
    finally:
        out_file.cleanup()
    rep = (data or {}).get("report")
    if not rep:
        return _subprocess_failure(job, out, code, data)
    # logo bisnis (favicon website / foto profil IG) supaya nama langsung dikenali; dibatasi waktu, gagal diabaikan
    try:
        import logo
        marked, downloaded = logo.enrich_report(conn, rep, heartbeat=lambda: heartbeat(conn, job["id"]),
                                                should_stop=lambda: cancel_requested(conn, job["id"]),
                                                log=lambda t: append_log(conn, job["id"], t + "\n"))
        append_log(conn, job["id"], f"[logo] {marked} sudah ada, {downloaded} baru diunduh\n")
    except Exception as e:  # noqa: BLE001
        append_log(conn, job["id"], f"[logo] dilewati: {e}\n")

    def write(c):
        pg_id = insert_report(c, job["org_id"], job["id"], rep)
        if p.get("watch"):
            c.execute("UPDATE watches SET last_run=now() WHERE org_id=%s AND lower(industry)=lower(%s) AND lower(area)=lower(%s)",
                      (job["org_id"], p["industry"], p["area"]))
        append_log(c, job["id"], f"REPORT_PG_ID={pg_id}\n")
        return {"report_id": pg_id}

    return "done", Deferred(write), None


def do_market_compare(conn, job):
    import market
    p = job["params"] or {}
    ind = procutil.cli_value(p.get("industry"), 60)
    areas = [a for a in (procutil.cli_value(x, 80) for x in p.get("areas") or []) if a][:MAX_COMPARE_AREAS]
    if not ind or not areas:
        job["permanent"] = True
        return "failed", None, "parameter riset tidak valid (industri/wilayah kosong)"
    # tiap wilayah butuh waktu riset penuh: batas job diskalakan supaya 8 wilayah tidak dipotong di menit ke-25
    timeout = JOB_TIMEOUT * len(areas)
    out_file = OutFile(job["id"])
    try:
        out, code, cancelled = run_market_cmd(conn, job["id"], ["--industry", ind, "--areas", ";".join(areas),
                                                                "--reuse-days", "0", "--out", out_file.path], timeout=timeout)
        data = out_file.read()  # market.py menulis hasil parsial setelah tiap wilayah, jadi ada walau dihentikan
        if cancelled == "timeout" and any(r.get("ok") for r in (data or {}).get("areas") or []):
            done = {r.get("area") for r in data["areas"]}
            data["areas"] += [{"area": a, "ok": False, "error": f"melebihi batas waktu {_durasi(timeout)}", "permanent": False}
                              for a in areas if a not in done]
            append_log(conn, job["id"], "[batas waktu habis; wilayah yang sudah selesai tetap disimpan]\n")
        elif cancelled:
            return _cancelled(cancelled, timeout)
    finally:
        out_file.cleanup()
    results = (data or {}).get("areas") or []
    ok = [r for r in results if r.get("ok") and r.get("report")]
    failed = [{"area": r.get("area"), "error": r.get("error") or "gagal"} for r in results if not r.get("ok")]
    if not ok:
        if not failed:  # file --out tidak ada atau kosong: market.py mati sebelum menulis hasil
            return _subprocess_failure(job, out, code, data)
        if all(r.get("permanent") for r in results if not r.get("ok")):
            job["permanent"] = True
        return "failed", None, "; ".join(f"{f['area']}: {f['error']}" for f in failed)[:300]

    def write(c):
        found = []
        for r in ok:
            pg_id = insert_report(c, job["org_id"], job["id"], r["report"])
            found.append((r["area"], pg_id, r["report"]))
        res = market.compare_reports(p["industry"], found, failed)
        append_log(c, job["id"], "".join(f"REPORT_PG_ID={rid}\n" for _, rid, _ in found))
        return res

    return "done", Deferred(write), None


def run_with_timeout(conn, jid, fn, timeout):
    """Jalankan fn di thread; sambil menunggu: heartbeat tiap 30 detik, cek cancel tiap 5 detik.
    Mengembalikan "done" | "timeout" | "cancel" | "error" (exception di box["error"])."""
    box = {}

    def target():
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            box["error"] = e

    t = threading.Thread(target=target, daemon=True)
    t.start()
    t0 = time.time()
    last_beat = last_cancel = t0
    while t.is_alive():
        t.join(1)
        now = time.time()
        if now - last_beat > HEARTBEAT_SEC:
            heartbeat(conn, jid)
            last_beat = now
        if now - last_cancel > CANCEL_CHECK_SEC:
            last_cancel = now
            if cancel_requested(conn, jid):
                return "cancel", box
        if now - t0 > timeout and t.is_alive():
            return "timeout", box
    return ("error" if "error" in box else "done"), box


def do_market_detail(conn, job):
    """Cek kontak satu bisnis: `market.py --detail` sebagai subprocess (log mengalir, batas DETAIL_TIMEOUT detik,
    bisa dibatalkan, tidak ada thread Playwright yang menggantung), lalu laporan diperbarui dengan
    SELECT ... FOR UPDATE dan bagian prospects/leaders disusun ulang."""
    import market
    p = job["params"]
    row = conn.execute("SELECT report FROM reports WHERE id=%s AND org_id=%s", (p["report_id"], job["org_id"])).fetchone()
    if not row:
        return "failed", None, "laporan tidak ada"
    rep = row[0]
    biz = next((x for x in rep.get("all") or [] if market.lead_key(x) == p["key"]), None)
    if not biz or not biz.get("maps_url"):
        return "failed", None, "bisnis tidak ditemukan di laporan"
    append_log(conn, job["id"], f"Cek kontak {biz.get('name')}\n")
    out_file = OutFile(job["id"])
    try:
        out, code, cancelled = run_market_cmd(conn, job["id"], ["--detail", "--report", str(p["report_id"]),
                                                                "--key", str(p["key"]), "--out", out_file.path],
                                              timeout=DETAIL_TIMEOUT)
        if cancelled == "timeout":
            return "failed", None, f"Google Maps tidak merespons dalam {DETAIL_TIMEOUT} detik, coba lagi sebentar lagi"
        if cancelled:
            return _cancelled(cancelled)
        data = out_file.read()
    finally:
        out_file.cleanup()
    got = (data or {}).get("business")
    if not got or not got.get("_detailed"):
        return _subprocess_failure(job, out, code, data)
    fresh = {k: got.get(k) for k in ("phone", "website", "instagram", "emails", "whatsapp", "_detailed") if got.get(k)}
    # logo dari website/IG yang baru didapat, diambil sebelum transaksi tulis (jangan menahan kunci FOR UPDATE saat jaringan)
    try:
        import logo
        if logo.enrich_one(conn, got, log=lambda t: append_log(conn, job["id"], t + "\n")):
            fresh["logo_key"] = got["logo_key"]
    except Exception as e:  # noqa: BLE001
        append_log(conn, job["id"], f"[logo] dilewati: {e}\n")

    def write(c):
        # read-modify-write JSONB dikunci supaya dua job detail pada laporan yang sama tidak saling timpa
        row = c.execute("SELECT report FROM reports WHERE id=%s AND org_id=%s FOR UPDATE",
                        (p["report_id"], job["org_id"])).fetchone()
        if not row:
            raise RuntimeError("laporan tidak ada")
        cur_rep = row[0]
        target = next((x for x in cur_rep.get("all") or [] if market.lead_key(x) == p["key"]), None)
        if target is None:
            raise RuntimeError("bisnis tidak ditemukan di laporan")
        target.update(fresh)
        market.rebuild_sections(cur_rep)  # prospects, leaders, digital, dst. ikut diperbarui
        target = next((x for x in cur_rep.get("all") or [] if market.lead_key(x) == p["key"]), target)
        sql, params = "UPDATE reports SET report=%s", [json.dumps(cur_rep, ensure_ascii=False)]
        if SCHEMA["summary"]:
            sql += ", summary=%s"
            params.append(json.dumps(cur_rep.get("summary") or {}, ensure_ascii=False))
        c.execute(sql + " WHERE id=%s", (*params, p["report_id"]))
        return target

    return "done", Deferred(write), None


def do_ig_profile(conn, job):
    """Scrape satu akun IG lewat ig_scraper.py, lalu salin profilnya ke Postgres (cache bersama)."""
    import datastore
    u = str(job["params"].get("username", "")).lower()
    if not re.fullmatch(r"[A-Za-z0-9._]{1,30}", u):
        return "failed", None, "username tidak valid"
    args = ["--mode", "direct", "--targets", u, "--out", "hasil"]
    if job["params"].get("force"):
        args += ["--refresh-hours", "0"]
    out, code, cancelled = run_cmd(conn, job["id"], "ig_scraper.py", args)
    if cancelled:
        return _cancelled(cancelled)
    db = os.path.join(os.environ.get("RAQIO_DATA_DIR", HERE), "ig.db")
    sconn = datastore.connect_sqlite(db)
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


def do_chat(conn, job):
    """Jawab satu pesan chat lewat agent (OpenRouter + tools). run_agent jalan di thread karena koneksi psycopg
    tidak boleh dipakai dua thread: tool memakai koneksi sendiri (connect), log/langkah masuk queue dan dialirkan
    loop ini ke append_log. Pembatalan lewat flag yang dicek agent di tiap langkah (ChatStopped); request LLM yang
    sedang berjalan paling lama LLM_TIMEOUT detik, subprocess tool dihentikan segera."""
    import queue

    import agent
    p = job["params"] or {}
    sid, message = str(p.get("sid") or "").strip(), str(p.get("message") or "").strip()
    if not sid or not message:
        job["permanent"] = True
        return "failed", None, "parameter chat tidak valid (sid/message kosong)"
    if not agent.api_key():
        job["permanent"] = True
        return "failed", None, "OPENROUTER_API_KEY belum diisi"
    row = conn.execute("SELECT history FROM chat_sessions WHERE id=%s AND org_id=%s", (sid, job["org_id"])).fetchone()
    if not row:
        job["permanent"] = True
        return "failed", None, "sesi chat tidak ada"
    history = row[0] if isinstance(row[0], list) else (json.loads(row[0]) if row[0] else [])
    q = queue.Queue()
    stop = threading.Event()
    ctx = agent.Context(org_id=job["org_id"], job_id=job["id"], db=connect, limits=p.get("limits") or {},
                        app_url=p.get("app_url") or APP_URL, log=q.put, should_stop=stop.is_set,
                        role=p.get("role") or "", org_name=p.get("org_name") or "", plan=p.get("plan") or "",
                        verified=p.get("verified"), page_context=p.get("context") or {})
    box = {}

    def target():
        try:
            box["answer"], box["history"] = agent.run_agent(message, history, ctx=ctx)
        except agent.ChatStopped:
            box["stopped"] = True
        except Exception as e:  # noqa: BLE001
            box["error"] = e

    buf = []

    def flush():
        while True:
            try:
                buf.append(q.get_nowait())
            except queue.Empty:
                break
        if buf:
            append_log(conn, job["id"], "".join(str(l).rstrip("\n") + "\n" for l in buf))
            buf.clear()
            return True
        return False

    t = threading.Thread(target=target, daemon=True, name=f"chat-{job['id']}")
    t.start()
    t0 = time.time()
    last_beat = last_cancel = last_flush = t0
    outcome = None
    try:
        while t.is_alive():
            t.join(0.5)
            now = time.time()
            if now - last_flush > LOG_FLUSH_SEC:
                last_flush = now
                if flush():
                    last_beat = now  # append_log sekaligus heartbeat
            if now - last_beat > HEARTBEAT_SEC:
                heartbeat(conn, job["id"])
                last_beat = now
            if now - last_cancel > CANCEL_CHECK_SEC:
                last_cancel = now
                if cancel_requested(conn, job["id"]):
                    outcome = "cancel"
                    break
            if now - t0 > CHAT_TIMEOUT:
                outcome = "timeout"
                break
            if STOP:
                outcome = "stop"
                break
    except BaseException:
        stop.set()  # job diambil alih / DB putus: agent berhenti di langkah berikutnya, tidak lanjut di latar
        raise
    if outcome:
        stop.set()
        t.join(2)  # agent berhenti di langkah berikutnya; subprocess tool dihentikan segera (lihat agent.run_script)
    flush()
    if outcome == "stop":
        return _cancelled("stop")
    if outcome == "timeout":
        append_log(conn, job["id"], f"[melebihi batas waktu {_durasi(CHAT_TIMEOUT)}]\n")
        return "failed", None, f"melebihi batas waktu {_durasi(CHAT_TIMEOUT)}"  # transien
    if outcome == "cancel" or box.get("stopped"):
        append_log(conn, job["id"], "[dibatalkan]\n")
        return "cancelled", None, "Dihentikan."
    if "error" in box:
        e = box["error"]
        return "failed", None, f"{type(e).__name__}: {e}"[:300]
    answer, new_history = box["answer"], agent.trim_history(box["history"])
    result = {"answer": answer, "model": ctx.model, "report_ids": list(ctx.report_ids)}
    org = job["org_id"]

    def write(c):
        c.execute("INSERT INTO chat_messages (session_id, org_id, role, content, job_id) VALUES (%s,%s,'assistant',%s,%s)",
                  (sid, org, answer, job["id"]))
        cur = c.execute("UPDATE chat_sessions SET history=%s::jsonb, last_message_at=now() WHERE id=%s AND org_id=%s",
                        (json.dumps(new_history, ensure_ascii=False), sid, org))
        if _rows(cur) == 0:
            raise RuntimeError("sesi chat tidak ada")
        return result

    return "done", Deferred(write), None


def do_campaign_send(conn, job):
    """Kampanye mode otomatis: kirim email (SMTP) atau WhatsApp (gateway org) ke penerima pending dengan jeda.
    Progres per penerima masuk job log; cancel_requested menjeda kampanye (status paused)."""
    import outreach
    p = job["params"] or {}
    if not p.get("campaign_id"):
        job["permanent"] = True
        return "failed", None, "campaign_id kosong"
    row = conn.execute("SELECT status, mode FROM campaigns WHERE id=%s AND org_id=%s", (int(p["campaign_id"]), job["org_id"])).fetchone()
    if not row:
        job["permanent"] = True
        return "failed", None, "kampanye tidak ada"
    if row[1] != "auto":
        job["permanent"] = True
        return "failed", None, "kampanye bukan mode otomatis"
    return outreach.run_campaign(conn, job, p, heartbeat=lambda: heartbeat(conn, job["id"]),
                                 should_stop=lambda: cancel_requested(conn, job["id"]) or STOP,
                                 log=lambda t: append_log(conn, job["id"], t + "\n"))


HANDLERS = {"market_run": do_market_run, "market_compare": do_market_compare, "market_detail": do_market_detail,
            "ig_profile": do_ig_profile, "chat": do_chat, "campaign_send": do_campaign_send}


def handle(conn, job):
    jid = job["id"]
    log(f"job {jid} {job['kind']} mulai")
    fn = HANDLERS.get(job["kind"])
    if not fn:
        status, result, err = "failed", None, f"jenis job tidak dikenal: {job['kind']}"
    else:
        try:
            status, result, err = fn(conn, job)
        except JobTakenOver as e:
            log(f"job {jid} diambil alih worker lain, laporan tidak ditulis ({e})")
            _LOG_SEQ.pop(jid, None)
            return
        except Exception as e:  # noqa: BLE001
            status, result, err = "failed", None, f"{type(e).__name__}: {e}"[:500]
            log(f"job {jid} exception: {err}")
    # tulis laporan + finish dalam satu transaksi; 0 baris di finish = diambil alih -> rollback semuanya
    for _ in range(2):
        try:
            with conn.transaction():
                if isinstance(result, Deferred):
                    result = result.fn(conn)
                if not finish(conn, jid, status, result, err, job=job):
                    raise JobTakenOver(f"finish job {jid} 0 baris")
            break
        except JobTakenOver as e:
            log(f"job {jid} diambil alih worker lain, laporan tidak ditulis ({e})")
            _LOG_SEQ.pop(jid, None)
            return
        except Exception as e:  # noqa: BLE001  (Deferred gagal, mis. laporan sudah dihapus) -> catat sebagai failed
            status, result, err = "failed", None, f"{type(e).__name__}: {e}"[:500]
            log(f"job {jid} gagal menulis hasil: {err}")
    _LOG_SEQ.pop(jid, None)
    log(f"job {jid} {status}" + (f": {err}" if err else ""))


def purge_sqlite_cache():
    try:
        import market
        a, b = market.purge_cache()
        log(f"retensi cache SQLite: {a} tempat dan {b} laporan lebih tua dari {market.CACHE_RETENTION_DAYS} hari dihapus")
    except Exception as e:  # noqa: BLE001
        log(f"retensi cache SQLite gagal: {e}")


def main():
    def stop(*_):
        global STOP
        STOP = True
        log("sinyal berhenti diterima; job yang sedang jalan akan diantrekan ulang")

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    log("worker siap, DSN=" + DSN.split("@")[-1] + f", id={WORKER_ID}")
    conn = None
    last_purge = 0
    while not STOP:
        try:
            if conn is None or conn.closed:
                conn = connect()
                detect_schema(conn)
                log(f"skema: {SCHEMA}")
            if time.time() - last_purge > CACHE_PURGE_EVERY:
                purge_sqlite_cache()
                last_purge = time.time()
            job = claim(conn)
            if not job:
                time.sleep(POLL_SEC)
                continue
            handle(conn, job)
        except psycopg.OperationalError as e:
            log(f"db putus: {e}; coba lagi 5 detik")
            conn = None
            time.sleep(5)
        except Exception as e:  # noqa: BLE001
            log(f"error tak terduga: {type(e).__name__}: {e}; lanjut 5 detik lagi")
            time.sleep(5)
    log("worker berhenti")


if __name__ == "__main__":
    main()
