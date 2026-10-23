"""
sources/places_api.py, Google Places API (New) Text Search: jalur resmi (sesuai ToS) untuk data Google Maps.

Butuh GOOGLE_PLACES_API_KEY. Field kontak (website, telepon) masuk SKU Enterprise yang kuota gratisnya 1.000
permintaan/bulan; satu riset memakai maksimal PLACES_API_MAX_PAGES (default 3) permintaan (20 hasil per halaman).
Rating dan jumlah ulasan dari sini dianggap setara Google Maps (on_maps=True), jadi bisnis yang luput dari scraping
tetap ikut peringkat.
"""
import os

import netutil

KEY_ENV = "GOOGLE_PLACES_API_KEY"
URL = "https://places.googleapis.com/v1/places:searchText"
FIELDS = ("places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,"
          "places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.primaryType,"
          "places.primaryTypeDisplayName,places.businessStatus,places.googleMapsUri,nextPageToken")
MAX_PAGES = int(os.environ.get("PLACES_API_MAX_PAGES", "3"))
LAST_NOTE = ""


def to_record(p):
    name = (p.get("displayName") or {}).get("text")
    if not name or not p.get("id"):
        return None
    loc = p.get("location") or {}
    cat = (p.get("primaryTypeDisplayName") or {}).get("text") or (p.get("primaryType") or "").replace("_", " ")
    return {"source": "places_api", "source_id": f"gplaces:{p['id']}", "place_id": f"gplaces:{p['id']}", "name": name,
            "category": cat, "address": p.get("formattedAddress") or "", "lat": loc.get("latitude"), "lon": loc.get("longitude"),
            "phone": p.get("internationalPhoneNumber") or p.get("nationalPhoneNumber") or "", "website": p.get("websiteUri") or "",
            "instagram": "", "emails": [], "rating": p.get("rating"), "reviews": p.get("userRatingCount") or 0,
            "maps_url": p.get("googleMapsUri") or "", "on_maps": True, "confidence": 1.0,
            "closed": p.get("businessStatus") in ("CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"),
            "src_url": p.get("googleMapsUri") or ""}


def fetch(industry, area, center, radius_km, budget_sec=40, log=None):
    global LAST_NOTE
    LAST_NOTE = ""
    key = os.environ.get(KEY_ENV)
    if not key:
        return []
    out, token = [], None
    for _ in range(MAX_PAGES):
        body = {"textQuery": f"{industry} {area}", "languageCode": "id", "regionCode": "ID", "pageSize": 20}
        if center:
            body["locationBias"] = {"circle": {"center": {"latitude": center[0], "longitude": center[1]},
                                               "radius": float(min(50000, max(500, radius_km * 1000)))}}
        if token:
            body["pageToken"] = token
        r = netutil.post(URL, json=body, timeout=20, retries=1,
                         headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS, "Content-Type": "application/json"})
        if r.status_code != 200:
            raise RuntimeError(f"Places API HTTP {r.status_code}: {(r.text or '')[:160]}")
        j = r.json()
        out += [rec for rec in (to_record(p) for p in j.get("places") or []) if rec and not rec["closed"]]
        token = j.get("nextPageToken")
        if not token:
            break
    LAST_NOTE = f"{min(MAX_PAGES, len(out) // 20 + 1)} halaman"
    return out
