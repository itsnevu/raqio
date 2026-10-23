"""Tes worker tanpa Postgres: handler dipanggil dengan koneksi palsu."""
import contextlib
import json
import os
import threading
import time

import worker


class FakeConn:
    """Mencatat SQL yang dieksekusi; SELECT reports mengembalikan laporan yang disiapkan.
    rowcount bisa diatur untuk meniru UPDATE bersyarat locked_by yang mengenai 0 baris."""

    def __init__(self, report=None, rowcount=-1):
        self.calls = []
        self.sqls = []
        self.report = report
        self.rowcount = rowcount
        self.closed = False
        self.tx = 0

    @contextlib.contextmanager
    def transaction(self):
        self.tx += 1
        yield

    def execute(self, sql, params=None):
        self.calls.append((sql.strip().split()[0].upper(), params))
        self.sqls.append(sql)
        conn = self

        class Cur:
            rowcount = conn.rowcount

            def fetchone(self_inner):
                if "FROM reports" in sql:
                    return (conn.report,) if conn.report else None
                if "cancel_requested" in sql:
                    return (False,)
                if "RETURNING id" in sql:
                    return (77,)
                return None

            def fetchall(self_inner):
                return []

        return Cur()


def updates(conn):
    return [(sql, p) for sql, p in conn.calls if sql == "UPDATE"]


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
    assert json.loads(params[4])["industry"] == "kopi"
    assert "created" in json.loads(params[4])  # created_at kolom pakai now() DB, "created" tetap di JSON


def test_insert_report_isi_summary_kalau_kolom_ada(monkeypatch):
    monkeypatch.setitem(worker.SCHEMA, "summary", True)
    conn = FakeConn()
    rep = {"industry": "kopi", "area": "kemang", "summary": {"businesses": 3}, "all": []}
    worker.insert_report(conn, "org-1", 5, rep)
    kind, params = conn.calls[-1]
    assert json.loads(params[5]) == {"businesses": 3}


def test_detail_fails_when_business_missing():
    conn = FakeConn(report={"all": [{"place_id": "x", "maps_url": "m"}]})
    status, result, err = worker.do_market_detail(conn, {"id": 1, "org_id": "o", "params": {"report_id": 1, "key": "tidak-ada"}})
    assert status == "failed" and "bisnis" in err
    assert worker.is_permanent(err)


def test_unknown_kind_marked_failed():
    conn = FakeConn()
    worker.handle(conn, {"id": 9, "org_id": "o", "kind": "apa_ini", "params": {}})
    kind, params = conn.calls[-1]
    assert kind == "UPDATE" and params[0] == "failed" and "tidak dikenal" in params[2]
    assert conn.tx == 1  # finish selalu di dalam transaksi


def test_failed_job_requeued_with_backoff():
    conn = FakeConn()
    job = {"id": 3, "org_id": "o", "kind": "apa_ini", "params": {}, "attempts": 1, "max_attempts": 3}
    assert worker.finish(conn, 3, "failed", error="timeout", job=job)
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


# ---------- klasifikasi error permanen vs transien ----------

def test_error_permanen_tidak_diulang():
    for msg in ("Tidak ada hasil dari Google Maps. Coba kata kunci lain.", "laporan tidak ada",
                "bisnis tidak ditemukan di laporan", "RuntimeError: laporan tidak ada", "username tidak valid"):
        assert worker.is_permanent(msg), msg
    assert worker.is_permanent("apa saja", {"permanent": True})  # exit code 2 dari market.py
    conn = FakeConn()
    job = {"id": 3, "attempts": 1, "max_attempts": 3}
    worker.finish(conn, 3, "failed", error="Tidak ada hasil dari Google Maps.", job=job)
    sql, params = conn.calls[-1]
    assert params[0] == "failed"  # langsung final, bukan queued


def test_error_transien_diulang():
    for msg in ("melebihi batas waktu 25 menit", "TimeoutError: Page.goto", "curl: (28) Connection timed out",
                "Google Maps tidak merespons dalam 60 detik, coba lagi sebentar lagi"):
        assert not worker.is_permanent(msg), msg
    conn = FakeConn()
    job = {"id": 3, "attempts": 1, "max_attempts": 3}
    worker.finish(conn, 3, "failed", error="melebihi batas waktu 25 menit", job=job)
    sql, params = conn.calls[-1]
    assert params[0] == "melebihi batas waktu 25 menit" and params[1] == 60  # queued + backoff


def test_exit_code_2_dari_subprocess_permanen(tmp_path, monkeypatch):
    def fake_run(conn, jid, args, timeout=None):
        return "argparse: error\n", 2, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_run)
    job = {"id": 1, "org_id": "o", "params": {"industry": "x", "area": "y"}, "attempts": 1, "max_attempts": 3}
    status, _, err = worker.do_market_run(FakeConn(), job)
    assert status == "failed" and job.get("permanent") and worker.is_permanent(err, job)


