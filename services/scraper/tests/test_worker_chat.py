"""Job chat dan cek kontak lewat subprocess, tanpa Postgres: agent/LLM dipalsukan, koneksi palsu (FakeConn)."""
import json
import os
import time

import agent
import worker
from tests.test_worker import FakeConn, _script, _write_out


# ---------- cek kontak lewat subprocess market.py --detail ----------

def _detail_job():
    return {"id": 1, "org_id": "o", "params": {"report_id": 1, "key": "p1"}, "attempts": 1, "max_attempts": 3}


def _detail_report():
    return {"industry": "kopi", "area": "A",
            "all": [{"place_id": "p1", "name": "Kopi Kecil", "rating": 4.7, "reviews": 120, "maps_url": "m"}]}


def test_detail_subprocess_menulis_laporan(monkeypatch):
    seen = {}

    def fake_run(conn, jid, args, timeout=None):
        seen["args"], seen["timeout"] = args, timeout
        _write_out(args, {"mode": "detail", "report_id": 1, "key": "p1", "business": {
            "place_id": "p1", "phone": "6281318911529", "whatsapp": "https://wa.me/6281318911529", "_detailed": True}})
        return "DETAIL_DONE Kopi Kecil\n", 0, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_run)
    conn = FakeConn(report=_detail_report())
    status, result, err = worker.do_market_detail(conn, _detail_job())
    assert status == "done" and isinstance(result, worker.Deferred), err
    assert seen["args"][:5] == ["--detail", "--report", "1", "--key", "p1"] and seen["timeout"] == worker.DETAIL_TIMEOUT
    target = result.fn(conn)
    assert target["phone"] == "6281318911529" and target["lead_score"] >= 80  # rebuild_sections menghitung ulang skor
    assert any("FOR UPDATE" in s for s in conn.sqls)
    assert not os.path.exists(seen["args"][-1])  # file --out dihapus


def test_detail_subprocess_timeout_cancel_stop_dan_gagal(monkeypatch):
    conn = FakeConn(report=_detail_report())
    monkeypatch.setattr(worker, "run_market_cmd", lambda c, j, a, timeout=None: ("", None, "timeout"))
    status, _, err = worker.do_market_detail(conn, _detail_job())
    assert status == "failed" and "Google Maps tidak merespons dalam" in err and not worker.is_permanent(err)
    monkeypatch.setattr(worker, "run_market_cmd", lambda c, j, a, timeout=None: ("", None, "cancel"))
    assert worker.do_market_detail(conn, _detail_job()) == ("cancelled", None, "Dihentikan.")
    monkeypatch.setattr(worker, "run_market_cmd", lambda c, j, a, timeout=None: ("", None, "stop"))
    assert worker.do_market_detail(conn, _detail_job()) == ("requeued", None, None)

    def fake_transient(c, j, a, timeout=None):
        _write_out(a, {"mode": "detail", "error": "Google Maps tidak merespons, coba lagi sebentar lagi", "permanent": False})
        return "x\n", 1, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_transient)
    job = _detail_job()
    status, _, err = worker.do_market_detail(conn, job)
    assert status == "failed" and err.startswith("Google Maps tidak merespons") and not job.get("permanent")

    def fake_permanent(c, j, a, timeout=None):
        _write_out(a, {"mode": "detail", "error": "bisnis tidak ada di laporan", "permanent": True})
        return "x\n", 2, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_permanent)
    job = _detail_job()
    status, _, err = worker.do_market_detail(conn, job)
    assert status == "failed" and job["permanent"] and worker.is_permanent(err, job)


def test_run_cmd_batas_waktu_per_pemanggilan(tmp_path, monkeypatch):
    script = _script(tmp_path, "import time\nprint('mulai', flush=True)\ntime.sleep(30)\n")
    monkeypatch.setattr(worker, "STOP", False)
    t0 = time.time()
    out, _, cancelled = worker.run_cmd(FakeConn(), 1, script, [], timeout=1)
    assert cancelled == "timeout" and time.time() - t0 < 15 and "mulai" in out
    assert worker._cancelled("timeout", 60) == ("failed", None, "melebihi batas waktu 1 menit")
    assert worker._cancelled("timeout", 30)[2] == "melebihi batas waktu 30 detik"


