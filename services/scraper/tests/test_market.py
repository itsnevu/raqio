import pytest

import market


def biz(**kw):
    base = {"_detailed": True, "name": "Kopi Kecil", "rating": 4.7, "reviews": 120,
            "phone": "081318911529", "maps_url": "https://maps.google.com/?cid=1"}
    return {**base, **kw}


def test_lead_score_belum_detail():
    assert market.lead_score({"name": "x", "reviews": 10}) == (None, [])


def test_lead_score_prospek_ideal_tinggi():
    s, why = market.lead_score(biz())
    assert s >= 80
    assert "bisa WhatsApp" in why and "tanpa website" in why


def test_lead_score_pemain_besar_dan_cabang_rendah():
    ideal, _ = market.lead_score(biz())
    big, why = market.lead_score(biz(reviews=3000))
    chain, why2 = market.lead_score(biz(branches_in_area=3))
    assert big < ideal and "pemain besar" in why
    assert chain < ideal and "jaringan bercabang" in why2


def test_lead_score_sudah_digital_lebih_rendah():
    no_gap, _ = market.lead_score(biz(website="https://a.com", instagram="kopikecil"))
    gap, _ = market.lead_score(biz())
    assert no_gap < gap


def test_lead_score_tanpa_kontak_dibatasi():
    s, why = market.lead_score(biz(phone=None))
    assert s <= 20 and "tidak ada kontak" in why


def test_lead_score_rentang():
    for p in (biz(), biz(reviews=5000, branches_in_area=9, rating=3.0), biz(emails=["a@b.co"])):
        s, _ = market.lead_score(p)
        assert 0 <= s <= 100


def test_build_report_ranking_dan_prospek():
    places = [biz(place_id=str(i), name=f"Kopi {i}", reviews=r, rating=4.6)
              for i, r in enumerate([2000, 500, 100, 40, 10])]
    rep = market.score_all(market.build_report("coffee shop", "Kemang", places))
    s = rep["summary"]
    assert s["businesses"] == 5 and s["total_reviews"] == 2650
    assert rep["leaders"][0]["name"] == "Kopi 0"
    assert all("lead_score" in p for p in rep["all"])
    assert all(p["name"] != "Kopi 0" for p in rep["prospects"])  # >800 ulasan bukan prospek
    scores = [p["score"] for p in rep["prospects"]]
    assert scores == sorted(scores, reverse=True)


def test_leaders_rata_rata_tertimbang_bukan_ulasan_mentah():
    # raksasa 4.2 x 3000 ulasan tidak boleh teratas melawan 4.8 x 400; standarnya tercantum di report["standards"]
    places = ([biz(place_id="g", name="Raksasa", rating=4.2, reviews=3000),
               biz(place_id="b", name="Bagus", rating=4.8, reviews=400)]
              + [biz(place_id=str(i), name=f"Kecil {i}", rating=4.5, reviews=20 + i) for i in range(5)])
    rep = market.build_report("kopi", "A", places)
    assert rep["standards"]["version"] == 3 and "Bayesian" in rep["standards"]["leaders"] and "Overture" in rep["standards"]["sources"]
    names = [p["name"] for p in rep["leaders"]]
    assert names[0] == "Bagus" and rep["leaders"][0]["rank"] == 1
    assert names.index("Raksasa") > names.index("Bagus")
    assert all(p.get("power_score") for p in rep["leaders"])
    assert any("rata-rata tertimbang" in i for i in rep["insights"])


def test_compare_reports_skor_peluang():
    def r(n, rev):
        return {"created": "2026-01-01T00:00:00+00:00",
                "summary": {"businesses": n, "avg_rating": 4.5, "median_reviews": 10, "total_reviews": rev,
                            "top3_share": 30},
                "digital": {"website": 40, "whatsapp": 50}}
    res = market.compare_reports("kopi", [("A", 1, r(10, 5000)), ("B", 2, r(50, 1000))])
    assert [a["area"] for a in res["areas"]] == ["A", "B"]  # A: sedikit pemain, permintaan tinggi
    assert res["areas"][0]["opportunity"] > res["areas"][1]["opportunity"]


