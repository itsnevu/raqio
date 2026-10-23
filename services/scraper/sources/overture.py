"""
sources/overture.py, bisnis dari Overture Maps (theme=places), ditarik langsung dari Parquet publik di S3 dengan DuckDB.

Tanpa kunci API. Satu kotak koordinat ~6x6 km selesai ~15 detik (DuckDB hanya membaca row group yang bbox-nya
beririsan). Rilis terbaru dicari dari katalog STAC Overture (cache 7 hari), bisa dipaksa lewat OVERTURE_RELEASE.
Hasil per kotak di-cache OVERTURE_CACHE_DAYS hari supaya pindaian ulang tidak membaca S3 lagi.
Untuk tes / mode offline, `path` menunjuk berkas Parquet lokal dengan skema yang sama.

Kolom yang dipakai (skema places v2): names.primary, taxonomy.primary (rilis lama: categories.primary), basic_category,
confidence, operating_status, websites, socials, emails, phones, addresses[1], bbox, sources[1].dataset, brand.
"""
import os
import re
import threading

import netutil

DEFAULT_RELEASE = "2026-10-21.0"
S3 = "s3://overturemaps-us-west-2/release/{rel}/theme=places/type=place/*"
STAC = "https://stac.overturemaps.org/catalog.json"
MIN_CONF_ENRICH = float(os.environ.get("OVERTURE_MIN_CONF_ENRICH", "0.3"))  # cukup untuk melengkapi kontak bisnis Maps yang cocok
CACHE_DAYS = int(os.environ.get("OVERTURE_CACHE_DAYS", "14"))
SOCIAL = ("facebook.com", "instagram.com", "tiktok.com", "twitter.com", "x.com", "youtube.com", "linkedin.com", "threads.net",
          "wa.me", "whatsapp.com")
LAST_NOTE = ""

SELECT = """SELECT id, names.primary, {cat}, basic_category, confidence, operating_status, websites, socials, emails, phones,
       addresses[1].freeform, addresses[1].locality, bbox.xmin, bbox.ymin, sources[1].dataset, brand.names.primary
FROM read_parquet('{src}', hive_partitioning=1)
WHERE bbox.xmin BETWEEN ? AND ? AND bbox.ymin BETWEEN ? AND ?"""


def release(log=None):
    """Rilis Overture: env OVERTURE_RELEASE, lalu katalog STAC (cache 7 hari), lalu DEFAULT_RELEASE."""
    from sources import cache_get, cache_set
    env = os.environ.get("OVERTURE_RELEASE")
    if env:
        return env
    cached = cache_get("overture_release")
    if cached:
        return cached
    try:
        d = netutil.get(STAC, timeout=10, retries=1).json()
        rels = [str(l.get("title", "")).split(" ")[0] for l in d.get("links", []) if l.get("rel") == "child"]
        rels = [r for r in rels if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.\d+", r)]
        if rels:
            rel = max(rels)
            cache_set("overture_release", rel, days=7)
            return rel
    except Exception as e:  # noqa: BLE001
        if log:
            log(f"      [overture] katalog rilis gagal, pakai {DEFAULT_RELEASE}: {str(e)[:100]}")
    return DEFAULT_RELEASE


def _sql_path(p):
    return str(p).replace("\\", "/").replace("'", "''")


def query(bbox, rel=None, path=None, budget_sec=120, log=None):
    """Baris mentah dalam bbox (xmin, ymin, xmax, ymax). path = Parquet lokal (tes / ekstrak offline)."""
    import duckdb
    from sources import DATA_DIR
    src = _sql_path(path) if path else S3.format(rel=rel or release(log))
    con = duckdb.connect()
    if not path:
        ext = os.path.join(DATA_DIR, "duckdb_ext")
        os.makedirs(ext, exist_ok=True)
        con.execute(f"SET extension_directory='{_sql_path(ext)}'")
        con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2'; SET http_retries=2;")
    timer = threading.Timer(budget_sec, con.interrupt)
    timer.start()
    params = [bbox[0], bbox[2], bbox[1], bbox[3]]
    try:
        try:
            rows = con.execute(SELECT.format(cat="taxonomy.primary", src=src), params).fetchall()
        except duckdb.BinderException as e:
            if "taxonomy" not in str(e):
                raise
            rows = con.execute(SELECT.format(cat="categories.primary", src=src), params).fetchall()  # skema rilis lama
    finally:
        timer.cancel()
        con.close()
    return rows


def to_record(row):
    """Baris DuckDB -> record sumber (lihat sources.__init__). None kalau tanpa nama."""
    (id_, name, cat, basic, conf, status, websites, socials, emails, phones, addr, loc, lon, lat, ds, brand) = row
    if not name:
        return None
    web, ig = "", ""
    for u in list(websites or []) + list(socials or []):
        ul = str(u).lower()
        if "instagram.com/" in ul:
            ig = ig or str(u)
        elif not web and not any(s in ul for s in SOCIAL):
            web = str(u)
    fb = next((str(s) for s in (socials or []) if "facebook.com" in str(s)), "")
    return {"source": "overture", "source_id": f"overture:{id_}", "place_id": f"overture:{id_}", "name": str(name),
            "category": str(cat or basic or "").replace("_", " "), "address": ", ".join(x for x in (addr, loc) if x),
            "lat": lat, "lon": lon, "phone": str((phones or [""])[0] or ""), "website": web, "instagram": ig,
            "emails": [str(e) for e in (emails or []) if e][:3],
            "confidence": round(float(conf), 2) if conf is not None else None,
            "closed": status == "permanently_closed", "src_url": fb, "dataset": str(ds or ""), "brand": str(brand or "")}


def fetch(industry, area, center, radius_km, budget_sec=120, log=None, path=None):
    """Semua tempat dalam kotak koordinat (relevansi kategori disaring pemanggil). Tanpa center = tidak bisa (butuh
    koordinat dari hasil Maps)."""
    global LAST_NOTE
    from sources import bbox_of, cache_get, cache_set
    LAST_NOTE = ""
    if not center:
        LAST_NOTE = "tanpa koordinat hasil Maps"
        return []
    bbox = bbox_of(center, radius_km)
    rel = None if path else release(log)
    key = f"overture|{rel}|{bbox}"
    rows = None if path else cache_get(key)
    if rows is None:
        rows = query(bbox, rel=rel, path=path, budget_sec=budget_sec, log=log)
        rows = [list(r) for r in rows]
        if not path:
            cache_set(key, rows, days=CACHE_DAYS)
    else:
        LAST_NOTE = "dari cache"
    out = []
    for r in rows:
        rec = to_record(r)
        if not rec or rec["closed"] or (rec["confidence"] is not None and rec["confidence"] < MIN_CONF_ENRICH):
            continue
        out.append(rec)
    LAST_NOTE = (LAST_NOTE + ", " if LAST_NOTE else "") + f"rilis {rel or 'lokal'}, {len(rows)} tempat di kotak"
    return out
