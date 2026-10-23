"""Sumber data selain Google Maps (paket sources): adapter dengan jaringan dipalsukan, Overture lewat Parquet lokal
yang dibaca DuckDB sungguhan, penggabungan lintas sumber di datastore, dan laporan market.run dengan bisnis tambahan."""
import json

import duckdb
import pytest

import datastore
import market
import netutil
import sources
from sources import osm, overture, places_api, tomtom


class Resp:
    def __init__(self, status=200, body="", data=None):
        self.status_code, self.text, self._data = status, body if data is None else json.dumps(data), data

    def json(self):
        if self._data is None:
            return json.loads(self.text)
        return self._data


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(sources, "DB", str(tmp_path / "cache.db"))
    monkeypatch.delenv("MARKET_SOURCES", raising=False)
    for k in ("GOOGLE_PLACES_API_KEY", "TOMTOM_API_KEY", "OVERTURE_RELEASE"):
        monkeypatch.delenv(k, raising=False)


# ---------- registri, geometri, normalisasi ----------

def test_enabled_dari_env_dan_kunci(monkeypatch):
    assert sources.enabled() == ["overture", "osm"]
    monkeypatch.setenv("TOMTOM_API_KEY", "k")
    assert sources.enabled() == ["overture", "osm", "tomtom"]
    monkeypatch.setenv("MARKET_SOURCES", "osm, places_api,apa_ini")
    assert sources.enabled() == ["osm", "places_api", "tomtom"]
    assert sources.enabled("none") == [] and sources.enabled("overture") == ["overture"]
    monkeypatch.setenv("MARKET_SOURCES", "none")
    assert sources.enabled() == []


def test_center_radius_dan_bbox():
    pts = [{"lat": -6.24 + i * 0.002, "lon": 106.63 + i * 0.002} for i in range(9)]
    center, r = sources.center_radius(pts)
    assert center == pytest.approx((-6.232, 106.638)) and 1.5 <= r <= 8
    assert sources.center_radius([{"lat": 1, "lon": 2}]) == (None, 1.5)
    xmin, ymin, xmax, ymax = sources.bbox_of((-6.24, 106.63), 2.0)
    assert xmin < 106.63 < xmax and ymin < -6.24 < ymax and round(ymax - ymin, 3) == round(4 / 111, 3)


def test_normalize_dan_relevansi():
    r = sources.normalize({"name": " Havena Salon ", "category": "beauty salon", "phone": "+62 821-6651-0283",
                           "website": "https://www.instagram.com/havenasalonstudio/", "lat": "-6.24", "lon": "106.63",
                           "source_id": "overture:1", "closed": False}, "overture")
    assert r["phone"] == "6282166510283" and r["instagram"] == "havenasalonstudio" and r["website"] == ""
    assert r["sources"] == ["overture"] and r["on_maps"] is False and r["place_id"] == "overture:1" and r["lat"] == -6.24
    assert sources.normalize({"name": "x"}, "osm") is None
    recs = [{"name": "Havena Salon", "category": "beauty salon"}, {"name": "Toko Roti", "category": "bakery"},
            {"name": "Rumah Cantik", "category": ""}, {"name": "Salon Ita", "category": ""}]
    kept = sources.relevant(recs, "salon kecantikan")
    assert [k["name"] for k in kept] == ["Havena Salon", "Salon Ita"]  # kategori cocok, atau tanpa kategori tapi nama memuat token


# ---------- Overture lewat Parquet lokal (DuckDB sungguhan) ----------

