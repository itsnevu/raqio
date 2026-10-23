"""Tes integrasi worker terhadap Postgres sungguhan (database raqio_test_py dibuat ulang tiap run).
Dilewati kalau Postgres tidak bisa dihubungi. Atur dengan TEST_DATABASE_URL (default port 5433 lokal).
Kolom/tabel migrasi 007 (jobs.locked_by, job_logs, reports.summary) ditambahkan sendiri kalau migrasinya belum ada,
supaya kontrak fencing bisa diuji sekarang."""
import glob
import json
import os
import uuid

import pytest

psycopg = pytest.importorskip("psycopg")
import worker  # noqa: E402

BASE = os.environ.get("TEST_DATABASE_URL", "postgres://raqio:raqio@127.0.0.1:5433/raqio")
HERE = os.path.dirname(os.path.abspath(__file__))
MIGRATIONS = os.path.join(HERE, "..", "..", "..", "apps", "api", "migrations")
# no-op kalau 007_indexes_constraints.sql sudah ada di repo; dipertahankan supaya tes tetap jalan di checkout lama
CONTRACT_007 = """
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS summary JSONB;
CREATE TABLE IF NOT EXISTS job_logs (
    id     BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    seq    INT NOT NULL,
    line   TEXT NOT NULL,
    at     TIMESTAMPTZ NOT NULL DEFAULT now());
"""


@pytest.fixture(scope="module")
def dsn():
    try:
        admin = psycopg.connect(BASE, autocommit=True, connect_timeout=2)
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"postgres tidak tersedia: {e}")
    admin.execute("DROP DATABASE IF EXISTS raqio_test_py WITH (FORCE)")
    admin.execute("CREATE DATABASE raqio_test_py")
    admin.close()
    url = BASE.rsplit("/", 1)[0] + "/raqio_test_py"
    conn = psycopg.connect(url, autocommit=True)
    for f in sorted(glob.glob(os.path.join(MIGRATIONS, "*.sql"))):
        conn.execute(open(f, encoding="utf-8").read())
    conn.execute(CONTRACT_007)
    conn.close()
    return url


@pytest.fixture
def conn(dsn, monkeypatch):
    c = psycopg.connect(dsn, autocommit=True)
    monkeypatch.setattr(worker, "SCHEMA", dict(worker.SCHEMA))  # detect_schema mengubah dict; tes FakeConn butuh nilai awal
    worker.detect_schema(c)
    assert worker.SCHEMA == {"locked_by": True, "job_logs": True, "summary": True}
    c.execute("DELETE FROM job_logs; DELETE FROM jobs; DELETE FROM reports; DELETE FROM orgs")
    worker._LOG_SEQ.clear()
    yield c
    c.close()


def org(conn):
    oid = conn.execute("INSERT INTO orgs (name) VALUES ('T') RETURNING id").fetchone()[0]
    return str(oid)


def enqueue(conn, oid, kind="market_run", params=None, priority=0, **cols):
    extra = "".join(f", {k}" for k in cols)
    vals = "".join(", %s" for _ in cols)
    return conn.execute(
        f"INSERT INTO jobs (org_id, kind, params, priority{extra}) VALUES (%s,%s,%s,%s{vals}) RETURNING id",
        (oid, kind, psycopg.types.json.Jsonb(params or {}), priority, *cols.values())).fetchone()[0]


def status(conn, jid):
    return conn.execute("SELECT status, attempts, error FROM jobs WHERE id=%s", (jid,)).fetchone()


def job_row(conn, jid):
    return conn.execute("SELECT status, attempts, error, locked_by, started_at, log, run_after <= now() FROM jobs WHERE id=%s",
                        (jid,)).fetchone()


def write_out(args, data):
    with open(args[args.index("--out") + 1], "w", encoding="utf-8") as f:
        json.dump(data, f)


def rep(area="kemang", industry="kopi"):
    return {"industry": industry, "area": area, "created": "2026-01-01T00:00:00+00:00", "all": [{"place_id": "p"}],
            "summary": {"businesses": 1, "avg_rating": 4.5, "median_reviews": 10, "total_reviews": 10, "top3_share": 100},
            "digital": {"website": 0, "whatsapp": 0}}


