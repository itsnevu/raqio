"""Pengerasan worker dan engine: pohon proses anak, batas waktu per tahap, deteksi blokir Maps, pagar outreach,
bom gambar, lokasi file data. Semua tanpa jaringan dan tanpa Postgres."""
import importlib
import os
import smtplib
import struct
import subprocess
import time
import zlib

import pytest

import procutil


def _alive(pid):
    """Proses masih ada (zombie di Linux dihitung sudah mati: sudah dibunuh, tinggal dituai init)."""
    if os.name == "nt":
        out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"], capture_output=True, text=True).stdout
        return str(pid) in out
    try:
        with open(f"/proc/{pid}/status", encoding="utf-8") as f:
            return not any(line.startswith("State:") and "Z" in line.split(":", 1)[1] for line in f)
    except FileNotFoundError:
        return False
    except OSError:
        try:
            os.kill(pid, 0)
        except OSError:
            return False
        return True


# ---------- procutil ----------

def test_cli_value_menyaring_opsi_dan_pemisah():
    assert procutil.cli_value("--industry") == "industry"
    assert procutil.cli_value(" -salon ") == "salon"
    assert procutil.cli_value("a;b\nc") == "a b c"
    assert procutil.cli_value(None) == "" and len(procutil.cli_value("x" * 500, 60)) == 60


def test_child_env_tanpa_rahasia(monkeypatch):
    monkeypatch.setenv("SMTP_PASS", "r")
    monkeypatch.setenv("AUTH_SECRET", "s")
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    env = procutil.child_env({"DATABASE_URL": "pg"})
    assert "SMTP_PASS" not in env and "AUTH_SECRET" not in env
    assert env["OPENROUTER_API_KEY"] == "k" and env["DATABASE_URL"] == "pg" and env["PYTHONUTF8"] == "1"


def test_kill_tree_mematikan_cucu(tmp_path):
    script = tmp_path / "induk.py"
    script.write_text(
        "import subprocess, sys, time\n"
        "p = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(120)'])\n"
        "print('CUCU', p.pid, flush=True)\n"
        "time.sleep(120)\n", encoding="utf-8")
    proc = procutil.popen(str(script), [], cwd=str(tmp_path))
    line = proc.stdout.readline()
    assert line.startswith("CUCU"), line
    cucu = int(line.split()[1])
    assert _alive(cucu)
    t0 = time.time()
    procutil.kill_tree(proc, grace=2)
    assert proc.poll() is not None and time.time() - t0 < 30
    for _ in range(50):
        if not _alive(cucu):
            break
        time.sleep(0.2)
    assert not _alive(cucu), "cucu (Chromium pada kasus nyata) harus ikut mati"


# ---------- netutil ----------

def test_request_tidak_tidur_setelah_percobaan_terakhir(monkeypatch):
    import netutil
    sleeps = []

    def boom(*a, **k):
        raise ConnectionError("x")
    monkeypatch.setattr(netutil.time, "sleep", sleeps.append)
    monkeypatch.setattr(netutil.creq, "request", boom)
    with pytest.raises(ConnectionError):
        netutil.request("GET", "https://contoh.com", retries=3)
    assert sleeps == [2, 4]  # dua jeda untuk tiga percobaan


def test_pinned_session_memakai_resolve(monkeypatch):
    import netutil
    seen = {}

    class S:
        def __init__(self, **kw):
            seen.update(kw)
    monkeypatch.setattr(netutil.creq, "Session", S)
    netutil.pinned_session("contoh.com", 443, ["1.2.3.4", "5.6.7.8"])
    assert seen["curl_options"][netutil.CurlOpt.RESOLVE] == ["contoh.com:443:1.2.3.4,5.6.7.8"]


# ---------- outreach ----------

def test_outreach_post_json_dipin_ke_ip(monkeypatch):
    import netutil
    import outreach
    calls = {}

    class R:
        status_code, text = 200, "ok"

    class Sess:
        def post(self, url, **kw):
            calls["url"] = url
            return R()

        def close(self):
            calls["closed"] = True

    def pinned(host, port, ips):
        calls["pin"] = (host, port, ips)
        return Sess()
    monkeypatch.setattr(netutil, "safe_url", lambda u: ("https://gw.contoh.com/send", "gw.contoh.com", 443, ["93.184.216.34"]))
    monkeypatch.setattr(netutil, "pinned_session", pinned)
    assert outreach._post_json("https://gw.contoh.com/send", {}, {"a": 1}) == (200, "ok")
    assert calls["pin"] == ("gw.contoh.com", 443, ["93.184.216.34"]) and calls["closed"] and calls["url"].startswith("https://gw.")