def test_load_env_tidak_menimpa(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text('export RAQIO_T_A="dari-file"\nRAQIO_T_B=polos # komentar\n# RAQIO_T_C="x"\nexport RAQIO_T_D=""\n',
                   encoding="utf-8")
    monkeypatch.setenv("RAQIO_T_A", "sudah-ada")
    for k in ("RAQIO_T_B", "RAQIO_T_C", "RAQIO_T_D"):
        monkeypatch.delenv(k, raising=False)
    worker.load_env(str(env))
    assert os.environ["RAQIO_T_A"] == "sudah-ada" and os.environ["RAQIO_T_B"] == "polos"
    assert "RAQIO_T_C" not in os.environ and "RAQIO_T_D" not in os.environ
    worker.load_env(str(tmp_path / "tidak-ada"))  # file tidak ada: diabaikan
    for k in ("RAQIO_T_B",):
        monkeypatch.delenv(k, raising=False)


# ---------- job chat (agent dipalsukan) ----------

class ChatConn(FakeConn):
    """FakeConn yang punya sesi chat (history) dan bisa meniru cancel_requested."""

    def __init__(self, history=None, cancel=False, **kw):
        super().__init__(**kw)
        self.history = history
        self.cancel = cancel

    def execute(self, sql, params=None):
        cur = super().execute(sql, params)
        if "FROM chat_sessions" in sql:
            cur.fetchone = lambda: (self.history,)
        if "cancel_requested" in sql:
            cur.fetchone = lambda: (self.cancel,)
        return cur


def job_log(conn):
    """Teks yang ditulis append_log ke jobs.log (gabungan semua potongan)."""
    return "".join(p[0] for sql, (_, p) in zip(conn.sqls, conn.calls, strict=False) if "SET log = right" in sql)


def _param(conn, marker):
    return next(p for sql, (_, p) in zip(conn.sqls, conn.calls, strict=False) if marker in sql)


def _tool_call(name, args, cid="c1"):
    return {"id": cid, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}


def test_chat_parameter_sesi_dan_kunci(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    job = {"id": 1, "org_id": "o", "params": {"sid": "", "message": "halo"}}
    status, _, err = worker.do_chat(FakeConn(), job)
    assert status == "failed" and job["permanent"] and "tidak valid" in err
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    job = {"id": 1, "org_id": "o", "params": {"sid": "s1", "message": "halo"}}
    status, _, err = worker.do_chat(FakeConn(), job)
    assert status == "failed" and err == "OPENROUTER_API_KEY belum diisi" and worker.is_permanent(err, job)
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    status, _, err = worker.do_chat(FakeConn(), job)  # tidak ada baris chat_sessions
    assert status == "failed" and err == "sesi chat tidak ada" and job["permanent"]


def test_chat_jalan_dengan_agent_palsu(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setattr(worker, "LOG_FLUSH_SEC", 0)
    replies = [{"role": "assistant", "content": None, "tool_calls": [_tool_call("list_competitors", {"location": "Kemang"})]},
               {"role": "assistant", "content": "Ada 2 kompetitor — yang terbesar Kopi A."}]
    seen = {}

    def fake_chat(messages, ctx):
        if ctx.model is None:
            ctx.model = "test/model"
            ctx.log("[model: test/model]")
        seen.setdefault("first", list(messages))
        return replies.pop(0)
    monkeypatch.setattr(agent, "chat", fake_chat)
    monkeypatch.setitem(agent.TOOL_FUNCS, "list_competitors",
                        lambda ctx, **kw: {"count": 2, "items": [], "org": ctx.org_id, "app": ctx.app_url})
    conn = ChatConn(history=[])
    job = {"id": 5, "org_id": "org-1", "params": {"sid": "s1", "message": "siapa kompetitor di Kemang?",
                                                   "limits": {"runs": 5}, "app_url": "https://app.test/",
                                                   "context": {"industry": "kopi", "area": "Kemang", "report_id": 9},
                                                   "org_name": "Kopi Kita", "plan": "pro", "role": "analyst"}}
    status, result, err = worker.do_chat(conn, job)
    assert status == "done" and err is None and isinstance(result, worker.Deferred)
    res = result.fn(conn)
    assert res == {"answer": "Ada 2 kompetitor, yang terbesar Kopi A.", "model": "test/model", "report_ids": []}
    log = job_log(conn)
    assert "🔧 list_competitors({\"location\": \"Kemang\"})\n" in log and "[model: test/model]\n" in log
    # pesan Konteks hanya dikirim ke model (setelah system), tidak masuk history yang disimpan
    assert seen["first"][1]["role"] == "system" and "laporan kopi di Kemang (id 9)" in seen["first"][1]["content"]
    assert "Pengguna: analyst di org Kopi Kita, paket pro" in seen["first"][1]["content"]
    assert _param(conn, "INSERT INTO chat_messages") == ("s1", "org-1", "Ada 2 kompetitor, yang terbesar Kopi A.", 5)
    upd = _param(conn, "UPDATE chat_sessions SET history")
    hist = json.loads(upd[0])
    assert [m["role"] for m in hist] == ["system", "user", "assistant", "tool", "assistant"] and upd[1:] == ("s1", "org-1")
    assert hist[0]["content"] == agent.SYSTEM and all(m["role"] != "system" for m in hist[1:])
    tool_msg = json.loads(hist[3]["content"])
    assert tool_msg["org"] == "org-1" and tool_msg["app"] == "https://app.test"


def test_chat_history_dipotong(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setattr(agent, "chat", lambda messages, ctx: {"role": "assistant", "content": "ok"})
    old = [{"role": "system", "content": "lama"}]
    for i in range(35):
        old += [{"role": "user", "content": f"u{i}"}, {"role": "assistant", "content": f"a{i}"}]
    conn = ChatConn(history=old)
    status, result, _ = worker.do_chat(conn, {"id": 1, "org_id": "o", "params": {"sid": "s", "message": "lagi"}})
    assert status == "done"
    result.fn(conn)
    hist = json.loads(_param(conn, "UPDATE chat_sessions SET history")[0])
    assert len(hist) <= 41 and hist[0]["role"] == "system" and hist[0]["content"] == agent.SYSTEM
    assert hist[1]["role"] == "user" and hist[-1] == {"role": "assistant", "content": "ok"}


def _blocking_chat(messages, ctx):
    """LLM palsu yang menunggu sampai dibatalkan (meniru request panjang), lalu berhenti lewat ChatStopped."""
    for _ in range(100):
        if ctx.should_stop():
            raise agent.ChatStopped()
        time.sleep(0.1)
    return {"role": "assistant", "content": "terlambat"}


def test_chat_dibatalkan_di_tengah(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setattr(worker, "CANCEL_CHECK_SEC", 0)
    monkeypatch.setattr(agent, "chat", _blocking_chat)
    conn = ChatConn(history=[], cancel=True)
    t0 = time.time()
    status, result, err = worker.do_chat(conn, {"id": 2, "org_id": "o", "params": {"sid": "s", "message": "halo"}})
    assert (status, result, err) == ("cancelled", None, "Dihentikan.") and time.time() - t0 < 10
    assert "[dibatalkan]" in job_log(conn)
    assert not any("INSERT INTO chat_messages" in s for s in conn.sqls)


def test_chat_melebihi_batas_waktu(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setattr(worker, "CHAT_TIMEOUT", 1)
    monkeypatch.setattr(agent, "chat", _blocking_chat)
    job = {"id": 3, "org_id": "o", "params": {"sid": "s", "message": "halo"}, "attempts": 1, "max_attempts": 3}
    conn = ChatConn(history=[])
    status, _, err = worker.do_chat(conn, job)
    assert status == "failed" and err == "melebihi batas waktu 1 detik" and not worker.is_permanent(err, job)
    assert "[melebihi batas waktu 1 detik]" in job_log(conn)


def test_chat_worker_berhenti_diantrekan_ulang(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setattr(agent, "chat", _blocking_chat)
    monkeypatch.setattr(worker, "STOP", True)
    status, result, err = worker.do_chat(ChatConn(history=[]), {"id": 6, "org_id": "o", "params": {"sid": "s", "message": "halo"}})
    assert (status, result, err) == ("requeued", None, None)


def test_chat_error_agent_jadi_failed(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")

    def boom(messages, ctx):
        raise RuntimeError("Semua model gagal. Terakhir: 402")
    monkeypatch.setattr(agent, "chat", boom)
    status, _, err = worker.do_chat(ChatConn(history=[]), {"id": 4, "org_id": "o", "params": {"sid": "s", "message": "halo"}})
    assert status == "failed" and err == "RuntimeError: Semua model gagal. Terakhir: 402"


def test_chat_app_url_fallback_env(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setattr(worker, "APP_URL", "https://env.test")
    seen = {}

    def fake_chat(messages, ctx):
        seen["url"] = ctx.report_url(3)
        return {"role": "assistant", "content": "ok"}
    monkeypatch.setattr(agent, "chat", fake_chat)
    worker.do_chat(ChatConn(history=[]), {"id": 7, "org_id": "o", "params": {"sid": "s", "message": "halo", "app_url": ""}})
    assert seen["url"] == "https://env.test/market?id=3"