def _parquet(tmp_path):
    con = duckdb.connect()
    con.execute("""CREATE TABLE p AS SELECT * FROM (VALUES
      ('a1', {'primary': 'Havena Salon'}, {'primary': 'beauty_salon'}, 'beauty_salon', 0.88, 'open',
       ['https://www.instagram.com/havenasalonstudio/'], ['https://www.facebook.com/103'], NULL::VARCHAR[], ['+6282166510283'],
       [{'freeform': 'Jl. Scientia Blvd No.8', 'locality': 'Tangerang'}], {'xmin': 106.628, 'ymin': -6.243, 'xmax': 106.628, 'ymax': -6.243},
       [{'dataset': 'meta'}], {'names': {'primary': NULL::VARCHAR}}),
      ('a2', {'primary': 'Salon Tutup'}, {'primary': 'hair_salon'}, 'hair_salon', 0.0, 'permanently_closed',
       NULL::VARCHAR[], NULL::VARCHAR[], NULL::VARCHAR[], ['+628111'], NULL::STRUCT(freeform VARCHAR, locality VARCHAR)[],
       {'xmin': 106.629, 'ymin': -6.242, 'xmax': 106.629, 'ymax': -6.242}, [{'dataset': 'meta'}], {'names': {'primary': NULL::VARCHAR}}),
      ('a3', {'primary': 'Ragu Salon'}, {'primary': 'beauty_salon'}, 'beauty_salon', 0.1, NULL::VARCHAR,
       ['https://ragu.id'], NULL::VARCHAR[], NULL::VARCHAR[], NULL::VARCHAR[], NULL::STRUCT(freeform VARCHAR, locality VARCHAR)[],
       {'xmin': 106.63, 'ymin': -6.241, 'xmax': 106.63, 'ymax': -6.241}, [{'dataset': 'meta'}], {'names': {'primary': NULL::VARCHAR}}),
      ('a4', {'primary': 'Kopi Jauh'}, {'primary': 'coffee_shop'}, 'coffee_shop', 0.9, NULL::VARCHAR,
       ['https://kopijauh.id'], NULL::VARCHAR[], ['halo@kopijauh.id'], ['+628222'], NULL::STRUCT(freeform VARCHAR, locality VARCHAR)[],
       {'xmin': 107.6, 'ymin': -6.9, 'xmax': 107.6, 'ymax': -6.9}, [{'dataset': 'Microsoft'}], {'names': {'primary': 'Kopi Jauh'}})
    ) t(id, names, taxonomy, basic_category, confidence, operating_status, websites, socials, emails, phones, addresses, bbox, sources, brand)""")
    f = tmp_path / "places.parquet"
    con.execute(f"COPY p TO '{str(f).replace(chr(92), '/')}' (FORMAT PARQUET)")
    con.close()
    return f


def test_overture_query_parquet_lokal(tmp_path):
    f = _parquet(tmp_path)
    recs = overture.fetch("salon", "gading serpong", (-6.243, 106.628), 2.0, path=str(f))
    names = {r["name"] for r in recs}
    assert names == {"Havena Salon"}  # tutup dan keyakinan 0.1 dibuang; Kopi Jauh di luar kotak
    h = recs[0]
    assert h["instagram"] == "https://www.instagram.com/havenasalonstudio/" and h["website"] == ""  # IG dari websites, bukan website
    assert h["phone"] == "+6282166510283" and h["category"] == "beauty salon" and h["src_url"] == "https://www.facebook.com/103"
    assert h["address"] == "Jl. Scientia Blvd No.8, Tangerang" and h["confidence"] == 0.88 and "lokal" in overture.LAST_NOTE
    # kotak lebar memuat Kopi Jauh
    far = overture.fetch("kopi", "x", (-6.6, 107.1), 80.0, path=str(f))
    assert {r["name"] for r in far} == {"Havena Salon", "Kopi Jauh"}
    kj = next(r for r in far if r["name"] == "Kopi Jauh")
    assert kj["website"] == "https://kopijauh.id" and kj["emails"] == ["halo@kopijauh.id"] and kj["brand"] == "Kopi Jauh"


def test_overture_release_dari_stac(monkeypatch):
    monkeypatch.setattr(netutil, "get", lambda url, **k: Resp(data={"links": [
        {"rel": "child", "title": "2026-09-23.1 Overture Release"}, {"rel": "child", "title": "2026-10-21.0 Overture Release"},
        {"rel": "self", "title": "x"}]}))
    assert overture.release() == "2026-10-21.0"
    monkeypatch.setattr(netutil, "get", lambda url, **k: (_ for _ in ()).throw(RuntimeError("putus")))
    assert overture.release() == "2026-10-21.0"  # dari cache
    monkeypatch.setenv("OVERTURE_RELEASE", "2025-01-01.0")
    assert overture.release() == "2025-01-01.0"


# ---------- OSM / Overpass ----------

