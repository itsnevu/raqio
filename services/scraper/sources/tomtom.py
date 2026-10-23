"""
sources/tomtom.py, TomTom Search API (POI Search). Butuh TOMTOM_API_KEY (kuota gratis harian, tanpa kartu kredit).
Memberi nama, kategori, telepon, website, alamat, koordinat; tanpa rating.
"""
import os
from urllib.parse import quote

import netutil

KEY_ENV = "TOMTOM_API_KEY"
URL = "https://api.tomtom.com/search/2/poiSearch/{q}.json"
LAST_NOTE = ""


def to_record(x):
    poi, pos = x.get("poi") or {}, x.get("position") or {}
    name = poi.get("name")
    if not name or not x.get("id"):
        return None
    return {"source": "tomtom", "source_id": f"tomtom:{x['id']}", "place_id": f"tomtom:{x['id']}", "name": name,
            "category": ", ".join(poi.get("categories") or [])[:80], "address": (x.get("address") or {}).get("freeformAddress", ""),
            "lat": pos.get("lat"), "lon": pos.get("lon"), "phone": poi.get("phone") or "", "website": poi.get("url") or "",
            "instagram": "", "emails": [], "confidence": 0.8, "closed": False, "src_url": ""}


def fetch(industry, area, center, radius_km, budget_sec=30, log=None):
    global LAST_NOTE
    LAST_NOTE = ""
    key = os.environ.get(KEY_ENV)
    if not key:
        return []
    params = {"key": key, "limit": 100, "countrySet": "ID", "language": "id-ID"}
    q = industry if center else f"{industry} {area}"
    if center:
        params.update(lat=f"{center[0]:.5f}", lon=f"{center[1]:.5f}", radius=int(min(50000, max(500, radius_km * 1000))))
    r = netutil.get(URL.format(q=quote(q)), params=params, timeout=min(20, budget_sec), retries=1)
    if r.status_code != 200:
        raise RuntimeError(f"TomTom HTTP {r.status_code}: {(r.text or '')[:160]}")
    j = r.json()
    out = [rec for rec in (to_record(x) for x in j.get("results") or []) if rec]
    LAST_NOTE = f"{len(out)} hasil"
    return out
