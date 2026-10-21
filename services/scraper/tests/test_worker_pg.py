"""Tes integrasi worker terhadap Postgres sungguhan (database raqio_test_py dibuat ulang tiap run).
Dilewati kalau Postgres tidak bisa dihubungi. Atur dengan TEST_DATABASE_URL (default port 5433 lokal)."""
import glob
import os
import uuid

import pytest

psycopg = pytest.importorskip("psycopg")
import worker  # noqa: E402

BASE = os.environ.get("TEST_DATABASE_URL", "postgres://raqio:raqio@127.0.0.1:5433/raqio")
HERE = os.path.dirname(os.path.abspath(__file__))
MIGRATIONS = os.path.join(HERE, "..", "..", "..", "apps", "api", "migrations")


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
    conn.close()
    return url


@pytest.fixture
def conn(dsn):
    c = psycopg.connect(dsn, autocommit=True)
    c.execute("DELETE FROM jobs; DELETE FROM reports; DELETE FROM orgs")
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


def test_claim_prioritas_dan_run_after(conn):
    oid = org(conn)
    late = enqueue(conn, oid, priority=0, run_after="2999-01-01")  # belum waktunya
    low = enqueue(conn, oid, priority=10)
    high = enqueue(conn, oid, priority=-5)
    j = worker.claim(conn)
    assert j["id"] == high and j["attempts"] == 1 and j["max_attempts"] == 3
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
    worker.finish(conn, jid, "failed", error="timeout", job=job)
    st, attempts, err = status(conn, jid)
    assert st == "queued" and attempts == 1 and err == "timeout"
    assert worker.claim(conn) is None  # run_after masih di masa depan (backoff 60 detik)
    conn.execute("UPDATE jobs SET run_after=now() WHERE id=%s", (jid,))
    job = worker.claim(conn)
    assert job["attempts"] == 2
    worker.finish(conn, jid, "failed", error="timeout lagi", job=job)
    assert status(conn, jid)[0] == "failed"


def test_cancel_tidak_diantrekan_ulang(conn):
    oid = org(conn)
    jid = enqueue(conn, oid)
    job = worker.claim(conn)
    conn.execute("UPDATE jobs SET cancel_requested=true WHERE id=%s", (jid,))
    assert worker.cancel_requested(conn, jid)
    worker.finish(conn, jid, "failed", error="x", job=job)
    assert status(conn, jid)[0] == "failed"


def test_market_run_menulis_laporan_ke_org(conn, monkeypatch):
    oid = org(conn)
    jid = enqueue(conn, oid, params={"industry": "kopi", "area": "kemang"})
    job = worker.claim(conn)
    fake_out = "[1/5] cari\n[5/5] Selesai dalam 3 detik. REPORT_ID=42\n"
    monkeypatch.setattr(worker, "run_market_cmd", lambda c, j, args: (fake_out, 0, False))
    monkeypatch.setattr(worker, "sqlite_report", lambda rid: {"industry": "kopi", "area": "kemang",
                                                               "created": "2026-01-01T00:00:00+00:00", "all": [{"place_id": "p"}]})
    worker.handle(conn, job)
    st, _, _ = status(conn, jid)
    assert st == "done"
    row = conn.execute("SELECT org_id::text, job_id, industry, report->'all'->0->>'place_id' FROM reports").fetchone()
    assert row == (oid, jid, "kopi", "p")
    res = conn.execute("SELECT result FROM jobs WHERE id=%s", (jid,)).fetchone()[0]
    assert res["report_id"] == conn.execute("SELECT id FROM reports").fetchone()[0]


def test_market_run_tanpa_report_id_gagal_dengan_pesan_terakhir(conn, monkeypatch):
    oid = org(conn)
    jid = enqueue(conn, oid, params={"industry": "x", "area": "y"}, max_attempts=1)
    job = worker.claim(conn)
    monkeypatch.setattr(worker, "run_market_cmd", lambda c, j, args: ("a\nTidak ada hasil dari Google Maps.\n", 1, False))
    worker.handle(conn, job)
    st, _, err = status(conn, jid)
    assert st == "failed" and err == "Tidak ada hasil dari Google Maps."


def test_heartbeat_ikut_naik_saat_log_ditambah(conn):
    oid = org(conn)
    jid = enqueue(conn, oid)
    worker.claim(conn)
    conn.execute("UPDATE jobs SET heartbeat_at = now() - interval '1 hour' WHERE id=%s", (jid,))
    worker.append_log(conn, jid, "baris\n")
    age = conn.execute("SELECT extract(epoch FROM now() - heartbeat_at) FROM jobs WHERE id=%s", (jid,)).fetchone()[0]
    assert age < 5


def test_uuid_org_valid():
    uuid.UUID(org(psycopg.connect(BASE.rsplit("/", 1)[0] + "/raqio_test_py", autocommit=True)))