def test_osm_filter_query_dan_mirror(monkeypatch):
    filters = osm.filters_for("salon kecantikan")
    assert any("hairdresser" in f for f in filters) and any('"name"~"salon' in f for f in filters)
    q = osm.build_query(filters, (-6.243, 106.628), 2500, timeout=30)
    assert q.startswith("[out:json][timeout:30];(") and "around:2500,-6.24300,106.62800" in q and q.endswith("out center tags;")
    calls = []

    def post(url, **k):
        calls.append(url)
        if len(calls) == 1:
            return Resp(502, "<html>busy</html>")
        return Resp(data={"elements": [
            {"type": "node", "id": 1, "lat": -6.2431, "lon": 106.6281, "tags": {"name": "Salon Ayu", "shop": "hairdresser",
             "phone": "+62 812 3456 7890; +62 21 555", "contact:instagram": "https://instagram.com/salon.ayu", "website": "https://salonayu.id",
             "addr:street": "Jl. Boulevard", "addr:housenumber": "5"}},
            {"type": "way", "id": 2, "center": {"lat": -6.244, "lon": 106.629}, "tags": {"shop": "beauty"}},
            {"type": "node", "id": 3, "lat": -6.245, "lon": 106.63, "tags": {"name": "Bekas Salon", "disused:shop": "hairdresser"}}]})
    monkeypatch.setattr(netutil, "post", post)
    recs = osm.fetch("salon", "x", (-6.243, 106.628), 2.5)
    assert len(calls) == 2 and "private.coffee" in calls[1]  # mirror pertama 502 -> mirror kedua
    assert [r["name"] for r in recs] == ["Salon Ayu", "Bekas Salon"] and recs[1]["closed"] is True
    a = recs[0]
    assert a["category"] == "salon rambut" and a["phone"] == "+62 812 3456 7890" and a["instagram"] == "https://instagram.com/salon.ayu"
    assert a["address"] == "Jl. Boulevard 5" and a["src_url"] == "https://www.openstreetmap.org/node/1" and a["source_id"] == "osm:node/1"
    monkeypatch.setattr(netutil, "post", lambda url, **k: (_ for _ in ()).throw(RuntimeError("tidak boleh dipanggil")))
    assert [r["name"] for r in osm.fetch("salon", "x", (-6.243, 106.628), 2.5)] == ["Salon Ayu", "Bekas Salon"]  # cache
    monkeypatch.setattr(netutil, "post", lambda url, **k: Resp(406, "no"))
    with pytest.raises(RuntimeError, match="Overpass"):
        osm.fetch("salon", "x", (-6.1, 106.8), 2.5)


# ---------- Places API dan TomTom ----------

def test_places_api_halaman_dan_kunci(monkeypatch):
    assert places_api.fetch("salon", "x", None, 2.0) == []  # tanpa kunci
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "k")
    bodies = []

    def post(url, **k):
        bodies.append(k["json"])
        assert k["headers"]["X-Goog-Api-Key"] == "k" and "places.websiteUri" in k["headers"]["X-Goog-FieldMask"]
        if k["json"].get("pageToken"):
            return Resp(data={"places": [{"id": "B", "displayName": {"text": "Salon Dua"}, "businessStatus": "CLOSED_PERMANENTLY"}]})
        return Resp(data={"places": [{"id": "A", "displayName": {"text": "Salon Satu"}, "formattedAddress": "Jl. X", "location": {"latitude": -6.24, "longitude": 106.63},
                                      "rating": 4.6, "userRatingCount": 88, "websiteUri": "https://satu.id", "nationalPhoneNumber": "0812-1111-2222",
                                      "primaryTypeDisplayName": {"text": "Salon kecantikan"}, "businessStatus": "OPERATIONAL",
                                      "googleMapsUri": "https://maps.google.com/?cid=1"}], "nextPageToken": "t2"})
    monkeypatch.setattr(netutil, "post", post)
    recs = places_api.fetch("salon", "gading serpong", (-6.24, 106.63), 2.0)
    assert len(bodies) == 2 and bodies[0]["textQuery"] == "salon gading serpong" and bodies[0]["locationBias"]["circle"]["radius"] == 2000.0
    assert len(recs) == 1 and recs[0]["on_maps"] is True and recs[0]["rating"] == 4.6 and recs[0]["reviews"] == 88
    assert recs[0]["maps_url"] == "https://maps.google.com/?cid=1" and recs[0]["category"] == "Salon kecantikan"
    monkeypatch.setattr(netutil, "post", lambda url, **k: Resp(403, "denied"))
    with pytest.raises(RuntimeError, match="403"):
        places_api.fetch("salon", "x", None, 2.0)