class _SMTP:
    made = []
    sent = None

    def __init__(self, *a, **k):
        _SMTP.made.append((type(self).__name__, a))
        self.tls = True

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def starttls(self):
        if not self.tls:
            raise smtplib.SMTPNotSupportedError("no")

    def login(self, u, p):
        pass

    def sendmail(self, f, t, m):
        _SMTP.sent = (f, t)


class _NoTLS(_SMTP):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.tls = False


def test_send_email_validasi_alamat_dan_tls(monkeypatch):
    import outreach
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("SMTP_USER", "u")
    monkeypatch.setenv("SMTP_PASS", "p")
    monkeypatch.delenv("SMTP_PORT", raising=False)
    monkeypatch.delenv("SMTP_ALLOW_PLAIN", raising=False)
    for bad in ("bukan email", "a@b.id\r\nRCPT TO:<x@y.id>", "a@b.id, c@d.id", ""):
        with pytest.raises(outreach.SendError):
            outreach.send_email(bad, "s", "b", smtp_factory=_SMTP)
    with pytest.raises(outreach.SendError) as e:
        outreach.send_email("a@b.id", "s", "b", smtp_factory=_NoTLS)
    assert "STARTTLS" in str(e.value) and "belum diatur" in str(e.value)  # dijeda kampanye seperti SMTP_HOST kosong
    monkeypatch.setenv("SMTP_ALLOW_PLAIN", "1")
    outreach.send_email("a@b.id", "s", "b", smtp_factory=_NoTLS)  # relay internal diizinkan eksplisit
    assert _SMTP.sent[1] == ["a@b.id"]
    # port 465 = TLS implisit (SMTP_SSL), STARTTLS tidak dipanggil
    monkeypatch.delenv("SMTP_ALLOW_PLAIN")
    monkeypatch.setenv("SMTP_PORT", "465")
    monkeypatch.setattr(smtplib, "SMTP_SSL", _SMTP)
    monkeypatch.setattr(smtplib, "SMTP", _NoTLS)
    _SMTP.made.clear()
    outreach.send_email("a@b.id", "s", "b")
    assert _SMTP.made and _SMTP.made[0][0] == "_SMTP" and _SMTP.made[0][1][:2] == ("smtp.test", 465)


def test_unsub_token_butuh_secret(monkeypatch):
    import outreach
    monkeypatch.delenv("AUTH_SECRET", raising=False)
    with pytest.raises(outreach.SendError, match="AUTH_SECRET"):
        outreach.unsub_token(None, "org", "a@b.id")


def test_run_campaign_pemutus_arus(monkeypatch):
    import outreach
    from test_outreach import FakePg
    monkeypatch.setattr(outreach, "MAX_CONSEC_FAIL", 3)
    monkeypatch.setattr(outreach.time, "sleep", lambda s: None)

    def boom(to, msg, sender):
        raise outreach.SendError("gateway fonnte membalas 502: bad gateway")
    monkeypatch.setattr(outreach, "send_whatsapp", boom)
    recs = [{"id": i, "name": f"R{i}", "to_addr": f"62811{i}", "rendered": "x", "status": "pending", "lead_key": f"k{i}"}
            for i in range(1, 6)]
    conn = FakePg(recs)
    job = {"id": 9, "org_id": "org"}
    st, res, err = outreach.run_campaign(conn, job, {"campaign_id": 5, "channel": "whatsapp", "sender": {"wa_provider": "fonnte", "wa_gateway_token": "T"}},
                                         heartbeat=lambda: None, should_stop=lambda: False, log=lambda t: None)
    assert st == "failed" and "berturut-turut" in err and not job.get("permanent")  # transien: retry job melanjutkan
    assert res["failed"] == 3 and conn.campaign_status == "paused"
    assert [r["status"] for r in recs] == ["failed"] * 3 + ["pending"] * 2  # sisanya menunggu retry


# ---------- gmaps ----------