# ---------- fencing: UPDATE bersyarat locked_by mengenai 0 baris ----------

def test_finish_dengan_locked_by_beda_tidak_menulis(monkeypatch):
    monkeypatch.setitem(worker.SCHEMA, "locked_by", True)
    conn = FakeConn(rowcount=0)
    assert worker.finish(conn, 3, "done", {"report_id": 1}) is False
    _, params = conn.calls[-1]
    assert "locked_by=%s" in conn.sqls[-1] and params[-1] == worker.WORKER_ID


def test_handle_laporan_tidak_ditulis_kalau_diambil_alih(monkeypatch):
    monkeypatch.setitem(worker.SCHEMA, "locked_by", True)
    conn = FakeConn(rowcount=0)
    written = []
    monkeypatch.setitem(worker.HANDLERS, "market_run",
                        lambda c, j: ("done", worker.Deferred(lambda cc: written.append(1) or {"report_id": 1}), None))
    worker.handle(conn, {"id": 5, "org_id": "o", "kind": "market_run", "params": {}})
    # Deferred dijalankan di dalam transaksi, finish 0 baris -> JobTakenOver -> rollback (tidak ada finish kedua)
    assert written == [1]
    assert len(updates(conn)) == 1 and conn.tx == 1


def test_heartbeat_0_baris_melempar_taken_over(monkeypatch):
    monkeypatch.setitem(worker.SCHEMA, "locked_by", True)
    import pytest
    with pytest.raises(worker.JobTakenOver):
        worker.heartbeat(FakeConn(rowcount=0), 1)
    with pytest.raises(worker.JobTakenOver):
        worker.append_log(FakeConn(rowcount=0), 1, "x\n")


# ---------- STOP: job diantrekan ulang ----------

def _script(tmp_path, body):
    f = tmp_path / "s.py"
    f.write_text(body, encoding="utf-8")
    return str(f)


def test_stop_mengantrekan_ulang_subprocess(tmp_path, monkeypatch):
    script = _script(tmp_path, "import time\nprint('mulai', flush=True)\ntime.sleep(30)\n")
    monkeypatch.setattr(worker, "STOP", False)
    threading.Timer(1.0, lambda: setattr(worker, "STOP", True)).start()
    t0 = time.time()
    out, code, cancelled = worker.run_cmd(FakeConn(), 1, script, [])
    assert cancelled == "stop" and time.time() - t0 < 15
    assert worker._cancelled("stop") == ("requeued", None, None)
    conn = FakeConn()
    assert worker.finish(conn, 1, "requeued")
    sql, (_, params) = conn.sqls[-1], conn.calls[-1]
    assert "attempts=greatest(attempts-1, 0)" in sql and "status='queued'" in sql and "run_after=now()" in sql
    assert "[worker berhenti, job diantrekan ulang]" in params[0]


def test_stop_memberi_grace_kalau_hampir_selesai(tmp_path, monkeypatch):
    script = _script(tmp_path, "import time\nprint('REPORT_ID=5', flush=True)\ntime.sleep(3)\nprint('tamat')\n")
    monkeypatch.setattr(worker, "STOP", False)
    threading.Timer(0.5, lambda: setattr(worker, "STOP", True)).start()
    out, code, cancelled = worker.run_cmd(FakeConn(), 1, script, [])
    assert cancelled is False and code == 0 and "tamat" in out


def test_stop_grace_habis_tetap_dihentikan(tmp_path, monkeypatch):
    script = _script(tmp_path, "import time\nprint('REPORT_ID=5', flush=True)\ntime.sleep(60)\n")
    monkeypatch.setattr(worker, "STOP", False)
    monkeypatch.setattr(worker, "STOP_GRACE_SEC", 1)
    threading.Timer(0.5, lambda: setattr(worker, "STOP", True)).start()
    t0 = time.time()
    _, _, cancelled = worker.run_cmd(FakeConn(), 1, script, [])
    assert cancelled == "stop" and time.time() - t0 < 15


# ---------- hasil subprocess lewat file --out ----------

def _write_out(args, data):
    path = args[args.index("--out") + 1]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)


def test_market_run_membaca_file_out(monkeypatch):
    rep = {"industry": "kopi", "area": "kemang", "created": "2026-01-01T00:00:00+00:00", "summary": {}, "all": []}

    def fake_run(conn, jid, args, timeout=None):
        assert "--out" in args
        _write_out(args, {"mode": "run", "report_id": 42, "report": rep})
        return "[5/5] Selesai. REPORT_ID=42\n", 0, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_run)
    conn = FakeConn()
    status, result, err = worker.do_market_run(conn, {"id": 1, "org_id": "o", "params": {"industry": "kopi", "area": "kemang"}})
    assert status == "done" and isinstance(result, worker.Deferred)
    assert result.fn(conn) == {"report_id": 77}


