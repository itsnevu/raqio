"""agent.py tanpa jaringan dan tanpa Postgres: Context, loop tool, subprocess yang mengalir, pemotongan history,
cache OSM tanpa kontak, penolakan peran viewer, dan pengecekan bahwa legacy Python sudah dihapus."""
import importlib
import json
import os
import sqlite3
import threading
import time

import pytest

import agent

HERE = os.path.dirname(os.path.abspath(__file__))


def ctx_with(**kw):
    lines = []
    return agent.Context(log=lines.append, **kw), lines


def _tool_call(name, args, cid="c1"):
    return {"id": cid, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}


def test_trim_history_potong_di_pesan_user():
    hist = [{"role": "system", "content": "s"}]
    for i in range(35):
        hist += [{"role": "user", "content": f"u{i}"}, {"role": "assistant", "content": None, "tool_calls": []},
                 {"role": "tool", "content": "{}"}]
    assert len(agent.trim_history(hist[:60])) == 60  # <= 60 pesan: utuh
    out = agent.trim_history(hist)
    assert out[0]["role"] == "system" and out[1]["role"] == "user" and len(out) <= 41
    assert out[-1] is hist[-1]


def test_no_dash():
    assert agent.no_dash("a — b—c") == "a, b, c"


def test_context_messages_dan_peran():
    ctx, _ = ctx_with(role="Viewer", org_name="Kopi Kita", plan="free", verified=False,
                      page_context={"industry": "kopi", "area": "Kemang", "report_id": 7, "business_key": "p1", "page": "market"})
    msgs = ctx.context_messages()
    assert len(msgs) == 1 and msgs[0]["role"] == "system"
    text = msgs[0]["content"]
    assert "Konteks: pengguna sedang membuka laporan kopi di Kemang (id 7)" in text
    assert "key p1" in text and "halaman: market" in text
    assert "Pengguna: viewer di org Kopi Kita, paket free, email belum diverifikasi." in text
    assert not ctx.can_write
    assert agent.Context(log=print).context_messages() == []
    assert agent.Context(log=print, app_url="https://app.test/").report_url(5) == "https://app.test/market?id=5"


def test_run_agent_tool_lalu_jawaban(monkeypatch):
    replies = [{"role": "assistant", "content": None, "tool_calls": [_tool_call("list_competitors", {"location": "Kemang"})]},
               {"role": "assistant", "content": "Kompetitor terbesar — Kopi A."}]
    sent = []

    def fake_chat(messages, ctx):
        sent.append(list(messages))
        return replies.pop(0)
    monkeypatch.setattr(agent, "chat", fake_chat)
    monkeypatch.setitem(agent.TOOL_FUNCS, "list_competitors", lambda ctx, **kw: {"count": 1, "args": kw})
    ctx, lines = ctx_with(page_context={"page": "market"})
    answer, hist = agent.run_agent("siapa?", [{"role": "system", "content": "lama"}, {"role": "user", "content": "x"},
                                              {"role": "assistant", "content": "y"}], ctx=ctx)
    assert answer == "Kompetitor terbesar, Kopi A."
    assert [m["role"] for m in hist] == ["system", "user", "assistant", "user", "assistant", "tool", "assistant"]
    assert hist[0]["content"] == agent.SYSTEM  # prompt lama di history diganti versi terbaru
    assert json.loads(hist[5]["content"]) == {"count": 1, "args": {"location": "Kemang"}} and hist[5]["tool_call_id"] == "c1"
    assert lines == ['🔧 list_competitors({"location": "Kemang"})']
    # pesan Konteks disisipkan setelah system hanya saat memanggil model
    assert sent[0][1] == {"role": "system", "content": "Konteks: halaman: market."}
    assert all(m["role"] != "system" for m in hist[1:])
    assert sent[0][0]["content"] == agent.SYSTEM and sent[0][-1] == {"role": "user", "content": "siapa?"}


def test_run_agent_tool_tidak_dikenal_argumen_salah_dan_batas_langkah(monkeypatch):
    def fake_chat(messages, ctx):
        return {"role": "assistant", "content": None,
                "tool_calls": [_tool_call("tidak_ada", {}), _tool_call("google_trends", {"salah": 1}, "c2"),
                               {"id": "c3", "function": {"name": "list_competitors", "arguments": "{bukan json"}}]}
    monkeypatch.setattr(agent, "chat", fake_chat)
    monkeypatch.setitem(agent.TOOL_FUNCS, "list_competitors", lambda ctx, **kw: {"ok": kw == {}})
    ctx, lines = ctx_with()
    answer, hist = agent.run_agent("x", ctx=ctx)
    assert answer.startswith("Berhenti: terlalu banyak langkah")
    tools = [json.loads(m["content"]) for m in hist if m["role"] == "tool"]
    assert tools[0] == {"error": "tool tidak dikenal"}
    assert "argumen tool tidak valid" in tools[1]["error"] and tools[2] == {"ok": True}
    assert len(lines) == 3 * agent.MAX_STEPS


def test_run_agent_berhenti_saat_dibatalkan(monkeypatch):
    monkeypatch.setattr(agent, "chat", lambda messages, ctx: {"role": "assistant", "content": "x"})
    ctx, _ = ctx_with(should_stop=lambda: True)
    with pytest.raises(agent.ChatStopped):
        agent.run_agent("x", ctx=ctx)
    with pytest.raises(agent.ChatStopped):
        agent.call_tool(ctx, "find_instagram_accounts", {"query": "x"})  # tool memanggil ctx.check(), tidak ditelan


