"""
sources, sumber data bisnis selain hasil scraping Google Maps. Semua adapter mengembalikan record dengan skema yang
sama, lalu market.py menggabungkannya (dedupe) dengan hasil Maps:

  overture    Overture Maps Foundation (lisensi CDLA-Permissive 2.0): gabungan data Meta (halaman Facebook bisnis),
              Microsoft, Foursquare, AllThePlaces, dll. Ada telepon, website, Instagram, email, alamat, kategori, dan
              skor keyakinan. Ditarik langsung dari Parquet di S3 lewat DuckDB (tanpa kunci, ~15 detik per wilayah),
              di-cache per kotak koordinat.
  osm         OpenStreetMap lewat Overpass (ODbL): nama, kategori, telepon, website, contact:instagram. Server publik
              sering sibuk: beberapa mirror, batas waktu ketat, cache.
  places_api  Google Places API (New), resmi sesuai ToS; butuh GOOGLE_PLACES_API_KEY (kuota gratis bulanan).
              Rating dan jumlah ulasan dari sini setara Google Maps.
  tomtom      TomTom Search API; butuh TOMTOM_API_KEY (kuota gratis harian).

Skema record (semua kunci ada, kosong = ""/None/[]):
  source, source_id, place_id ("<sumber>:<id>"), name, category (teks terbaca), address, lat, lon, phone (62xxx),
  website, instagram (handle), emails, confidence (0..1 atau None), closed (bool), src_url (halaman asal),
  sources ([nama sumber]), on_maps (True hanya untuk Places API), rating/reviews/maps_url (Places API saja).

Aturan validitas (collect + validate_standalone), supaya yang masuk laporan nyata dan bisa dicek:
  1. Kategori harus relevan dengan industri (aturan kata kunci + token industri; tanpa pengaman "hampir semua
     terbuang" karena kotak koordinat memuat semua jenis usaha).
  2. Bisnis yang cocok dengan hasil Maps hanya MELENGKAPI kontak yang kosong; asal tiap kontak dicatat di src_fields.
  3. Bisnis yang hanya ada di sumber lain dihitung kalau: tidak ditandai tutup, keyakinan >= MIN_CONF (sumber yang
     punya skor), punya minimal satu kontak (telepon/website/IG) dan, kalau kontaknya website, website itu hidup
     (GET lewat fetch_safe). Mereka tidak ikut peringkat (tidak ada rating) dan ditandai "belum ada di Google Maps".
Env: MARKET_SOURCES (default "overture,osm"; places_api dan tomtom ikut aktif kalau kuncinya ada; "none" mematikan),
SOURCES_BUDGET_SEC (default 240 total), VERIFY_WEB_BUDGET_SEC (default 60).
"""
import json
import os
import statistics
import time
from datetime import datetime, timedelta, timezone

import datastore
import netutil