def test_rebuild_sections_setelah_cek_kontak():
    rep = market.score_all(market.build_report("kopi", "A", [
        {"place_id": "1", "name": "Kopi Satu", "rating": 4.7, "reviews": 120, "maps_url": "m1"},
        biz(place_id="2", name="Besar", reviews=5000)]))
    rep["summary"]["capped"] = True
    rep["data_quality"] = {"raw": 2}
    assert [p["name"] for p in rep["prospects"]] == []  # belum ada yang detail dan layak
    rep["all"][1].update({"phone": "6281318911529", "_detailed": True})  # "Kopi Satu" (urut review: Besar dulu)
    out = market.rebuild_sections(rep)
    assert out is rep and rep["summary"]["capped"] is True and rep["data_quality"] == {"raw": 2}
    assert [p["name"] for p in rep["prospects"]] == ["Kopi Satu"]
    assert rep["leaders"][1]["whatsapp"].startswith("https://wa.me/") and rep["digital"]["whatsapp"] == 100  # 2 dari 2 sampel
    assert rep["all"][1]["lead_score"] >= 80 and rep["summary"]["businesses"] == 2


def test_compare_reports_wilayah_gagal_dicatat():
    def r(n):
        return {"created": "2026-01-01T00:00:00+00:00", "summary": {"businesses": n, "avg_rating": 4.5,
                "median_reviews": 10, "total_reviews": 100, "top3_share": 30}, "digital": {"website": 40, "whatsapp": 50}}
    res = market.compare_reports("kopi", [("A", 11, r(10)), ("C", 12, r(50))], failed=[{"area": "B", "error": "kosong"}])
    assert [a["area"] for a in res["areas"]] == ["A", "C"] and res["areas"][0]["report_id"] == 11
    assert res["failed"] == [{"area": "B", "error": "kosong"}]
    assert any("B (kosong)" in i for i in res["insights"])
    semua = market.compare_reports("kopi", [], failed=[{"area": "B", "error": "kosong"}])
    assert semua["areas"] == [] and "B" in semua["insights"][0]


def test_purge_cache_hapus_yang_lama(tmp_path, monkeypatch):
    import json
    monkeypatch.setattr(market, "DB", str(tmp_path / "t.db"))
    conn = market.db()
    assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    conn.execute("INSERT INTO places VALUES (?,?,?,?)", ("lama", "{}", "[]", "2020-01-01T00:00:00+00:00"))
    conn.execute("INSERT INTO places VALUES (?,?,?,?)", ("baru", "{}", "[]", "2999-01-01T00:00:00+00:00"))
    conn.execute("INSERT INTO market_reports (industry, area, created, report) VALUES (?,?,?,?)",
                 ("kopi", "A", "2020-01-01T00:00:00+00:00", json.dumps({})))
    conn.execute("INSERT INTO market_reports (industry, area, created, report) VALUES (?,?,?,?)",
                 ("kopi", "B", "2999-01-01T00:00:00+00:00", json.dumps({})))
    conn.commit(); conn.close()
    assert market.purge_cache(90) == (1, 1)
    assert market.purge_cache(0) == (0, 0)  # 0 = retensi dimatikan
    conn = market.db()
    assert [r[0] for r in conn.execute("SELECT place_id FROM places")] == ["baru"]
    assert [r[0] for r in conn.execute("SELECT area FROM market_reports")] == ["B"]
    conn.close()


def test_main_out_file_dan_exit_code_permanen(tmp_path, monkeypatch):
    import json
    import sys
    monkeypatch.setattr(market, "DB", str(tmp_path / "t.db"))
    monkeypatch.setattr(market.gmaps, "search", lambda q, max_results=80, headless=True: [])
    out = tmp_path / "out.json"
    monkeypatch.setattr(sys, "argv", ["market.py", "--industry", "kopi", "--area", "Nowhere", "--out", str(out)])
    with pytest.raises(SystemExit) as e:
        market.main()
    assert e.value.code == 2
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["permanent"] and "Tidak ada hasil" in data["error"]
    # mode compare: semua wilayah gagal permanen -> exit 2, tiap wilayah tercatat di file
    monkeypatch.setattr(sys, "argv", ["market.py", "--industry", "kopi", "--areas", "X;Y", "--reuse-days", "0", "--out", str(out)])
    with pytest.raises(SystemExit) as e:
        market.main()
    assert e.value.code == 2
    data = json.loads(out.read_text(encoding="utf-8"))
    assert [a["area"] for a in data["areas"]] == ["X", "Y"] and all(not a["ok"] and a["permanent"] for a in data["areas"])
    assert data["compare"]["areas"] == [] and len(data["compare"]["failed"]) == 2