def test_detect_schema_tanpa_kolom_fallback(dsn):
    c = psycopg.connect(dsn, autocommit=True)
    try:
        c.execute("CREATE SCHEMA IF NOT EXISTS kosong; CREATE TABLE IF NOT EXISTS kosong.jobs (id int)")
        c.execute("SET search_path TO kosong")
        assert worker.detect_schema(c) == {"locked_by": False, "job_logs": False, "summary": False}
    finally:
        c.execute("SET search_path TO public; DROP SCHEMA kosong CASCADE")
        c.close()


def test_claim_prioritas_dan_run_after(conn):
    # migrasi 007: hanya satu job pasar aktif per org, jadi tiap job memakai org sendiri
    late = enqueue(conn, org(conn), priority=0, run_after="2999-01-01")  # belum waktunya
    low = enqueue(conn, org(conn), priority=10)
    high = enqueue(conn, org(conn), priority=-5)
    j = worker.claim(conn)
    assert j["id"] == high and j["attempts"] == 1 and j["max_attempts"] == 3
    assert job_row(conn, high)[3] == worker.WORKER_ID  # locked_by diisi saat claim
    assert worker.claim(conn)["id"] == low
    assert worker.claim(conn) is None  # yang run_after di masa depan tidak diambil
    assert status(conn, late)[0] == "queued"


def test_dua_worker_tidak_mengambil_job_yang_sama(dsn, conn):
    oid = org(conn)
    jid = enqueue(conn, oid)
    other = psycopg.connect(dsn, autocommit=True)
    try:
        a = worker.claim(conn)
        b = worker.claim(other)
        assert a["id"] == jid and b is None
    finally:
        other.close()


def test_gagal_diantrekan_ulang_dengan_backoff_lalu_final(conn):
    oid = org(conn)
    jid = enqueue(conn, oid, max_attempts=2)
    job = worker.claim(conn)
    assert worker.finish(conn, jid, "failed", error="timeout", job=job)
    st, attempts, err, locked, started, log, due = job_row(conn, jid)
    assert st == "queued" and attempts == 1 and err == "timeout"
    assert locked is None and started is None and not due  # locked_by dan started_at direset, backoff 60 detik
    assert "coba lagi dalam 1 menit" in log
    assert worker.claim(conn) is None
    conn.execute("UPDATE jobs SET run_after=now() WHERE id=%s", (jid,))
    job = worker.claim(conn)
    assert job["attempts"] == 2
    worker.finish(conn, jid, "failed", error="timeout lagi", job=job)
    assert status(conn, jid)[0] == "failed"


def test_error_permanen_langsung_final(conn):
    oid = org(conn)
    jid = enqueue(conn, oid, max_attempts=3)
    job = worker.claim(conn)
    worker.finish(conn, jid, "failed", error="Tidak ada hasil dari Google Maps.", job=job)
    assert status(conn, jid) == ("failed", 1, "Tidak ada hasil dari Google Maps.")


def test_cancel_tidak_diantrekan_ulang(conn):
    oid = org(conn)
    jid = enqueue(conn, oid)
    job = worker.claim(conn)
    conn.execute("UPDATE jobs SET cancel_requested=true WHERE id=%s", (jid,))
    assert worker.cancel_requested(conn, jid)
    worker.finish(conn, jid, "failed", error="x", job=job)
    assert status(conn, jid)[0] == "failed"


def test_stop_mengantrekan_ulang_job(conn, monkeypatch):
    oid = org(conn)
    jid = enqueue(conn, oid, params={"industry": "kopi", "area": "kemang"})
    job = worker.claim(conn)
    assert job["attempts"] == 1
    monkeypatch.setattr(worker, "run_market_cmd", lambda c, j, args: ("[1/5] cari\n", None, "stop"))
    worker.handle(conn, job)
    st, attempts, err, locked, started, log, due = job_row(conn, jid)
    assert st == "queued" and attempts == 0 and locked is None and started is None and due
    assert "[worker berhenti, job diantrekan ulang]" in log
    assert conn.execute("SELECT count(*) FROM reports").fetchone()[0] == 0
    lines = [r[0] for r in conn.execute("SELECT line FROM job_logs WHERE job_id=%s ORDER BY seq", (jid,))]
    assert lines[-1] == "[worker berhenti, job diantrekan ulang]"
    assert worker.claim(conn)["id"] == jid  # langsung bisa diambil lagi