def test_gmaps_blocked_dan_tautan_maps():
    import gmaps

    class Loc:
        def __init__(self, n):
            self.n = n

        def count(self):
            return self.n

    class Page:
        def __init__(self, url, captcha=0, text=0):
            self.url, self.c, self.t = url, captcha, text

        def locator(self, sel):
            return Loc(self.c)

        def get_by_text(self, s):
            return Loc(self.t)
    assert gmaps.blocked(Page("https://www.google.com/sorry/index?continue=https://www.google.com/maps"))
    assert gmaps.blocked(Page("https://www.google.com/maps/search/x", captcha=1))
    assert gmaps.blocked(Page("https://www.google.com/maps/search/x", text=1))
    assert not gmaps.blocked(Page("https://www.google.com/maps/search/x"))
    assert gmaps.is_maps_url("https://www.google.com/maps/place/Kopi/data=!4m2") and gmaps.is_maps_url("https://maps.google.com/?cid=1")
    assert not gmaps.is_maps_url("https://evil.example/maps/") and not gmaps.is_maps_url(None)
    assert issubclass(gmaps.Blocked, RuntimeError)


def test_detail_business_tautan_bukan_maps_permanen(monkeypatch):
    import market
    monkeypatch.setattr(market.gmaps, "details", lambda places, limit=1, headless=True: places[0].update({"_detail_error": "bukan tautan Google Maps"}))
    with pytest.raises(market.PermanentError, match="tidak bisa dicek"):
        market.detail_business({"name": "x", "maps_url": "https://evil.example/maps/"})


# ---------- market: batas waktu cari IG ----------

def test_find_instagram_batas_waktu(monkeypatch):
    import competitor_website_monitor as cwm
    import market

    class Clock:
        t = 0.0

        @classmethod
        def time(cls):
            return cls.t

        @classmethod
        def sleep(cls, s):
            cls.t += 100
    calls = []

    def scan(url, timeout=15, contact_pages=True):
        calls.append((url, timeout))
        return {"ig_links": ["akun_" + url[-1]]}
    monkeypatch.setattr(market, "time", Clock)
    monkeypatch.setattr(cwm, "scan", scan)
    places = [{"name": str(i), "website": f"https://w{i}.id/{i}"} for i in range(5)]
    market.find_instagram(places, budget_sec=150)
    assert len(calls) == 2 and all(t == 8 for _, t in calls)  # detik 0 dan 100 dicek; detik 200 > 150 berhenti
    assert places[0]["instagram"] == "akun_0" and places[0]["ig_src"] == "website" and "instagram" not in places[3]


def test_scan_halaman_kontak_hanya_kalau_perlu(monkeypatch):
    import competitor_website_monitor as cwm
    import netutil
    pages, calls = {}, []

    def fetch_safe(url, timeout=15, **k):
        calls.append((url, timeout))
        body = pages.get(url, "")
        return netutil.SafeResponse(url, 200 if url in pages else 404, {"content-type": "text/html"}, body.encode(), False)
    monkeypatch.setattr(netutil, "fetch_safe", fetch_safe)
    pages["https://a.id/"] = "<html><a href='https://instagram.com/kopi_a'>ig</a> hubungi: halo@a.id</html>"
    d = cwm.scan("https://a.id/", timeout=9)
    assert d["emails"] == ["halo@a.id"] and d["ig_links"] == ["kopi_a"] and calls == [("https://a.id/", 9)]
    calls.clear()
    pages["https://b.id/"] = "<html>tanpa email</html>"
    pages["https://b.id/kontak"] = "email: cs@b.id"
    d = cwm.scan("https://b.id/", timeout=9)
    assert d["emails"] == ["cs@b.id"]
    assert [u for u, _ in calls] == ["https://b.id/", "https://b.id/contact", "https://b.id/kontak"]  # berhenti di yang pertama memuat email
    assert all(t == 8 for _, t in calls[1:])
    assert cwm.scan("https://b.id/", timeout=9, contact_pages=False)["emails"] == []


# ---------- logo: bom dekompresi ----------

def test_logo_tolak_gambar_raksasa_sebelum_didekode():
    import logo

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    # PNG dengan header 30000x30000 (900 juta piksel): ditolak dari ukuran header, tidak pernah didekode
    ihdr = struct.pack(">IIBBBBB", 30000, 30000, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"\x00" * 10)) + chunk(b"IEND", b"")
    assert logo.to_png(png) is None
    assert logo.MAX_PIXELS <= 20_000_000