def test_run_script_mengalirkan_log_batas_waktu_dan_batal(tmp_path):
    script = tmp_path / "s.py"
    script.write_text("import time\nprint('baris 1', flush=True)\nprint('baris 2', flush=True)\ntime.sleep(30)\n",
                      encoding="utf-8")
    ctx, lines = ctx_with()
    t0 = time.time()
    out, code, stopped = agent.run_script(ctx, str(script), ["--x"], timeout=1)
    assert stopped == "timeout" and time.time() - t0 < 15 and "baris 2" in out
    assert lines[0].startswith("$ ") and "--x" in lines[0] and "baris 1" in lines and "baris 2" in lines
    assert any("melebihi batas waktu 1 detik" in l for l in lines)
    stop = threading.Event()
    ctx2, _ = ctx_with(should_stop=stop.is_set)
    threading.Timer(0.7, stop.set).start()
    t0 = time.time()
    _, _, stopped = agent.run_script(ctx2, str(script), [], timeout=60)
    assert stopped == "cancel" and time.time() - t0 < 15
    done = tmp_path / "ok.py"
    done.write_text("print('selesai')\n", encoding="utf-8")
    out, code, stopped = agent.run_script(ctx, str(done), [], timeout=30)
    assert (code, stopped) == (0, False) and "selesai" in out


def test_osm_competitors_tanpa_kontak(tmp_path, monkeypatch):
    db = tmp_path / "ig.db"
    c = sqlite3.connect(db)
    c.execute("CREATE TABLE businesses (location TEXT, data TEXT, last_scanned TEXT)")
    c.execute("INSERT INTO businesses VALUES (?,?,?)", ("Kemang, Jakarta", json.dumps({
        "name": "Kopi A", "category": "coffee", "instagram": "kopia", "followers": 100, "phone": "0812",
        "website": "https://a.id", "emails": ["a@a.id"]}), "2026-01-01T00:00:00+00:00"))
    c.execute("INSERT INTO businesses VALUES (?,?,?)", ("Dago, Bandung", json.dumps({
        "name": "Kopi B", "category": "coffee", "followers": 500}), "2026-01-02T00:00:00+00:00"))
    c.commit()
    c.close()
    monkeypatch.setattr(agent, "DB", str(db))
    ctx, _ = ctx_with()  # tanpa org -> fallback cache OSM
    res = agent.tool_list_competitors(ctx, category="coffee")
    assert res["count"] == 2 and [i["name"] for i in res["items"]] == ["Kopi B", "Kopi A"] and "tanpa kontak" in res["source"]
    assert not any(k in res["items"][1] for k in ("phone", "website", "emails"))
    assert agent.tool_list_competitors(ctx, location="kemang", only_with_instagram=True)["items"][0]["instagram"] == "kopia"
    monkeypatch.setattr(agent, "DB", str(tmp_path / "tidak-ada.db"))
    assert agent.tool_list_competitors(ctx)["count"] == 0


def test_strip_contact_fields_semua_daftar():
    rep = {"industry": "kopi", "summary": {"businesses": 1},
           "all": [{"name": "A", "phone": "0812", "whatsapp": "https://wa.me/62812", "website": "w", "instagram": "ig",
                    "instagram_shared": False, "emails": ["x"], "_detailed": True, "lead": {"status": "deal"}, "rating": 4.5}],
           "prospects": [{"name": "A", "phone": "0812", "gaps": ["x"]}], "insights": ["teks"]}
    agent.strip_contact_fields(rep)
    assert rep["all"][0] == {"name": "A", "rating": 4.5} and rep["prospects"][0] == {"name": "A", "gaps": ["x"]}
    assert rep["insights"] == ["teks"] and rep["summary"] == {"businesses": 1}


def test_tool_tulis_ditolak_untuk_viewer():
    ctx, lines = ctx_with(role="viewer", db=lambda: pytest.fail("tidak boleh menyentuh DB"), org_id="o")
    assert "viewer" in agent.tool_set_lead_status(ctx, "p1", "dihubungi")["error"]
    assert "viewer" in agent.tool_add_watch(ctx, "kopi", "Kemang")["error"]
    assert lines == []


def test_tools_butuh_org_dan_validasi():
    ctx, _ = ctx_with()
    for res in (agent.tool_get_report(ctx, 1), agent.tool_list_prospects(ctx), agent.tool_draft_whatsapp(ctx, "p1"),
                agent.tool_add_watch(ctx, "kopi", "Kemang"), agent.tool_set_lead_status(ctx, "p1", "deal")):
        assert "butuh konteks org" in res["error"]
    assert "status harus" in agent.tool_set_lead_status(ctx, "p1", "ngawur")["error"]
    assert "YYYY-MM-DD" in agent.tool_set_lead_status(ctx, "p1", "deal", remind="besok")["error"]
    assert "YYYY-MM-DD" in agent.tool_set_lead_status(ctx, "p1", "deal", remind="2026-13-01")["error"]
    assert "wajib" in agent.tool_market_research(ctx, "", "Kemang")["error"]
    assert "usernames" in agent.tool_scrape_instagram(ctx, ["a b!", "@"])["error"]
    assert "kategori" in agent.tool_search_competitors(ctx, "bukan-kategori", "Kemang")["error"]


def test_api_key_dibaca_saat_dipanggil(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    assert agent.api_key() == ""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-x")
    assert agent.api_key() == "sk-x"
    assert os.path.basename(agent.DB) == "ig.db"


def test_legacy_python_dihapus():
    for mod in ("app", "report_dashboard"):
        with pytest.raises(ModuleNotFoundError):
            importlib.import_module(mod)
    root = os.path.join(HERE, "..")
    assert not os.path.exists(os.path.join(root, "templates")) and not os.path.exists(os.path.join(root, "app.py"))
    assert not hasattr(agent, "CHAT_PAGE")