def test_main_compare_satu_wilayah_transien_tetap_selesai(tmp_path, monkeypatch, capsys):
    import json
    import sys
    monkeypatch.setattr(market, "DB", str(tmp_path / "t.db"))

    def fake_run(industry, area, max_results=120, detail_limit=30, **kw):
        if area == "B":
            raise TimeoutError("browser macet")
        rep = market.build_report(industry, area, [biz(place_id=area)])
        return 1, rep
    monkeypatch.setattr(market, "run", fake_run)
    out = tmp_path / "out.json"
    monkeypatch.setattr(sys, "argv", ["market.py", "--industry", "kopi", "--areas", "A;B;C", "--reuse-days", "0", "--out", str(out)])
    market.main()  # tidak exit: ada wilayah yang berhasil
    data = json.loads(out.read_text(encoding="utf-8"))
    assert [(a["area"], a["ok"]) for a in data["areas"]] == [("A", True), ("B", False), ("C", True)]
    assert data["areas"][1]["permanent"] is False and "TimeoutError" in data["areas"][1]["error"]
    assert "COMPARE_DONE" not in capsys.readouterr().out  # ditulis lewat logging, bukan stdout


# ---------- cek kontak satu bisnis: detail_business dan mode --detail (subprocess untuk worker) ----------

def test_detail_business_normalisasi_dan_skor(monkeypatch):
    def fake_details(places, limit=1, headless=True):
        places[0].update({"phone": "0813-1891 1529", "website": "https://Kopi.id/?utm_source=x", "_detailed": True})
    monkeypatch.setattr(market.gmaps, "details", fake_details)
    monkeypatch.setattr(market, "find_instagram", lambda places, limit=25: None)
    b = market.detail_business({"place_id": "p1", "name": "Kopi Kecil", "rating": 4.7, "reviews": 120, "maps_url": "m"})
    assert b["phone"] == "6281318911529" and b["whatsapp"] == "https://wa.me/6281318911529"
    assert b["website"] == "https://kopi.id" and b["_detailed"] is True and b["lead_score"] >= 60


def test_detail_business_maps_tidak_merespons(monkeypatch):
    monkeypatch.setattr(market.gmaps, "details", lambda places, limit=1, headless=True: None)
    with pytest.raises(RuntimeError, match="tidak merespons"):
        market.detail_business({"name": "x", "maps_url": "m"})
    with pytest.raises(market.PermanentError):
        market.detail_business({"name": "tanpa maps_url"})


def test_main_detail_menulis_out_dan_cache_tempat(tmp_path, monkeypatch):
    import json
    import sys
    rep = {"all": [{"place_id": "p1", "name": "Kopi Kecil", "rating": 4.7, "reviews": 120, "maps_url": "m"}]}
    monkeypatch.setattr(market, "load_report_pg", lambda rid: rep if rid == 7 else None)
    monkeypatch.setattr(market.gmaps, "details",
                        lambda places, limit=1, headless=True: places[0].update({"phone": "081318911529", "_detailed": True}))
    monkeypatch.setattr(market, "DB", str(tmp_path / "t.db"))
    conn = market.db()
    conn.execute("INSERT INTO places VALUES (?,?,?,?)", ("p1", json.dumps({"name": "Kopi Kecil"}), "[]", "2026-01-01"))
    conn.commit(); conn.close()
    out = tmp_path / "out.json"
    monkeypatch.setattr(sys, "argv", ["market.py", "--detail", "--report", "7", "--key", "p1", "--out", str(out)])
    market.main()
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["mode"] == "detail" and data["report_id"] == 7 and data["key"] == "p1"
    assert data["business"]["phone"] == "6281318911529" and data["business"]["_detailed"] is True
    assert data["business"]["whatsapp"] == "https://wa.me/6281318911529" and data["business"]["lead_score"] >= 80
    conn = market.db()
    cached = json.loads(conn.execute("SELECT data FROM places WHERE place_id='p1'").fetchone()[0])
    conn.close()
    assert cached["phone"] == "6281318911529" and cached["_detailed"] is True
    # bisnis tidak ada -> exit 2 (permanen), begitu juga laporan tidak ada
    for args in (["--report", "7", "--key", "zzz"], ["--report", "8", "--key", "p1"]):
        monkeypatch.setattr(sys, "argv", ["market.py", "--detail", *args, "--out", str(out)])
        with pytest.raises(SystemExit) as e:
            market.main()
        assert e.value.code == 2 and json.loads(out.read_text(encoding="utf-8"))["permanent"] is True
    # Maps tidak merespons -> transien: exception dilempar, file out berisi error tanpa permanent
    monkeypatch.setattr(market.gmaps, "details", lambda places, limit=1, headless=True: None)
    monkeypatch.setattr(sys, "argv", ["market.py", "--detail", "--report", "7", "--key", "p1", "--out", str(out)])
    with pytest.raises(RuntimeError):
        market.main()
    assert json.loads(out.read_text(encoding="utf-8"))["permanent"] is False
    # tanpa --industry di mode biasa tetap ditolak argparse (exit 2)
    monkeypatch.setattr(sys, "argv", ["market.py", "--area", "x"])
    with pytest.raises(SystemExit) as e:
        market.main()
    assert e.value.code == 2