# ---------- worker ----------

def _rep(area):
    return {"industry": "kopi", "area": area, "created": "2026-01-01T00:00:00+00:00", "all": [],
            "summary": {"businesses": 10, "avg_rating": 4.5, "median_reviews": 10, "total_reviews": 100, "top3_share": 30},
            "digital": {"website": 40, "whatsapp": 50}}


def test_worker_compare_batas_waktu_simpan_parsial(monkeypatch):
    import worker
    from test_worker import FakeConn, _write_out
    seen = {}

    def fake_run(conn, jid, args, timeout=None):
        seen["timeout"] = timeout
        _write_out(args, {"mode": "compare", "partial": True, "areas": [{"area": "A", "ok": True, "report_id": 1, "report": _rep("A")}]})
        return "[1/5] ...\n", -15, "timeout"
    monkeypatch.setattr(worker, "run_market_cmd", fake_run)
    conn = FakeConn()
    status, result, err = worker.do_market_compare(conn, {"id": 1, "org_id": "o", "params": {"industry": "kopi", "areas": ["A", "B", "C"]}})
    assert seen["timeout"] == worker.JOB_TIMEOUT * 3  # batas job diskalakan per wilayah
    assert status == "done"
    res = result.fn(conn)
    assert [a["area"] for a in res["areas"]] == ["A"] and [f["area"] for f in res["failed"]] == ["B", "C"]
    assert "batas waktu" in res["failed"][0]["error"]
    # tanpa hasil parsial sama sekali: tetap gagal transien
    monkeypatch.setattr(worker, "run_market_cmd", lambda c, j, a, timeout=None: ("", -15, "timeout"))
    status, _, err = worker.do_market_compare(FakeConn(), {"id": 1, "org_id": "o", "params": {"industry": "kopi", "areas": ["A"]}})
    assert status == "failed" and "batas waktu" in err


def test_worker_parameter_riset_tidak_valid_permanen():
    import worker
    from test_worker import FakeConn
    job = {"id": 1, "org_id": "o", "params": {"industry": "", "area": "x"}}
    st, _, err = worker.do_market_run(FakeConn(), job)
    assert st == "failed" and job["permanent"] and worker.is_permanent(err)
    job = {"id": 1, "org_id": "o", "params": {"industry": "kopi", "areas": ["---"]}}
    st, _, err = worker.do_market_compare(FakeConn(), job)
    assert st == "failed" and job["permanent"]


def test_worker_argumen_subprocess_disaring(monkeypatch):
    import worker
    from test_worker import FakeConn
    seen = {}

    def fake_run(conn, jid, args, timeout=None):
        seen["args"] = args
        return "", 1, False
    monkeypatch.setattr(worker, "run_market_cmd", fake_run)
    worker.do_market_run(FakeConn(), {"id": 1, "org_id": "o", "params": {"industry": "--help", "area": "kemang;dago\n"}})
    assert seen["args"][:4] == ["--industry", "help", "--area", "kemang dago"]


# ---------- lokasi file data ----------

def test_pipeline_db_di_data_dir_dan_filter_osm(monkeypatch, tmp_path):
    import pipeline
    monkeypatch.setenv("RAQIO_DATA_DIR", str(tmp_path))
    p = importlib.reload(pipeline)
    try:
        assert p.DB == os.path.join(str(tmp_path), "ig.db")
        assert p.osm_filters("shop=clothes") == ['"shop"="clothes"']
        assert p.osm_filters('shop"]["x=y') == ['"shopx"="y"']  # kutip/kurung dibuang, query Overpass tidak bisa disisipi
        with pytest.raises(SystemExit):
            p.osm_filters('"=')
    finally:
        monkeypatch.delenv("RAQIO_DATA_DIR")
        importlib.reload(pipeline)


def test_ig_scraper_state_file_di_data_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("RAQIO_DATA_DIR", str(tmp_path))
    import ig_scraper
    m = importlib.reload(ig_scraper)
    try:
        assert m.CFG["state_file"] == os.path.join(str(tmp_path), "ig_state.json")
        assert m.CFG["db_path"] == os.path.join(str(tmp_path), "ig.db")
    finally:
        monkeypatch.delenv("RAQIO_DATA_DIR")
        importlib.reload(ig_scraper)