def test_tomtom(monkeypatch):
    assert tomtom.fetch("salon", "x", None, 2.0) == []
    monkeypatch.setenv("TOMTOM_API_KEY", "t")
    seen = {}

    def get(url, **k):
        seen["url"], seen["params"] = url, k["params"]
        return Resp(data={"results": [{"id": "x1", "poi": {"name": "Salon Tiga", "phone": "+62 21 555", "url": "tiga.id", "categories": ["beauty salon"]},
                                        "address": {"freeformAddress": "Jl. Y"}, "position": {"lat": -6.2, "lon": 106.6}}, {"id": "x2", "poi": {}}]})
    monkeypatch.setattr(netutil, "get", get)
    recs = tomtom.fetch("salon", "gading serpong", (-6.24, 106.63), 3.0)
    assert "poiSearch/salon.json" in seen["url"] and seen["params"]["radius"] == 3000 and seen["params"]["countrySet"] == "ID"
    assert len(recs) == 1 and recs[0]["website"] == "tiga.id" and recs[0]["category"] == "beauty salon"


# ---------- pengumpul + validasi ----------

def test_collect_anggaran_dan_error(monkeypatch):
    class Fake:
        LAST_NOTE = "catatan"

        @staticmethod
        def fetch(industry, area, center, radius_km, budget_sec, log):
            return [{"name": "Salon A", "source_id": "f:1"}, {"name": "Salon A", "source_id": "f:1"}, {"name": "", "source_id": "f:2"}]

    class Boom:
        LAST_NOTE = ""

        @staticmethod
        def fetch(*a, **k):
            raise RuntimeError("S3 putus")
    monkeypatch.setattr(sources, "adapter", lambda n: {"overture": Fake, "osm": Boom}[n])
    recs, prov = sources.collect("salon", "x", (-6.2, 106.6), 2.0, override="overture,osm,tomtom")
    assert [r["name"] for r in recs] == ["Salon A"]  # duplikat source_id dan tanpa nama dibuang
    assert [(p["name"], p["status"]) for p in prov] == [("overture", "ok"), ("osm", "error"), ("tomtom", "skipped")]
    assert prov[0]["found"] == 1 and prov[0]["note"] == "catatan" and "S3 putus" in prov[1]["note"] and "TOMTOM_API_KEY" in prov[2]["note"]
    recs, prov = sources.collect("salon", "x", None, 2.0, override="overture", budget_sec=0)
    assert recs == [] and prov[0]["status"] == "skipped" and "jatah" in prov[0]["note"]


def test_validate_standalone(monkeypatch):
    monkeypatch.setattr(sources, "website_alive", lambda url, timeout=6: "hidup" in url)
    recs = [
        {"name": "Tutup", "closed": True, "phone": "628111", "source": "overture"},
        {"name": "Ragu", "confidence": 0.2, "phone": "628111", "source": "overture"},
        {"name": "Tanpa kontak", "confidence": 0.9, "source": "overture"},
        {"name": "Web mati", "confidence": 0.9, "website": "https://mati.id", "source": "overture"},
        {"name": "Web hidup", "confidence": 0.9, "website": "https://hidup.id", "source": "overture"},
        {"name": "Telepon saja", "confidence": None, "phone": "628222", "source": "osm", "instagram": "salonx"},
    ]
    kept, dropped, st = sources.validate_standalone(recs)
    assert [r["name"] for r in kept] == ["Web hidup", "Telepon saja"] and [r["name"] for r in dropped] == ["Tutup", "Ragu", "Tanpa kontak", "Web mati"]
    assert st == {"checked": 2, "up": 1, "down": 1, "unknown": 0, "dropped_closed": 1, "dropped_conf": 1, "dropped_contact": 2}
    assert kept[0]["web_ok"] is True and kept[0]["_detailed"] and kept[0]["detail_src"] == "overture" and kept[0]["on_maps"] is False
    assert kept[1]["ig_src"] == "osm" and kept[1]["rating"] is None and kept[1]["reviews"] == 0