def test_market_run_menulis_laporan_ke_org(conn, monkeypatch):
    oid = org(conn)
    jid = enqueue(conn, oid, params={"industry": "kopi", "area": "kemang"})
    job = worker.claim(conn)

    def fake_run(c, j, args):
        write_out(args, {"mode": "run", "report_id": 42, "report": rep()})
        return "[1/5] cari\n[5/5] Selesai dalam 3 detik. REPORT_ID=42\n", 0, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_run)
    worker.handle(conn, job)
    st, _, _ = status(conn, jid)
    assert st == "done"
    row = conn.execute("SELECT org_id::text, job_id, industry, report->'all'->0->>'place_id', summary->>'businesses', "
                       "created_at > now() - interval '1 minute' FROM reports").fetchone()
    assert row == (oid, jid, "kopi", "p", "1", True)
    res = conn.execute("SELECT result FROM jobs WHERE id=%s", (jid,)).fetchone()[0]
    assert res["report_id"] == conn.execute("SELECT id FROM reports").fetchone()[0]


def test_market_run_tanpa_report_id_gagal_dengan_pesan_terakhir(conn, monkeypatch):
    oid = org(conn)
    jid = enqueue(conn, oid, params={"industry": "x", "area": "y"}, max_attempts=3)
    job = worker.claim(conn)
    monkeypatch.setattr(worker, "run_market_cmd", lambda c, j, args: ("a\nTidak ada hasil dari Google Maps.\n", 2, False))
    worker.handle(conn, job)
    st, attempts, err = status(conn, jid)
    assert st == "failed" and err == "Tidak ada hasil dari Google Maps." and attempts == 1  # permanen, tanpa retry


def test_fencing_finish_dengan_locked_by_beda_tidak_menulis(conn, monkeypatch):
    oid = org(conn)
    jid = enqueue(conn, oid, params={"industry": "kopi", "area": "kemang"})
    job = worker.claim(conn)
    conn.execute("UPDATE jobs SET locked_by='worker-lain' WHERE id=%s", (jid,))  # API menganggap kita mati
    assert worker.finish(conn, jid, "done", {"report_id": 1}) is False
    assert job_row(conn, jid)[0] == "running"

    def fake_run(c, j, args):
        write_out(args, {"mode": "run", "report_id": 42, "report": rep()})
        return "REPORT_ID=42\n", 0, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_run)
    worker.handle(conn, job)  # append_log di run_cmd sudah 0 baris -> JobTakenOver sebelum subprocess
    assert conn.execute("SELECT count(*) FROM reports").fetchone()[0] == 0
    assert job_row(conn, jid)[0] == "running" and job_row(conn, jid)[3] == "worker-lain"


def test_fencing_insert_dan_finish_satu_transaksi(conn, monkeypatch):
    oid = org(conn)
    jid = enqueue(conn, oid)
    job = worker.claim(conn)
    # Deferred jalan di dalam transaksi; locked_by berubah tepat sebelum finish -> insert ikut di-rollback
    def write(c):
        rid = worker.insert_report(c, oid, jid, rep())
        c.execute("UPDATE jobs SET locked_by='worker-lain' WHERE id=%s", (jid,))
        return {"report_id": rid}
    monkeypatch.setitem(worker.HANDLERS, "market_run", lambda c, j: ("done", worker.Deferred(write), None))
    worker.handle(conn, job)
    assert conn.execute("SELECT count(*) FROM reports").fetchone()[0] == 0
    assert job_row(conn, jid)[0] == "running"


def test_compare_n_laporan_satu_transaksi_dan_wilayah_gagal(conn, monkeypatch):
    oid = org(conn)
    jid = enqueue(conn, oid, kind="market_compare", params={"industry": "kopi", "areas": ["A", "B", "C"]})
    job = worker.claim(conn)

    def fake_run(c, j, args, timeout=None):
        write_out(args, {"mode": "compare", "areas": [
            {"area": "A", "ok": True, "report_id": 1, "report": rep("A")},
            {"area": "B", "ok": False, "error": "TimeoutError: browser", "permanent": False},
            {"area": "C", "ok": True, "report_id": 2, "report": rep("C")}]})
        return "COMPARE_DONE\n", 0, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_run)
    worker.handle(conn, job)
    assert status(conn, jid)[0] == "done"
    ids = {a: i for a, i in conn.execute("SELECT area, id FROM reports WHERE job_id=%s", (jid,))}
    assert set(ids) == {"A", "C"}
    res = conn.execute("SELECT result FROM jobs WHERE id=%s", (jid,)).fetchone()[0]
    assert {a["area"]: a["report_id"] for a in res["areas"]} == ids
    assert res["failed"] == [{"area": "B", "error": "TimeoutError: browser"}]