DATA_DIR = os.environ.get("RAQIO_DATA_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(DATA_DIR, "ig.db")
DEFAULT_SOURCES = ("overture", "osm")
OPTIONAL_WITH_KEY = {"places_api": "GOOGLE_PLACES_API_KEY", "tomtom": "TOMTOM_API_KEY"}
BUDGET_SEC = int(os.environ.get("SOURCES_BUDGET_SEC", "240"))
PER_SOURCE_SEC = {"overture": 150, "osm": 60, "places_api": 40, "tomtom": 30}
VERIFY_WEB_BUDGET_SEC = int(os.environ.get("VERIFY_WEB_BUDGET_SEC", "60"))
VERIFY_WEB_MAX = 25
MIN_CONF = float(os.environ.get("SOURCES_MIN_CONF", "0.5"))
LABEL = {"maps": "Google Maps", "overture": "Overture Maps (Meta, Microsoft, Foursquare)", "osm": "OpenStreetMap",
         "places_api": "Google Places API", "tomtom": "TomTom"}
RECORD_KEYS = ("source", "source_id", "place_id", "name", "category", "address", "lat", "lon", "phone", "website",
               "instagram", "emails", "confidence", "closed", "src_url", "sources", "on_maps")


def enabled(override=None):
    """Daftar adapter aktif, urut. override: list/str dari CLI; None = env MARKET_SOURCES + kunci yang tersedia."""
    if override is not None:
        raw = override if isinstance(override, str) else ",".join(override)
    else:
        raw = os.environ.get("MARKET_SOURCES", ",".join(DEFAULT_SOURCES))
        for name, key in OPTIONAL_WITH_KEY.items():
            if os.environ.get(key) and name not in raw:
                raw += "," + name
    names = [n.strip().lower() for n in raw.split(",") if n.strip()]
    if "none" in names:
        return []
    out = []
    for n in names:
        if n in ("overture", "osm", "places_api", "tomtom") and n not in out:
            out.append(n)
    return out


def adapter(name):
    import importlib
    return importlib.import_module(f"sources.{name}")


# ---------- cache kecil di SQLite (kotak koordinat Overture, hasil Overpass, rilis Overture) ----------

def _conn():
    conn = datastore.connect_sqlite(DB)
    conn.execute("CREATE TABLE IF NOT EXISTS source_cache (k TEXT PRIMARY KEY, v TEXT, exp TEXT)")
    return conn


def cache_get(key):
    try:
        conn = _conn()
        try:
            row = conn.execute("SELECT v, exp FROM source_cache WHERE k=?", (key,)).fetchone()
        finally:
            conn.close()
    except Exception:  # noqa: BLE001 (cache gagal = anggap kosong)
        return None
    if not row or (row[1] and row[1] < datetime.now(timezone.utc).isoformat()):
        return None
    try:
        return json.loads(row[0])
    except ValueError:
        return None


def cache_set(key, value, days=7):
    try:
        conn = _conn()
        try:
            exp = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
            conn.execute("INSERT OR REPLACE INTO source_cache VALUES (?,?,?)", (key, json.dumps(value, ensure_ascii=False), exp))
            conn.commit()
        finally:
            conn.close()
    except Exception:  # noqa: BLE001
        pass


# ---------- geometri wilayah dari hasil Maps ----------

def center_radius(places, min_km=1.5, max_km=8.0):
    """(lat, lon) median hasil Maps dan radius km = 2.5x jarak median (dibatasi min..max). None kalau tanpa koordinat."""
    pts = [(p["lat"], p["lon"]) for p in places if p.get("lat") is not None and p.get("lon") is not None]
    if len(pts) < 3:
        return None, min_km
    center = (statistics.median(x[0] for x in pts), statistics.median(x[1] for x in pts))
    dists = sorted(datastore.haversine_km(center, x) for x in pts)
    radius = min(max(dists[len(dists) // 2] * 2.5, min_km), max_km)
    return center, round(radius, 2)


def bbox_of(center, radius_km):
    """(xmin, ymin, xmax, ymax) derajat untuk lingkaran radius km di sekitar center."""
    import math
    lat, lon = center
    dlat = radius_km / 111.0
    dlon = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.2))
    return (round(lon - dlon, 4), round(lat - dlat, 4), round(lon + dlon, 4), round(lat + dlat, 4))


# ---------- normalisasi + relevansi ----------

def normalize(rec, source):
    """Record adapter -> skema seragam, kontak dinormalkan seperti datastore (telepon 62xxx, website tanpa tracking,
    handle IG). None kalau nama kosong."""
    name = datastore.clean_text(rec.get("name"))
    if len(name) < 2:
        return None
    out = {k: rec.get(k) for k in RECORD_KEYS}
    out.update(source=source, name=name, sources=[source], on_maps=bool(rec.get("on_maps")),
               category=datastore.clean_text(rec.get("category") or ""), address=datastore.clean_text(rec.get("address") or ""),
               phone=datastore.norm_phone(rec.get("phone") or ""), website=datastore.norm_url(rec.get("website") or ""),
               instagram=datastore.norm_ig(rec.get("instagram") or ""), emails=list(rec.get("emails") or [])[:3],
               closed=bool(rec.get("closed")), src_url=rec.get("src_url") or "")
    if "instagram.com/" in out["website"] and not out["instagram"]:
        out["instagram"], out["website"] = datastore.norm_ig(out["website"]), ""
    for k in ("rating", "reviews", "maps_url"):
        if rec.get(k) not in (None, "", 0):
            out[k] = rec[k]
    for k in ("lat", "lon"):
        try:
            out[k] = float(out[k]) if out[k] is not None else None
        except (TypeError, ValueError):
            out[k] = None
    out["source_id"] = out.get("source_id") or f"{source}:{out['name'].lower()}"
    out["place_id"] = out.get("place_id") or out["source_id"]
    return out


def relevant(records, industry):
    """Saring record sumber lain yang kategorinya cocok dengan industri: aturan kata kunci (ID/EN) + token industri,
    'maybe' hanya kalau nama memuat token industri. Tanpa pengaman 25% karena kotak koordinat memuat semua usaha."""
    cats = sorted({r.get("category") or "" for r in records})
    verdicts = datastore.rule_verdicts(industry, cats)
    group = datastore.industry_group(industry)
    words = [w.strip() for w in datastore.INDUSTRY_ALIASES.get(group, [])] + datastore.industry_tokens(industry)
    words = [w for w in words if w]
    kept = []
    for r in records:
        v = verdicts.get(r.get("category") or "", "maybe")
        nm = (r.get("name") or "").lower()
        if v == "yes" or (v == "maybe" and any(w in nm for w in words)):
            r["relevance"] = v
            kept.append(r)
    return kept


# ---------- pengumpul ----------

def collect(industry, area, center, radius_km, log=None, budget_sec=None, override=None):
    """Jalankan adapter aktif berurutan dalam total `budget_sec`. Mengembalikan (records, providers) dengan providers =
    [{name, label, status: ok|empty|skipped|error, found, seconds, note}] untuk ditampilkan di laporan."""
    log = log or (lambda s: None)
    budget_sec = BUDGET_SEC if budget_sec is None else budget_sec
    names = enabled(override)
    out, providers = [], []
    t0 = time.time()
    for name in names:
        left = budget_sec - (time.time() - t0)
        info = {"name": name, "label": LABEL.get(name, name), "status": "skipped", "found": 0, "seconds": 0, "note": ""}
        if left <= 5:
            info["note"] = "jatah waktu sumber habis"
            providers.append(info)
            continue
        if name in OPTIONAL_WITH_KEY and not os.environ.get(OPTIONAL_WITH_KEY[name]):
            info["note"] = f"{OPTIONAL_WITH_KEY[name]} belum diisi"
            providers.append(info)
            continue
        t1 = time.time()
        try:
            mod = adapter(name)
            recs = mod.fetch(industry, area, center, radius_km, budget_sec=min(left, PER_SOURCE_SEC.get(name, 60)), log=log)
            recs = [r for r in (normalize(r, name) for r in recs or []) if r]
            seen, uniq = set(), []
            for r in recs:
                if r["source_id"] in seen:
                    continue
                seen.add(r["source_id"])
                uniq.append(r)
            info.update(status="ok" if uniq else "empty", found=len(uniq), note=getattr(mod, "LAST_NOTE", "") or "")
            out.extend(uniq)
            log(f"      [{name}] {len(uniq)} tempat dalam {time.time() - t1:.0f} detik" + (f" ({info['note']})" if info["note"] else ""))
        except Exception as e:  # noqa: BLE001 (satu sumber gagal tidak menggagalkan riset)
            info.update(status="error", note=f"{type(e).__name__}: {str(e)[:160]}")
            log(f"      [{name}] gagal: {info['note']}")
        info["seconds"] = round(time.time() - t1, 1)
        providers.append(info)
    return out, providers


def validate_standalone(records, log=None, budget_sec=None, max_check=VERIFY_WEB_MAX):
    """Bisnis yang hanya ada di sumber lain: buang yang tutup / keyakinan rendah / tanpa kontak; website dicek hidup
    (web_ok). Mengembalikan (lolos, dibuang, stats{checked, up, down})."""
    log = log or (lambda s: None)
    budget_sec = VERIFY_WEB_BUDGET_SEC if budget_sec is None else budget_sec
    kept, dropped = [], []
    stats = {"checked": 0, "up": 0, "down": 0, "unknown": 0, "dropped_closed": 0, "dropped_conf": 0, "dropped_contact": 0}
    t0 = time.time()
    for r in records:
        if r.get("closed"):
            stats["dropped_closed"] += 1
            dropped.append(r)
            continue
        conf = r.get("confidence")
        if conf is not None and conf < MIN_CONF:
            stats["dropped_conf"] += 1
            dropped.append(r)
            continue
        if r.get("website") and stats["checked"] < max_check and time.time() - t0 < budget_sec:
            stats["checked"] += 1
            r["web_ok"] = website_alive(r["website"])
            stats["up" if r["web_ok"] else "down" if r["web_ok"] is False else "unknown"] += 1
            if r["web_ok"] is False:
                log(f"      website mati: {r.get('name')} ({r['website']})")
        has_contact = r.get("phone") or r.get("instagram") or (r.get("website") and r.get("web_ok") is not False)
        if not has_contact:
            stats["dropped_contact"] += 1
            dropped.append(r)
            continue
        r["_detailed"] = bool(r.get("phone") or r.get("website") or r.get("instagram"))
        if r["_detailed"]:
            r["detail_src"] = r.get("source") or "other"
        if r.get("instagram"):
            r["ig_src"] = r.get("source") or "other"
        r["on_maps"] = False
        r.setdefault("rating", None)
        r.setdefault("reviews", 0)
        kept.append(r)
    return kept, dropped, stats


def website_alive(url, timeout=6):
    """GET lewat pagar fetch_safe. True = 2xx/3xx (hidup); False = 404/410 atau host tidak ada / ditolak pagar (mati);
    None = tidak bisa disimpulkan (401/403/429/5xx = server menolak bot, atau timeout/koneksi putus), bukan bukti tutup."""
    try:
        r = netutil.fetch_safe(url, timeout=timeout, max_bytes=64 * 1024, headers={"Accept": "text/html,*/*;q=0.5"})
    except netutil.UnsafeURL:
        return False
    except Exception:  # noqa: BLE001 (timeout, koneksi putus)
        return None
    st = int(r.status_code)
    if 200 <= st < 400:
        return True
    if st in (404, 410):
        return False
    return None