def test_website_alive(monkeypatch):
    codes = {"pindah": 301, "hilang": 404, "tolak": 403, "sibuk": 503}
    monkeypatch.setattr(netutil, "fetch_safe", lambda url, **k: netutil.SafeResponse(url, next(v for key, v in codes.items() if key in url), {}, b"", False))
    assert sources.website_alive("https://pindah.id") is True and sources.website_alive("https://hilang.id") is False
    assert sources.website_alive("https://tolak.id") is None and sources.website_alive("https://sibuk.id") is None  # menolak bot bukan bukti tutup
    monkeypatch.setattr(netutil, "fetch_safe", lambda url, **k: (_ for _ in ()).throw(netutil.UnsafeURL("internal")))
    assert sources.website_alive("http://10.0.0.1/") is False
    monkeypatch.setattr(netutil, "fetch_safe", lambda url, **k: (_ for _ in ()).throw(TimeoutError("lambat")))
    assert sources.website_alive("https://lambat.id") is None
    # website yang tidak bisa disimpulkan tetap dihitung sebagai kontak
    kept, dropped, st = sources.validate_standalone([{"name": "Ragu web", "confidence": 0.9, "website": "https://tolak.id", "source": "osm"}])
    assert kept and kept[0]["web_ok"] is None and st["unknown"] == 1


# ---------- datastore: penggabungan lintas sumber ----------

def test_dedupe_lintas_sumber_melengkapi_kontak():
    maps = {"place_id": "0x1:0x2", "name": "Havena Salon", "name_key": "havena salon", "reviews": 120, "rating": 4.8,
            "lat": -6.2430, "lon": 106.6280, "sources": ["maps"], "on_maps": True}
    ov = {"place_id": "overture:a1", "name": "Havena Salon Studio", "name_key": "havena salon studio", "reviews": 0,
          "lat": -6.2448, "lon": 106.6295, "phone": "6282166510283", "instagram": "havenasalonstudio", "sources": ["overture"],
          "source": "overture", "on_maps": False, "confidence": 0.88}
    other = {"place_id": "overture:b2", "name": "Salon Lain", "name_key": "salon lain", "reviews": 0, "lat": -6.25, "lon": 106.64,
             "phone": "628333", "sources": ["overture"], "source": "overture", "on_maps": False}
    out, merged = datastore.dedupe([maps, ov, other])
    assert merged == 1 and len(out) == 2
    m = next(p for p in out if p["place_id"] == "0x1:0x2")
    assert m["phone"] == "6282166510283" and m["instagram"] == "havenasalonstudio" and m["sources"] == ["maps", "overture"]
    assert m["src_fields"] == {"phone": "overture", "instagram": "overture"} and m["on_maps"] is True and m["confidence"] == 0.88
    assert next(p for p in out if p["place_id"] == "overture:b2")["on_maps"] is False
    # jarak 300 m hanya ditoleransi lintas sumber; dua record Maps sejauh itu tetap dua bisnis
    a = {"place_id": "1", "name": "Kopi A", "name_key": "kopi a", "reviews": 5, "lat": -6.2430, "lon": 106.6280}
    b = {"place_id": "2", "name": "Kopi A", "name_key": "kopi a", "reviews": 5, "lat": -6.2448, "lon": 106.6295}
    assert datastore.dedupe([a, b])[1] == 0
    # IG sama + dekat = bisnis sama walau nama agak beda
    c = {"place_id": "3", "name": "Kopi Sudut Timur", "name_key": "kopi sudut timur", "reviews": 9, "instagram": "kopisudut", "lat": -6.2, "lon": 106.8}
    d = {"place_id": "osm:4", "name": "Kopi Sudut", "name_key": "kopi sudut", "reviews": 0, "instagram": "kopisudut", "lat": -6.2005, "lon": 106.8004,
         "sources": ["osm"], "source": "osm"}
    assert datastore.dedupe([c, d])[1] == 1


# ---------- market.run dengan sumber lain ----------