def test_heartbeat_ikut_naik_saat_log_ditambah(conn):
    oid = org(conn)
    jid = enqueue(conn, oid)
    worker.claim(conn)
    conn.execute("UPDATE jobs SET heartbeat_at = now() - interval '1 hour' WHERE id=%s", (jid,))
    worker.append_log(conn, jid, "baris 1\nbaris 2\n")
    age = conn.execute("SELECT extract(epoch FROM now() - heartbeat_at) FROM jobs WHERE id=%s", (jid,)).fetchone()[0]
    assert age < 5
    worker.append_log(conn, jid, "baris 3\n")
    rows = conn.execute("SELECT seq, line FROM job_logs WHERE job_id=%s ORDER BY seq", (jid,)).fetchall()
    assert rows == [(1, "baris 1"), (2, "baris 2"), (3, "baris 3")]
    assert conn.execute("SELECT log FROM jobs WHERE id=%s", (jid,)).fetchone()[0] == "baris 1\nbaris 2\nbaris 3\n"


def test_jobs_log_dipotong_64kb(conn):
    oid = org(conn)
    jid = enqueue(conn, oid)
    worker.claim(conn)
    worker.append_log(conn, jid, "x" * 70000 + "\nakhir\n")
    log = conn.execute("SELECT log FROM jobs WHERE id=%s", (jid,)).fetchone()[0]
    assert len(log) == 64 * 1024 and log.endswith("akhir\n")


def test_detail_for_update_dan_prospek_disusun_ulang(conn, monkeypatch):
    import market
    oid = org(conn)
    biz = {"place_id": "p1", "name": "Kopi Kecil", "rating": 4.7, "reviews": 120, "maps_url": "https://maps.google.com/?cid=1"}
    report = market.score_all(market.build_report("kopi", "kemang", [dict(biz)]))
    assert report["prospects"] == []  # belum detail, belum jadi prospek
    rid = conn.execute("INSERT INTO reports (org_id, industry, area, report) VALUES (%s,'kopi','kemang',%s) RETURNING id",
                       (oid, json.dumps(report))).fetchone()[0]
    jid = enqueue(conn, oid, kind="market_detail", params={"report_id": rid, "key": "p1"})
    job = worker.claim(conn)

    def fake_run(c, j, args, timeout=None):  # market.py --detail sebagai subprocess, hasilnya lewat file --out
        assert args[:5] == ["--detail", "--report", str(rid), "--key", "p1"] and timeout == worker.DETAIL_TIMEOUT
        write_out(args, {"mode": "detail", "report_id": rid, "key": "p1", "business": {
            "place_id": "p1", "phone": "6281318911529", "whatsapp": "https://wa.me/6281318911529", "_detailed": True}})
        return "DETAIL_DONE Kopi Kecil\n", 0, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_run)
    worker.handle(conn, job)
    st, _, err = status(conn, jid)
    assert st == "done", err
    got = conn.execute("SELECT report, summary FROM reports WHERE id=%s", (rid,)).fetchone()
    upd = got[0]
    assert upd["all"][0]["phone"] == "6281318911529" and upd["all"][0]["whatsapp"].startswith("https://wa.me/")
    assert [p["name"] for p in upd["prospects"]] == ["Kopi Kecil"]  # prospects ikut diperbarui
    assert upd["leaders"][0]["phone"] == "6281318911529" and upd["digital"]["whatsapp"] == 100
    assert got[1]["businesses"] == 1
    res = conn.execute("SELECT result FROM jobs WHERE id=%s", (jid,)).fetchone()[0]
    assert res["lead_score"] >= 80


def test_detail_laporan_org_lain_gagal_permanen(conn):
    oid, lain = org(conn), org(conn)
    rid = conn.execute("INSERT INTO reports (org_id, industry, area, report) VALUES (%s,'kopi','kemang','{}') RETURNING id",
                       (lain,)).fetchone()[0]
    jid = enqueue(conn, oid, kind="market_detail", params={"report_id": rid, "key": "p1"})
    worker.handle(conn, worker.claim(conn))
    assert status(conn, jid) == ("failed", 1, "laporan tidak ada")


def test_uuid_org_valid():
    uuid.UUID(org(psycopg.connect(BASE.rsplit("/", 1)[0] + "/raqio_test_py", autocommit=True)))