def test_file_out_dihapus_setelah_dibaca(monkeypatch):
    paths = []

    def fake_run(conn, jid, args, timeout=None):
        paths.append(args[args.index("--out") + 1])
        _write_out(args, {"mode": "run", "error": "TimeoutError: browser", "permanent": False})
        return "x\n", 1, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_run)
    job = {"id": 1, "org_id": "o", "params": {"industry": "x", "area": "y"}}
    status, _, err = worker.do_market_run(FakeConn(), job)
    assert status == "failed" and err == "TimeoutError: browser" and not job.get("permanent")
    assert not os.path.exists(paths[0])


def test_market_run_tanpa_file_out_gagal(monkeypatch):
    monkeypatch.setattr(worker, "run_market_cmd", lambda c, j, a, timeout=None: ("a\nTidak ada hasil dari Google Maps.\n", 2, False))
    job = {"id": 1, "org_id": "o", "params": {"industry": "x", "area": "y"}}
    status, _, err = worker.do_market_run(FakeConn(), job)
    assert status == "failed" and err == "Tidak ada hasil dari Google Maps." and job["permanent"]


def test_compare_satu_wilayah_gagal(monkeypatch):
    def mk(area):
        return {"industry": "kopi", "area": area, "created": "2026-01-01T00:00:00+00:00", "all": [],
                "summary": {"businesses": 10, "avg_rating": 4.5, "median_reviews": 10, "total_reviews": 100, "top3_share": 30},
                "digital": {"website": 40, "whatsapp": 50}}

    def fake_run(conn, jid, args, timeout=None):
        _write_out(args, {"mode": "compare", "areas": [
            {"area": "A", "ok": True, "report_id": 1, "report": mk("A")},
            {"area": "B", "ok": False, "error": "Tidak ada hasil dari Google Maps.", "permanent": True},
            {"area": "C", "ok": True, "report_id": 2, "report": mk("C")}]})
        return "COMPARE_DONE\n", 0, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_run)
    conn = FakeConn()
    status, result, err = worker.do_market_compare(conn, {"id": 1, "org_id": "o", "params": {"industry": "kopi", "areas": ["A", "B", "C"]}})
    assert status == "done"
    res = result.fn(conn)
    assert [a["area"] for a in res["areas"]] == ["A", "C"]
    assert all(a["report_id"] == 77 for a in res["areas"])  # id Postgres, bukan id SQLite
    assert res["failed"] == [{"area": "B", "error": "Tidak ada hasil dari Google Maps."}]
    assert any("B" in i and "gagal" in i for i in res["insights"])
    assert sum(1 for k, _ in conn.calls if k == "INSERT") == 2


def test_compare_semua_gagal_permanen(monkeypatch):
    def fake_run(conn, jid, args, timeout=None):
        _write_out(args, {"mode": "compare", "areas": [
            {"area": "A", "ok": False, "error": "Tidak ada hasil dari Google Maps.", "permanent": True}]})
        return "COMPARE_DONE\n", 2, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_run)
    job = {"id": 1, "org_id": "o", "params": {"industry": "kopi", "areas": ["A"]}}
    status, _, err = worker.do_market_compare(FakeConn(), job)
    assert status == "failed" and "A: Tidak ada hasil" in err and job["permanent"]


def test_batas_wilayah_compare_dari_env(monkeypatch):
    seen = {}

    def fake_run(conn, jid, args, timeout=None):
        seen["areas"] = args[args.index("--areas") + 1].split(";")
        return "", 1, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_run)
    monkeypatch.setattr(worker, "MAX_COMPARE_AREAS", 8)
    worker.do_market_compare(FakeConn(), {"id": 1, "org_id": "o", "params": {"industry": "k", "areas": [str(i) for i in range(12)]}})
    assert len(seen["areas"]) == 8
    import market
    assert market.MAX_COMPARE_AREAS == worker.MAX_COMPARE_AREAS


def test_detail_timeout_dan_cancel(monkeypatch):
    monkeypatch.setattr(worker, "CANCEL_CHECK_SEC", 0)
    state, _ = worker.run_with_timeout(FakeConn(), 1, lambda: time.sleep(5), timeout=1)
    assert state == "timeout"

    class CancelConn(FakeConn):
        def execute(self, sql, params=None):
            cur = super().execute(sql, params)
            if "cancel_requested" in sql:
                cur.fetchone = lambda: (True,)
            return cur
    state, _ = worker.run_with_timeout(CancelConn(), 1, lambda: time.sleep(5), timeout=10)
    assert state == "cancel"

    def boom():
        raise RuntimeError("x")
    state, box = worker.run_with_timeout(FakeConn(), 1, boom, timeout=5)
    assert state == "error" and isinstance(box["error"], RuntimeError)