def test_market_run_gabung_sumber_lain(tmp_path, monkeypatch):
    monkeypatch.setattr(market, "DB", str(tmp_path / "t.db"))
    maps = [{"name": f"Salon {i}", "rating": 4.5, "reviews": 50 + i, "category": "Salon kecantikan", "maps_url": f"https://www.google.com/maps/place/{i}",
             "place_id": f"0x{i}:0x{i}", "lat": -6.243 + i * 0.001, "lon": 106.628 + i * 0.001} for i in range(6)]
    monkeypatch.setattr(market.gmaps, "search", lambda q, max_results=80, headless=True: [dict(m) for m in maps])
    monkeypatch.setattr(market.gmaps, "details", lambda places, limit=1, headless=True, budget_sec=None: None)
    monkeypatch.setattr(market, "find_instagram", lambda places, limit=25: None)
    monkeypatch.setattr(market, "llm_insights", lambda rep: None)
    monkeypatch.setattr(sources, "website_alive", lambda url, timeout=6: True)
    extra = [
        {"name": "Salon 0 Studio", "category": "beauty salon", "source_id": "overture:a", "lat": -6.2432, "lon": 106.6283, "phone": "+62 812-1111-0001", "instagram": "salon0", "confidence": 0.8},
        {"name": "Salon Baru", "category": "beauty salon", "source_id": "overture:b", "lat": -6.25, "lon": 106.64, "website": "https://salonbaru.id", "phone": "+62 812-2222-0002", "confidence": 0.9},
        {"name": "Salon Ragu", "category": "beauty salon", "source_id": "overture:c", "lat": -6.251, "lon": 106.641, "phone": "+62 812-3333-0003", "confidence": 0.2},
        {"name": "Toko Roti", "category": "bakery", "source_id": "osm:node/1", "lat": -6.251, "lon": 106.641, "phone": "+62 812-4444-0004"},
    ]
    providers = [{"name": "overture", "label": "Overture", "status": "ok", "found": 3, "seconds": 2.0, "note": ""},
                 {"name": "osm", "label": "OSM", "status": "ok", "found": 1, "seconds": 1.0, "note": ""}]
    monkeypatch.setattr(sources, "collect", lambda *a, **k: ([sources.normalize(e, e["source_id"].split(":")[0]) for e in extra], providers))
    rid, rep = market.run("salon", "gading serpong", max_results=50, detail_limit=2, use_sources="overture,osm")
    s = rep["sources"]
    assert rep["summary"]["businesses"] == 7 and rep["summary"]["maps_businesses"] == 6 and rep["summary"]["capped"] is False
    assert s["total"] == 7 and s["maps"] == 6 and s["by_source"] == {"maps": 6, "overture": 2} and s["extra_only"] == 1 and s["enriched"] == 1
    assert s["providers"] == providers and s["verify"]["checked"] == 1 and s["verify"]["up"] == 1
    merged = next(p for p in rep["all"] if p["place_id"] == "0x0:0x0")
    assert merged["phone"] == "6281211110001" and merged["instagram"] == "salon0" and merged["src_fields"] == {"phone": "overture", "instagram": "overture"}
    baru = next(p for p in rep["all"] if p["place_id"] == "overture:b")
    assert baru["on_maps"] is False and baru["web_ok"] is True and baru["detail_src"] == "overture" and "rating" not in baru
    pros = next(p for p in rep["prospects"] if p["place_id"] == "overture:b")
    assert pros["gaps"][0] == "tidak muncul di hasil Maps" and "IG tidak ditemukan" in pros["gaps"]
    assert any("tidak muncul di hasil pencarian Google Maps" in i for i in rep["insights"])
    q = rep["data_quality"]
    assert (q["sources_relevant"], q["sources_matched"], q["sources_added"], q["sources_dropped"]) == (3, 1, 1, 1)
    # susun ulang setelah Cek kontak mempertahankan statistik pengumpulan
    market.rebuild_sections(rep)
    assert rep["sources"]["providers"] == providers and rep["sources"]["verify"]["checked"] == 1
    # tanpa sumber lain: laporan murni Maps
    rid2, rep2 = market.run("salon", "gading serpong", max_results=50, detail_limit=2, use_sources="none")
    assert rep2["summary"]["businesses"] == 6 and rep2["sources"]["by_source"] == {"maps": 6} and rep2["sources"]["providers"] == []
