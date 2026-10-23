"""Tes integrasi job chat dan tool agent terhadap Postgres sungguhan. Database raqio_test_py_chat dibuat ulang tiap run;
namanya berbeda dari test_worker_pg (raqio_test_py) supaya dua run tidak saling ganggu. Dilewati kalau Postgres tidak
bisa dihubungi (TEST_DATABASE_URL, default port 5433 lokal).

Tabel chat_sessions/chat_messages datang dari migrasi 008; kalau migrasinya belum ada di repo, dibuat di sini dengan
definisi kontrak yang sama, dan CHECK jobs.kind ditambah 'chat' (008 harus melakukan hal yang sama)."""
import glob
import json
import os

import pytest

psycopg = pytest.importorskip("psycopg")
import agent  # noqa: E402
import market  # noqa: E402
import worker  # noqa: E402

BASE = os.environ.get("TEST_DATABASE_URL", "postgres://raqio:raqio@127.0.0.1:5433/raqio")
DBNAME = "raqio_test_py_chat"
HERE = os.path.dirname(os.path.abspath(__file__))
MIGRATIONS = os.path.join(HERE, "..", "..", "..", "apps", "api", "migrations")
CONTRACT_008 = """
CREATE TABLE IF NOT EXISTS chat_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    title           TEXT NOT NULL DEFAULT '',
    history         JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS chat_messages (
    id         BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content    TEXT NOT NULL,
    job_id     BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""
KIND_CHECK = """ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check
    CHECK (kind IN ('market_run','market_compare','market_detail','ig_profile','chat'))"""


@pytest.fixture(scope="module")
def dsn():
    try:
        admin = psycopg.connect(BASE, autocommit=True, connect_timeout=2)
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"postgres tidak tersedia: {e}")
    admin.execute(f"DROP DATABASE IF EXISTS {DBNAME} WITH (FORCE)")
    admin.execute(f"CREATE DATABASE {DBNAME}")
    admin.close()
    url = BASE.rsplit("/", 1)[0] + "/" + DBNAME
    conn = psycopg.connect(url, autocommit=True)
    for f in sorted(glob.glob(os.path.join(MIGRATIONS, "*.sql"))):
        conn.execute(open(f, encoding="utf-8").read())
    if not conn.execute("SELECT to_regclass('chat_sessions')").fetchone()[0]:
        conn.execute(CONTRACT_008)
    chk = conn.execute("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='jobs_kind_check'").fetchone()
    if chk and "'chat'" not in chk[0]:
        conn.execute(KIND_CHECK)
    conn.close()
    return url


@pytest.fixture
def conn(dsn, monkeypatch):
    c = psycopg.connect(dsn, autocommit=True)
    monkeypatch.setattr(worker, "SCHEMA", dict(worker.SCHEMA))  # detect_schema mengubah dict; tes FakeConn butuh nilai awal
    worker.detect_schema(c)
    assert worker.SCHEMA == {"locked_by": True, "job_logs": True, "summary": True}
    monkeypatch.setattr(worker, "DSN", dsn)  # ctx.db = worker.connect -> koneksi baru ke DB tes
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setattr(worker, "LOG_FLUSH_SEC", 0)
    c.execute("DELETE FROM chat_messages; DELETE FROM chat_sessions; DELETE FROM job_logs; DELETE FROM jobs; "
              "DELETE FROM leads; DELETE FROM watches; DELETE FROM usage; DELETE FROM reports; DELETE FROM org_settings; "
              "DELETE FROM orgs")
    worker._LOG_SEQ.clear()
    yield c
    c.close()


def org(conn, name="T"):
    return str(conn.execute("INSERT INTO orgs (name) VALUES (%s) RETURNING id", (name,)).fetchone()[0])


def session(conn, oid, history=None):
    return str(conn.execute("INSERT INTO chat_sessions (org_id, history) VALUES (%s, %s) RETURNING id",
                            (oid, json.dumps(history or []))).fetchone()[0])


def enqueue_chat(conn, oid, sid, message="halo", **extra):
    params = {"sid": sid, "message": message, "message_id": 1, "limits": {"runs": 5, "details": 30, "watches": 1},
              "app_url": "https://app.test", **extra}
    return conn.execute("INSERT INTO jobs (org_id, kind, params) VALUES (%s,'chat',%s) RETURNING id",
                        (oid, psycopg.types.json.Jsonb(params))).fetchone()[0]


def places():
    return [{"place_id": "p1", "name": "Kopi Kecil", "rating": 4.7, "reviews": 120, "maps_url": "m1",
             "phone": "6281318911529", "_detailed": True, "category": "Kedai kopi", "dist_km": 0.4},
            {"place_id": "p2", "name": "Kopi Besar", "rating": 4.5, "reviews": 3000, "maps_url": "m2",
             "website": "https://besar.id", "instagram": "kopibesar", "_detailed": True, "category": "Kafe"}]


def report(industry="kopi", area="Kemang", ps=None):
    return market.score_all(market.build_report(industry, area, ps if ps is not None else places()))


def insert_report(conn, oid, rep, **cols):
    extra = "".join(f", {k}" for k in cols)
    vals = "".join(", %s" for _ in cols)
    return conn.execute(f"INSERT INTO reports (org_id, industry, area, report, summary{extra}) VALUES (%s,%s,%s,%s,%s{vals}) RETURNING id",
                        (oid, rep["industry"], rep["area"], json.dumps(rep), json.dumps(rep["summary"]),
                         *cols.values())).fetchone()[0]


def ctx(oid, **kw):
    lines = []
    kw.setdefault("limits", {"runs": 5, "watches": 1})
    return agent.Context(org_id=oid, db=worker.connect, app_url="https://app.test", log=lines.append, **kw), lines


def logs(conn, jid):
    return [line for (line,) in conn.execute("SELECT line FROM job_logs WHERE job_id=%s ORDER BY seq", (jid,))]


def write_out(args, data):
    with open(args[args.index("--out") + 1], "w", encoding="utf-8") as f:
        json.dump(data, f)


def _tool_call(name, args, cid="c1"):
    return {"id": cid, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}


def _blocking_chat(messages, ctx):
    import time
    for _ in range(100):
        if ctx.should_stop():
            raise agent.ChatStopped()
        time.sleep(0.1)
    return {"role": "assistant", "content": "terlambat"}


# ---------- job chat end-to-end (LLM dipalsukan, tool list_competitors sungguhan) ----------

def test_chat_selesai_menulis_pesan_history_dan_log(conn, monkeypatch):
    oid = org(conn)
    rid = insert_report(conn, oid, report())
    sid = session(conn, oid)
    jid = enqueue_chat(conn, oid, sid, "siapa kompetitor kopi di Kemang?",
                       context={"industry": "kopi", "area": "Kemang", "report_id": rid, "page": "market"},
                       org_name="Kopi Kita", plan="pro", role="analyst", verified=True)
    replies = [{"role": "assistant", "content": None, "tool_calls": [_tool_call("list_competitors", {"location": "kemang"})]},
               {"role": "assistant", "content": "Ada 2 kompetitor — Kopi Besar yang terbesar."}]
    sent = []

    def fake_chat(messages, ctx):
        if ctx.model is None:
            ctx.model = "test/model"
            ctx.log("[model: test/model]")
        sent.append(list(messages))
        return replies.pop(0)
    monkeypatch.setattr(agent, "chat", fake_chat)
    job = worker.claim(conn)
    assert job["kind"] == "chat" and job["id"] == jid
    worker.handle(conn, job)
    st, res, err = conn.execute("SELECT status, result, error FROM jobs WHERE id=%s", (jid,)).fetchone()
    assert st == "done", err
    assert res == {"answer": "Ada 2 kompetitor, Kopi Besar yang terbesar.", "model": "test/model", "report_ids": []}
    lines = logs(conn, jid)
    assert '🔧 list_competitors({"location": "kemang"})' in lines and "[model: test/model]" in lines
    msgs = conn.execute("SELECT session_id::text, org_id::text, role, content, job_id FROM chat_messages").fetchall()
    assert msgs == [(sid, oid, "assistant", "Ada 2 kompetitor, Kopi Besar yang terbesar.", jid)]
    hist, last = conn.execute("SELECT history, last_message_at FROM chat_sessions WHERE id=%s", (sid,)).fetchone()
    assert [m["role"] for m in hist] == ["system", "user", "assistant", "tool", "assistant"] and last is not None
    assert hist[0]["content"] == agent.SYSTEM and hist[1]["content"] == "siapa kompetitor kopi di Kemang?"
    tool_res = json.loads(hist[3]["content"])
    assert tool_res["count"] == 2 and tool_res["items"][0]["name"] == "Kopi Besar" and tool_res["items"][0]["report_id"] == rid
    assert tool_res["items"][1] == {"key": "p1", "name": "Kopi Kecil", "rating": 4.7, "reviews": 120, "category": "Kedai kopi",
                                    "instagram": None, "dist_km": 0.4, "lead_score": 90, "area": "Kemang",
                                    "industry": "kopi", "report_id": rid}
    # pesan Konteks ikut ke model (setelah system) tapi tidak disimpan
    assert sent[0][1]["role"] == "system" and f"laporan kopi di Kemang (id {rid})" in sent[0][1]["content"]
    assert "Pengguna: analyst di org Kopi Kita, paket pro." in sent[0][1]["content"]
    assert all(m["role"] != "system" for m in hist[1:])


def test_chat_history_dimuat_dan_dipotong(conn, monkeypatch):
    oid = org(conn)
    old = [{"role": "system", "content": "lama"}]
    for i in range(35):
        old += [{"role": "user", "content": f"u{i}"}, {"role": "assistant", "content": f"a{i}"}]
    sid = session(conn, oid, old)
    jid = enqueue_chat(conn, oid, sid, "lanjut")
    seen = {}

    def fake_chat(messages, ctx):
        seen["n"] = len(messages)
        return {"role": "assistant", "content": "ok"}
    monkeypatch.setattr(agent, "chat", fake_chat)
    worker.handle(conn, worker.claim(conn))
    assert conn.execute("SELECT status FROM jobs WHERE id=%s", (jid,)).fetchone()[0] == "done"
    assert seen["n"] == 72  # seluruh history lama + pertanyaan baru dikirim ke model
    hist = conn.execute("SELECT history FROM chat_sessions WHERE id=%s", (sid,)).fetchone()[0]
    assert len(hist) <= 41 and hist[0] == {"role": "system", "content": agent.SYSTEM} and hist[1]["role"] == "user"
    assert hist[-1] == {"role": "assistant", "content": "ok"}


def test_chat_dibatalkan(conn, monkeypatch):
    oid = org(conn)
    sid = session(conn, oid)
    jid = enqueue_chat(conn, oid, sid)
    monkeypatch.setattr(worker, "CANCEL_CHECK_SEC", 0)
    monkeypatch.setattr(agent, "chat", _blocking_chat)
    job = worker.claim(conn)
    conn.execute("UPDATE jobs SET cancel_requested=true WHERE id=%s", (jid,))
    worker.handle(conn, job)
    assert conn.execute("SELECT status, error FROM jobs WHERE id=%s", (jid,)).fetchone() == ("cancelled", "Dihentikan.")
    assert conn.execute("SELECT count(*) FROM chat_messages").fetchone()[0] == 0
    assert logs(conn, jid)[-1] == "[dibatalkan]"
    assert conn.execute("SELECT last_message_at FROM chat_sessions WHERE id=%s", (sid,)).fetchone()[0] is None


def test_chat_kunci_kosong_gagal_permanen(conn, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    oid = org(conn)
    jid = enqueue_chat(conn, oid, session(conn, oid))
    conn.execute("UPDATE jobs SET max_attempts=3 WHERE id=%s", (jid,))
    worker.handle(conn, worker.claim(conn))
    assert conn.execute("SELECT status, attempts, error FROM jobs WHERE id=%s", (jid,)).fetchone() == \
        ("failed", 1, "OPENROUTER_API_KEY belum diisi")


# ---------- tool dengan konteks org ----------

def test_market_research_laporan_org_cache_lintas_org_dan_kuota(conn, monkeypatch):
    a, b = org(conn, "A"), org(conn, "B")
    rid = insert_report(conn, a, report())
    ca, _ = ctx(a)
    res = agent.tool_market_research(ca, "Kopi", "kemang")  # cocok tanpa peduli huruf besar
    assert res["report_id"] == rid and res["report_url"] == f"https://app.test/market?id={rid}" and "org ini" in res["source"]
    # leaders diurutkan rata-rata tertimbang (Bayesian), bukan ulasan mentah: Kopi Kecil (4,7) di atas Kopi Besar (4,5)
    assert res["leaders"][0]["key"] == "p1" and res["prospects"][0]["whatsapp"] == "https://wa.me/6281318911529"
    assert ca.report_ids == [] and conn.execute("SELECT count(*) FROM usage").fetchone()[0] == 0
    # org B belum punya: laporan A disalin tanpa kontak, cached_from terisi, summary terisi, tanpa job_id
    cb, lb = ctx(b)
    res = agent.tool_market_research(cb, "kopi", "Kemang")
    new_id = res["report_id"]
    assert new_id != rid and cb.report_ids == [new_id] and "instan" in res["source"] and res["summary"]["businesses"] == 2
    row = conn.execute("SELECT org_id::text, cached_from, report, summary, job_id FROM reports WHERE id=%s", (new_id,)).fetchone()
    assert row[0] == b and row[1] == rid and row[4] is None and row[3]["businesses"] == 2
    for section, items in row[2].items():
        if isinstance(items, list):
            for p in items:
                if isinstance(p, dict):
                    assert not set(p) & set(agent.CONTACT_FIELDS), (section, p)
    assert [p["name"] for p in row[2]["prospects"]] == ["Kopi Kecil"] and row[2]["digital"]["whatsapp"] == 50  # agregat tetap
    assert row[2]["industry"] == "kopi" and row[2]["area"] == "Kemang" and "cached_from" not in row[2]
    assert not any(p.get("whatsapp") for p in res["prospects"]) and any("[cache]" in l for l in lb)
    # panggil lagi: salinan yang sama, tidak digandakan
    assert agent.tool_market_research(ctx(b)[0], "kopi", "Kemang")["report_id"] == new_id
    assert conn.execute("SELECT count(*) FROM reports WHERE org_id=%s", (b,)).fetchone()[0] == 1
    # kuota habis (runs=0) untuk pasangan yang belum ada di mana pun
    assert agent.tool_market_research(ctx(b, limits={"runs": 0})[0], "salon", "Dago") == {"error": "kuota riset bulan ini habis"}
    # viewer tidak boleh riset baru
    assert "viewer" in agent.tool_market_research(ctx(b, role="viewer")[0], "salon", "Dago")["error"]
    # riset baru (market.py dipalsukan): kuota terpotong, laporan masuk org dengan job_id dan summary
    jid = enqueue_chat(conn, b, session(conn, b))

    def fake_run(c, script, args, timeout):
        assert script == "market.py" and timeout == agent.SEARCH_TIMEOUT and args[:4] == ["--industry", "salon", "--area", "Dago"]
        write_out(args, {"mode": "run", "report_id": 1, "report": report("salon", "Dago")})
        c.log("[5/5] Selesai. REPORT_ID=1")
        return "REPORT_ID=1\n", 0, False
    monkeypatch.setattr(agent, "run_script", fake_run)
    c1, l1 = ctx(b, limits={"runs": 1}, job_id=jid)
    res = agent.tool_market_research(c1, "salon", "Dago")
    assert res["source"] == "riset baru" and c1.report_ids == [res["report_id"]] and res["report_url"].endswith(f"?id={res['report_id']}")
    row = conn.execute("SELECT job_id, summary->>'businesses', org_id::text FROM reports WHERE id=%s", (res["report_id"],)).fetchone()
    assert row == (jid, "2", b)
    assert conn.execute("SELECT count FROM usage WHERE org_id=%s AND kind='market_run'", (b,)).fetchone()[0] == 1
    assert "[kuota] riset ke-1 dari 1 bulan ini" in l1 and f"REPORT_PG_ID={res['report_id']}" in l1 and "[5/5] Selesai. REPORT_ID=1" in l1
    # laporan baru itu sekarang laporan org (< 7 hari): dipakai ulang tanpa kuota
    assert agent.tool_market_research(ctx(b, limits={"runs": 1})[0], "salon", "dago")["report_id"] == res["report_id"]
    # kuota (1) sudah terpakai: wilayah lain ditolak
    assert agent.tool_market_research(ctx(b, limits={"runs": 1})[0], "salon", "Cihampelas") == {"error": "kuota riset bulan ini habis"}
    # riset gagal: kuota dikembalikan
    conn.execute("DELETE FROM usage")

    def fake_fail(c, script, args, timeout):
        write_out(args, {"mode": "run", "error": "Tidak ada hasil dari Google Maps.", "permanent": True})
        return "x\n", 2, False
    monkeypatch.setattr(agent, "run_script", fake_fail)
    assert agent.tool_market_research(ctx(b, limits={"runs": 1})[0], "salon", "Cihampelas") == {"error": "Tidak ada hasil dari Google Maps."}
    assert conn.execute("SELECT count FROM usage WHERE org_id=%s AND kind='market_run'", (b,)).fetchone()[0] == 0
    # dibatalkan saat riset: ChatStopped diteruskan, kuota dikembalikan
    monkeypatch.setattr(agent, "run_script", lambda c, script, args, timeout: ("", None, "cancel"))
    with pytest.raises(agent.ChatStopped):
        agent.tool_market_research(ctx(b, limits={"runs": 1})[0], "salon", "Cihampelas")
    assert conn.execute("SELECT count FROM usage WHERE org_id=%s AND kind='market_run'", (b,)).fetchone()[0] == 0
    # fresh=true melewati laporan lama dan cache
    monkeypatch.setattr(agent, "run_script", lambda c, script, args, timeout: ("", None, "timeout"))
    res = agent.tool_market_research(ctx(a, limits={"runs": 1})[0], "kopi", "Kemang", fresh=True)
    assert "batas waktu" in res["error"]


def test_list_competitors_dari_laporan_org(conn, monkeypatch):
    a, b = org(conn, "A"), org(conn, "B")
    insert_report(conn, a, report("kopi", "Kemang", [dict(places()[0], name="Lama")]))  # laporan lama pasangan yang sama
    insert_report(conn, a, report("kopi", "Kemang"))
    insert_report(conn, a, report("salon", "Dago", [{"place_id": "s1", "name": "Salon Satu", "rating": 4.2, "reviews": 50,
                                                       "maps_url": "m3", "category": "Salon"}]))
    insert_report(conn, b, report("kopi", "Kemang"))  # org lain: tidak terlihat
    c, _ = ctx(a)
    res = agent.tool_list_competitors(c)
    assert res["count"] == 3 and [i["name"] for i in res["items"]] == ["Kopi Besar", "Kopi Kecil", "Salon Satu"]
    assert "Google Maps" in res["source"] and "Lama" not in [i["name"] for i in res["items"]]
    assert set(res["items"][0]) == {"key", "name", "rating", "reviews", "category", "instagram", "dist_km", "lead_score",
                                    "area", "industry", "report_id"}
    assert [i["name"] for i in agent.tool_list_competitors(c, location="dago")["items"]] == ["Salon Satu"]
    assert [i["name"] for i in agent.tool_list_competitors(c, category="KOPI")["items"]] == ["Kopi Besar", "Kopi Kecil"]
    assert [i["name"] for i in agent.tool_list_competitors(c, category="kafe")["items"]] == ["Kopi Besar"]
    assert [i["name"] for i in agent.tool_list_competitors(c, only_with_instagram=True)["items"]] == ["Kopi Besar"]
    assert agent.tool_list_competitors(c, limit=1)["items"][0]["name"] == "Kopi Besar"
    # org tanpa laporan yang cocok jatuh ke cache OSM (kosong di sini)
    monkeypatch.setattr(agent, "DB", os.path.join(str(HERE), "tidak-ada.db"))
    res = agent.tool_list_competitors(ctx(org(conn))[0])
    assert res["count"] == 0 and "OSM" in res["source"]


def test_get_report_hanya_org_sendiri(conn):
    a, b = org(conn), org(conn)
    rid = insert_report(conn, a, report())
    res = agent.tool_get_report(ctx(a)[0], rid)
    assert res["report_id"] == rid and res["summary"]["businesses"] == 2 and res["report_url"] == f"https://app.test/market?id={rid}"
    assert res["prospects"][0]["key"] == "p1" and res["leaders"][0]["name"] == "Kopi Kecil" and res["categories"]
    assert "error" in agent.tool_get_report(ctx(b)[0], rid)
    assert "error" in agent.tool_get_report(ctx(a)[0], "x") and "error" in agent.tool_get_report(ctx(a)[0], rid + 999)


def test_set_lead_status_dan_list_prospects(conn):
    oid = org(conn)
    insert_report(conn, oid, report())
    c, lines = ctx(oid, role="analyst")
    res = agent.tool_set_lead_status(c, "p1", "dihubungi", note="minta sore", remind="2026-11-01")
    assert res == {"ok": True, "key": "p1", "name": "Kopi Kecil", "status": "dihubungi", "note": "minta sore",
                   "remind": "2026-11-01", "in_report": True}
    assert lines[-1] == "[prospek] Kopi Kecil: status dihubungi, pengingat 2026-11-01"
    row = conn.execute("SELECT org_id::text, name, status, note, to_char(remind,'YYYY-MM-DD') FROM leads WHERE key='p1'").fetchone()
    assert row == (oid, "Kopi Kecil", "dihubungi", "minta sore", "2026-11-01")
    # note/remind yang tidak dikirim tidak berubah; remind "" menghapus pengingat
    res = agent.tool_set_lead_status(c, "p1", "tertarik")
    assert (res["status"], res["note"], res["remind"]) == ("tertarik", "minta sore", "2026-11-01")
    assert agent.tool_set_lead_status(c, "p1", "tertarik", remind="")["remind"] is None
    # bisnis di luar laporan tetap bisa dicatat
    assert agent.tool_set_lead_status(c, "luar", "baru")["in_report"] is False
    # viewer ditolak, tidak menulis
    assert "viewer" in agent.tool_set_lead_status(ctx(oid, role="viewer")[0], "p1", "deal")["error"]
    assert conn.execute("SELECT status FROM leads WHERE key='p1'").fetchone()[0] == "tertarik"
    # list_prospects: lead org + prospek skor >= 40 yang belum ditindaklanjuti; filter status; jatuh tempo
    agent.tool_set_lead_status(c, "p1", "dihubungi", remind="2020-01-01")
    res = agent.tool_list_prospects(c)
    by = {i["key"]: i for i in res["items"]}
    assert by["p1"]["status"] == "dihubungi" and by["p1"]["due"] and by["p1"]["score"] == 90
    assert by["p1"]["area"] == "Kemang" and by["p1"]["whatsapp"] == "https://wa.me/6281318911529"
    assert by["p1"]["note"] == "minta sore" and by["p1"]["remind"] == "2020-01-01"  # catatan lama tetap
    assert by["luar"]["status"] == "baru" and by["luar"]["score"] is None and "p2" not in by  # pemain besar bukan prospek
    assert res["items"][0]["key"] == "p1"  # yang jatuh tempo di atas
    assert [i["key"] for i in agent.tool_list_prospects(c, status="dihubungi")["items"]] == ["p1"]
    assert [i["key"] for i in agent.tool_list_prospects(c, due_today=True)["items"]] == ["p1"]
    assert "status harus" in agent.tool_list_prospects(c, status="x")["error"]
    assert agent.tool_list_prospects(ctx(org(conn))[0])["count"] == 0  # org lain tidak melihat
    # prospek dari laporan tanpa baris leads muncul sebagai "baru"
    conn.execute("DELETE FROM leads")
    res = agent.tool_list_prospects(c)
    assert [(i["key"], i["status"]) for i in res["items"]] == [("p1", "baru")]


def test_add_watch_hormati_batas(conn):
    oid = org(conn)
    c, lines = ctx(oid, limits={"runs": 5, "watches": 1})
    res = agent.tool_add_watch(c, "kopi", "Kemang", every_days=3)
    assert res["ok"] and res["every_days"] == 3 and not res["updated"] and lines[-1] == "[pantau] kopi di Kemang tiap 3 hari"
    assert "batas pantauan paket ini 1" in agent.tool_add_watch(c, "salon", "Dago")["error"]
    res = agent.tool_add_watch(c, "Kopi", "kemang", every_days=200)  # pasangan sama: diperbarui, every_days dijepit 90
    assert res["updated"] and res["every_days"] == 90
    assert conn.execute("SELECT industry, area, every_days FROM watches WHERE org_id=%s", (oid,)).fetchall() == [("kopi", "Kemang", 90)]
    assert "batas pantauan" in agent.tool_add_watch(ctx(oid, limits={})[0], "salon", "Dago")["error"]  # tanpa limits.watches: 1
    assert "viewer" in agent.tool_add_watch(ctx(oid, role="viewer")[0], "x", "y")["error"]
    assert agent.tool_add_watch(ctx(oid, limits={"watches": 5})[0], "salon", "Dago")["ok"]
    assert conn.execute("SELECT count(*) FROM watches WHERE org_id=%s", (oid,)).fetchone()[0] == 2
    assert "wajib" in agent.tool_add_watch(c, "", "Dago")["error"]


def test_draft_whatsapp(conn):
    oid = org(conn, "Agensi Kita")
    insert_report(conn, oid, report())
    conn.execute("INSERT INTO org_settings (org_id, offer) VALUES (%s, 'pembuatan website UMKM mulai Rp1 juta')", (oid,))
    c, _ = ctx(oid, org_name="Agensi Kita")
    res = agent.tool_draft_whatsapp(c, "p1")
    assert res["business"] == "Kopi Kecil" and res["whatsapp"] == "https://wa.me/6281318911529" and res["note"] is None
    d = res["draft"]
    assert "Agensi Kita" in d and "4.7" in d and "120" in d and "website dan akun Instagram" in d and "—" not in d
    assert "Kami bantu pembuatan website UMKM mulai Rp1 juta." in d and res["offer_used"].startswith("pembuatan")
    res = agent.tool_draft_whatsapp(c, "p2", offer="foto produk")
    assert "Kami bantu foto produk." in res["draft"] and res["whatsapp"] is None and "Cek kontak" in res["note"]
    assert "akun Instagram" not in res["draft"]  # p2 sudah punya website dan IG
    assert "error" in agent.tool_draft_whatsapp(c, "tidak-ada")
    assert "error" in agent.tool_draft_whatsapp(ctx(org(conn))[0], "p1")  # org lain
