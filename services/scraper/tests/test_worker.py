"""Tes worker tanpa Postgres: handler dipanggil dengan koneksi palsu."""
import json

import worker


class FakeConn:
    """Mencatat SQL yang dieksekusi; SELECT reports mengembalikan laporan yang disiapkan."""

    def __init__(self, report=None):
        self.calls = []
        self.report = report
        self.closed = False

    def execute(self, sql, params=None):
        self.calls.append((sql.strip().split()[0].upper(), params))
        conn = self

        class Cur:
            def fetchone(self_inner):
                if "FROM reports" in sql:
                    return (conn.report,) if conn.report else None
                if "cancel_requested" in sql:
                    return (False,)
                if "RETURNING id" in sql:
                    return (77,)
                return None

        return Cur()


def test_last_error_line_skips_summary():
    out = "a\n[1/5] cari\nTidak ada hasil dari Google Maps.\n\n[selesai, exit code 1]\n"
    assert worker.last_error_line(out) == "Tidak ada hasil dari Google Maps."


def test_insert_report_uses_org_and_job():
    conn = FakeConn()
    rep = {"industry": "kopi", "area": "kemang", "created": "2026-01-01T00:00:00+00:00", "all": []}
    rid = worker.insert_report(conn, "org-1", 5, rep)
    assert rid == 77
    kind, params = conn.calls[-1]
    assert kind == "INSERT" and params[0] == "org-1" and params[1] == 5
    assert json.loads(params[5])["industry"] == "kopi"


def test_detail_fails_when_business_missing():
    conn = FakeConn(report={"all": [{"place_id": "x", "maps_url": "m"}]})
    status, result, err = worker.do_market_detail(conn, {"id": 1, "org_id": "o", "params": {"report_id": 1, "key": "tidak-ada"}})
    assert status == "failed" and "bisnis" in err


def test_unknown_kind_marked_failed():
    conn = FakeConn()
    worker.handle(conn, {"id": 9, "org_id": "o", "kind": "apa_ini", "params": {}})
    kind, params = conn.calls[-1]
    assert kind == "UPDATE" and params[0] == "failed" and "tidak dikenal" in params[2]


def test_failed_job_requeued_with_backoff():
    conn = FakeConn()
    job = {"id": 3, "org_id": "o", "kind": "apa_ini", "params": {}, "attempts": 1, "max_attempts": 3}
    worker.finish(conn, 3, "failed", error="timeout", job=job)
    sql, params = conn.calls[-1]
    assert sql == "UPDATE" and params[0] == "timeout" and params[1] == 60


def test_failed_job_final_after_max_attempts():
    conn = FakeConn()
    job = {"id": 3, "org_id": "o", "kind": "apa_ini", "params": {}, "attempts": 3, "max_attempts": 3}
    worker.finish(conn, 3, "failed", error="timeout", job=job)
    sql, params = conn.calls[-1]
    assert sql == "UPDATE" and params[0] == "failed"


def test_retry_delay_capped():
    assert worker.retry_delay(1) == 60 and worker.retry_delay(2) == 120 and worker.retry_delay(10) == 900
