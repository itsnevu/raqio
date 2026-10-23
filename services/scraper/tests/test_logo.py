"""Tes pencarian logo tanpa jaringan: fetch_safe dipalsukan, gambar dibuat dengan Pillow."""
import io

from PIL import Image

import logo


def png_bytes(w=200, h=120, color=(255, 176, 32, 255), flat=False):
    """Gambar uji. Default ada bidang gelap di separuh kiri supaya tidak dianggap gambar polos; flat=True = satu warna."""
    im = Image.new("RGBA", (w, h), color)
    if not flat:
        im.paste((20, 20, 20, 255), (0, 0, max(1, w // 2), h))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


class FakeResp:
    def __init__(self, url, status=200, headers=None, body=b"", truncated=False):
        self.url, self.status_code, self.headers, self.content, self.truncated = url, status, headers or {}, body, truncated


def test_candidates_prioritas_touch_icon_icon_og_favicon():
    html = """<html><head>
      <meta property="og:image" content="/og.jpg">
      <link rel="icon" sizes="32x32" href="/fav32.png">
      <link rel="apple-touch-icon" sizes="180x180" href="https://cdn.x.id/touch.png">
      <link rel="shortcut icon" href="favicon.ico">
    </head></html>"""
    got = logo.candidates_from_html(html, "https://kopi.id/menu/")
    assert got[0] == "https://cdn.x.id/touch.png"
    assert got[1] == "https://kopi.id/fav32.png"
    assert "https://kopi.id/og.jpg" in got
    assert got[-1] == "https://kopi.id/favicon.ico"


def test_to_png_perkecil_dan_tolak_bukan_gambar():
    out = logo.to_png(png_bytes(400, 200))
    im = Image.open(io.BytesIO(out))
    assert im.size == (logo.SIZE, logo.SIZE) and im.format == "PNG"
    assert logo.to_png(b"<html>bukan gambar</html>") is None
    assert logo.to_png(png_bytes(8, 8)) is None  # terlalu kecil


def test_from_website_memakai_kandidat_pertama_yang_valid(monkeypatch):
    calls = []

    def fake_fetch(url, timeout=15, max_bytes=0, max_redirects=3, headers=None):
        calls.append(url)
        if url == "https://kopi.id":
            return FakeResp(url, body=b'<link rel="apple-touch-icon" href="/touch.png"><link rel="icon" href="/fav.png">', headers={"content-type": "text/html"})
        if url.endswith("/touch.png"):
            return FakeResp(url, status=404)
        if url.endswith("/fav.png"):
            return FakeResp(url, body=png_bytes(), headers={"content-type": "image/png"})
        return FakeResp(url, status=404)

    monkeypatch.setattr(logo.netutil, "fetch_safe", fake_fetch)
    got = logo.from_website("https://kopi.id")
    assert got is not None and got[1] == "website"
    assert Image.open(io.BytesIO(got[0])).size == (logo.SIZE, logo.SIZE)
    assert calls[:3] == ["https://kopi.id", "https://kopi.id/touch.png", "https://kopi.id/fav.png"]


def test_from_website_gagal_total_mengembalikan_none(monkeypatch):
    monkeypatch.setattr(logo.netutil, "fetch_safe", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("putus")))
    assert logo.from_website("https://mati.id") is None
    assert logo.find_logo({"name": "x"}) is None  # tanpa website dan IG tidak ada yang diambil


def test_from_instagram_memakai_cache_profil(monkeypatch, tmp_path):
    import json

    import datastore
    db = tmp_path / "ig.db"
    conn = datastore.connect_sqlite(str(db))
    conn.execute("CREATE TABLE profiles (username TEXT, data TEXT)")
    conn.execute("INSERT INTO profiles VALUES (?, ?)", ("kopi.a", json.dumps({"profile_pic": "https://cdn.ig/kopi.jpg"})))
    conn.commit()
    conn.close()
    monkeypatch.setenv("RAQIO_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(logo.netutil, "fetch_safe", lambda url, **k: FakeResp(url, body=png_bytes(), headers={"content-type": "image/jpeg"}))
    got = logo.from_instagram("@Kopi.A")
    assert got is not None and got[1] == "instagram"
    assert logo.ig_profile_pic_url("tidak.ada") is None


class FakePg:
    """Koneksi Postgres palsu: mencatat upsert, menjawab known_keys dari yang sudah disimpan."""

    def __init__(self, known=(), hashes=None):
        self.known = set(known)
        self.stored = []
        self.generic = set()
        self.deleted = []
        self.hashes = dict(hashes or {})  # key -> phash yang "sudah tersimpan"

    def execute(self, sql, params=None):
        fake = self
        if sql.startswith("SELECT key FROM business_logos"):
            class R:
                def fetchall(self_inner):
                    return [(k,) for k in params[0] if k in fake.known]
            return R()
        if sql.startswith("INSERT INTO business_logos"):
            self.stored.append(params)
            self.known.add(params[0])
            return None
        if sql.startswith("SELECT 1 FROM logo_generic"):
            class R1:
                def fetchone(self_inner):
                    return (1,) if params[0] in fake.generic else None
            return R1()
        if sql.startswith("SELECT count(DISTINCT key) FROM business_logos"):
            class R2:
                def fetchone(self_inner):
                    return (sum(1 for k, h in fake.hashes.items() if h == params[0] and k != params[1]),)
            return R2()
        if sql.lstrip().startswith("INSERT INTO logo_generic"):
            self.generic.add(params[0])
            return None
        if sql.startswith("DELETE FROM business_logos WHERE phash"):
            self.deleted.append(params[0])
            return None
        raise AssertionError(sql)


def test_enrich_report_menandai_yang_ada_dan_mengunduh_sisanya(monkeypatch):
    monkeypatch.setattr(logo, "find_logo", lambda biz, timeout=8: (b"png", "website") if biz.get("website") else None)
    rep = {"all": [
        {"place_id": "a", "name": "A", "website": "https://a.id"},
        {"place_id": "b", "name": "B"},                      # tanpa sumber
        {"place_id": "c", "name": "C", "website": "https://c.id"},
    ]}
    conn = FakePg(known=["c"])
    beats = []
    marked, downloaded = logo.enrich_report(conn, rep, heartbeat=lambda: beats.append(1))
    assert (marked, downloaded) == (1, 1)
    assert rep["all"][0]["logo_key"] == "a" and rep["all"][2]["logo_key"] == "c" and "logo_key" not in rep["all"][1]
    assert conn.stored[0][0] == "a" and beats == [1]


def test_enrich_report_hormati_batas_dan_stop(monkeypatch):
    monkeypatch.setattr(logo, "find_logo", lambda biz, timeout=8: (b"png", "website"))
    rep = {"all": [{"place_id": str(i), "website": "https://x.id"} for i in range(5)]}
    conn = FakePg()
    assert logo.enrich_report(conn, rep, limit=2) == (0, 2)
    conn2 = FakePg()
    assert logo.enrich_report(conn2, rep, should_stop=lambda: True) == (0, 0)


def test_enrich_one(monkeypatch):
    monkeypatch.setattr(logo, "find_logo", lambda biz, timeout=8: (b"png", "instagram"))
    conn = FakePg()
    biz = {"place_id": "z", "name": "Z", "instagram": "z"}
    assert logo.enrich_one(conn, biz) is True and biz["logo_key"] == "z" and conn.stored[0][1] == "instagram"
    assert logo.enrich_one(conn, {"name": "tanpa kunci"}) is False


def test_host_kind():
    assert logo.host_kind("https://linktr.ee/salonx") == "linkhub"
    assert logo.host_kind("https://www.instagram.com/salonx") == "social"
    assert logo.host_kind("https://wa.me/628123") == "social"
    assert logo.host_kind("https://salonx.co.id/") == "site"
    assert logo.host_kind("https://sub.bio.link/x") == "linkhub"


def test_linkhub_hanya_gambar_profil_bukan_favicon(monkeypatch):
    """Linktree: favicon = asterisk hijau platform, harus dilewati; og:image = foto profil bisnis, itu yang dipakai."""
    fetched = []

    def fake_fetch(url, timeout=15, max_bytes=0, max_redirects=3, headers=None):
        fetched.append(url)
        if url == "https://linktr.ee/salonx":
            return FakeResp(url, body=b'<link rel="icon" href="/favicon.png"><meta property="og:image" content="https://ugc.linktr.ee/p.jpg">',
                            headers={"content-type": "text/html"})
        if url.endswith("p.jpg"):
            return FakeResp(url, body=png_bytes(), headers={"content-type": "image/jpeg"})
        return FakeResp(url, body=png_bytes(), headers={"content-type": "image/png"})

    monkeypatch.setattr(logo.netutil, "fetch_safe", fake_fetch)
    got = logo.from_website("https://linktr.ee/salonx")
    assert got and got[1] == "linkhub"
    assert all("favicon" not in u for u in fetched)


def test_social_dilewati(monkeypatch):
    monkeypatch.setattr(logo.netutil, "fetch_safe", lambda *a, **k: (_ for _ in ()).throw(AssertionError("tidak boleh fetch")))
    assert logo.from_website("https://www.instagram.com/salonx") is None
    assert logo.from_website("https://wa.me/62812") is None


def test_to_png_tolak_terlalu_kecil_dan_polos():
    assert logo.to_png(png_bytes(16, 16)) is None            # favicon 16 px
    assert logo.to_png(png_bytes(200, 200, (40, 40, 40, 255), flat=True)) is None  # satu warna
    assert logo.to_png(png_bytes(120, 120)) is not None


def test_store_logo_menolak_gambar_generik():
    png = logo.to_png(png_bytes(120, 120))
    h = logo.phash(png)
    conn = FakePg(hashes={"a": h, "b": h})           # dua bisnis lain sudah memakai gambar yang sama
    assert logo.store_logo(conn, "c", png, "website") is False
    assert h in conn.generic and conn.deleted == [h] and conn.stored == []
    conn2 = FakePg(hashes={"a": h})                  # baru satu: masih boleh
    assert logo.store_logo(conn2, "c", png, "website") is True
    assert conn2.stored[0][0] == "c" and conn2.stored[0][3] == h
    conn3 = FakePg(); conn3.generic.add(h)           # sudah diblokir
    assert logo.store_logo(conn3, "d", png, "website") is False


def test_enrich_report_menyalin_logo_key_ke_leaders(monkeypatch):
    monkeypatch.setattr(logo, "find_logo", lambda biz, timeout=8: (b"png", "website"))
    rep = {"all": [{"place_id": "a", "name": "A", "website": "https://a.id"}],
           "leaders": [{"place_id": "a", "name": "A"}], "gems": [{"place_id": "zz", "name": "Z", "logo_key": "basi"}]}
    logo.enrich_report(rep, rep) if False else None
    conn = FakePg()
    logo.enrich_report(conn, rep)
    assert rep["leaders"][0]["logo_key"] == "a"
    assert "logo_key" not in rep["gems"][0]
