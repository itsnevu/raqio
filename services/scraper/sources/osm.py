"""
sources/osm.py, bisnis dari OpenStreetMap lewat Overpass API (lisensi ODbL, atribusi "© OpenStreetMap contributors").

Filter OSM diturunkan dari industri: kelompok industri (datastore.industry_group) -> kategori pipeline.CATEGORIES,
ditambah pencarian nama dengan token industri. Server Overpass publik sering sibuk (502/406/timeout), jadi dicoba
beberapa mirror dengan batas waktu ketat dan hasil di-cache 7 hari per (filter, titik, radius).
"""
import hashlib
import time

import datastore
import netutil

MIRRORS = ("https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
           "https://overpass.kumi.systems/api/interpreter")
UA = {"User-Agent": "raqio-market-research/0.1 (+https://raqio.id; riset pasar UMKM)", "Accept": "application/json"}
# kelompok industri -> kategori pipeline.CATEGORIES (string atau beberapa)
GROUP_TO_OSM = {"coffee": ["cafe"], "salon": ["salon", "beauty"], "restaurant": ["restaurant", "fast_food"], "gym": ["gym"],
                "laundry": ["laundry"], "bakery": ["bakery"], "clinic": ["clinic"], "dentist": ["dentist"],
                "printing": ["printing"], "property": ["property"], "software": ["it_software"], "agency": ["agency"]}
TAG_KEYS = ("shop", "amenity", "office", "craft", "healthcare", "leisure", "tourism")
TAG_LABEL = {"hairdresser": "salon rambut", "beauty": "salon kecantikan", "cafe": "kafe", "coffee_shop": "kedai kopi",
             "restaurant": "restoran", "fast_food": "makanan cepat saji", "bakery": "toko roti", "clothes": "toko pakaian",
             "fitness_centre": "pusat kebugaran", "laundry": "laundry", "dry_cleaning": "laundry", "pharmacy": "apotek",
             "clinic": "klinik", "dentist": "dokter gigi", "doctors": "praktik dokter", "copyshop": "percetakan / fotokopi",
             "printer": "percetakan", "estate_agent": "agen properti", "advertising_agency": "agen periklanan",
             "marketing": "agen pemasaran", "it": "perusahaan IT", "company": "perusahaan", "car_repair": "bengkel mobil",
             "motorcycle_repair": "bengkel motor", "pet": "toko hewan", "veterinary": "dokter hewan", "school": "sekolah",
             "language_school": "kursus bahasa", "furniture": "toko furnitur", "electronics": "toko elektronik",
             "mobile_phone": "toko ponsel", "computer": "toko komputer", "supermarket": "supermarket",
             "convenience": "minimarket", "hotel": "hotel", "coworking_space": "coworking", "lawyer": "kantor hukum",
             "accountant": "akuntan", "tax_advisor": "konsultan pajak", "consulting": "konsultan", "massage": "pijat",
             "tattoo": "studio tato", "nail_salon": "salon kuku", "barber": "barbershop", "cosmetics": "toko kosmetik"}
LAST_NOTE = ""


def filters_for(industry):
    """Daftar filter Overpass untuk industri (lihat pipeline.osm_filters)."""
    from pipeline import osm_filters
    group = datastore.industry_group(industry)
    out = []
    for cat in GROUP_TO_OSM.get(group, []):
        out += osm_filters(cat)
    toks = [t for t in datastore.industry_tokens(industry) if len(t) >= 3]
    if toks:
        out += osm_filters("keyword:" + "|".join(toks))
    seen, uniq = set(), []
    for f in out:
        if f not in seen:
            seen.add(f)
            uniq.append(f)
    return uniq


def build_query(filters, center, radius_m, timeout=40):
    lat, lon = center
    parts = "".join(f"nwr[{f}][name](around:{int(radius_m)},{lat:.5f},{lon:.5f});" for f in filters)
    return f"[out:json][timeout:{timeout}];({parts});out center tags;"


def category_of(tags):
    for k in TAG_KEYS:
        v = tags.get(k)
        if v and v not in ("yes", "no"):
            v = v.split(";")[0].strip()
            return TAG_LABEL.get(v, v.replace("_", " "))
    return ""


def to_record(e):
    t = e.get("tags") or {}
    name = t.get("name") or t.get("brand")
    if not name:
        return None
    lat = e.get("lat") if e.get("lat") is not None else (e.get("center") or {}).get("lat")
    lon = e.get("lon") if e.get("lon") is not None else (e.get("center") or {}).get("lon")
    phone = t.get("phone") or t.get("contact:phone") or t.get("contact:mobile") or t.get("contact:whatsapp") or ""
    ig = t.get("contact:instagram") or t.get("instagram") or ""
    street = " ".join(x for x in (t.get("addr:street"), t.get("addr:housenumber")) if x)
    closed = any(k.startswith(("disused:", "abandoned:")) for k in t) or t.get("opening_hours") == "off"
    oid = f"{e.get('type')}/{e.get('id')}"
    return {"source": "osm", "source_id": f"osm:{oid}", "place_id": f"osm:{oid}", "name": name, "category": category_of(t),
            "address": street or t.get("addr:full") or t.get("addr:city") or "", "lat": lat, "lon": lon, "phone": phone.split(";")[0],
            "website": t.get("website") or t.get("contact:website") or t.get("url") or "", "instagram": ig.split(";")[0],
            "emails": [x for x in (t.get("email") or t.get("contact:email") or "").split(";") if "@" in x][:2],
            "confidence": None, "closed": closed, "src_url": f"https://www.openstreetmap.org/{oid}"}


def fetch(industry, area, center, radius_km, budget_sec=90, log=None):
    """Elemen OSM bernama dengan tag kategori yang cocok di sekitar center. Tanpa center = kosong."""
    global LAST_NOTE
    from sources import cache_get, cache_set
    LAST_NOTE = ""
    if not center:
        LAST_NOTE = "tanpa koordinat hasil Maps"
        return []
    filters = filters_for(industry)
    if not filters:
        LAST_NOTE = "tidak ada filter OSM untuk industri ini"
        return []
    radius_m = min(max(int(radius_km * 1000), 500), 15000)
    key = "osm|" + hashlib.sha1(f"{filters}|{center[0]:.3f},{center[1]:.3f}|{radius_m}".encode()).hexdigest()
    cached = cache_get(key)
    if cached is not None:
        LAST_NOTE = "dari cache"
        return [r for r in (to_record(e) for e in cached) if r]
    t0 = time.time()
    elements, errors = None, []
    for server in MIRRORS:
        left = budget_sec - (time.time() - t0)
        if left < 8:
            break
        q = build_query(filters, center, radius_m, timeout=int(min(25, left - 3)))
        try:
            r = netutil.post(server, data={"data": q}, headers=UA, timeout=min(30, left), retries=1)
            if r.status_code == 200 and r.text.lstrip().startswith("{"):
                elements = r.json().get("elements", [])
                break
            errors.append(f"{server.split('/')[2]} HTTP {r.status_code}")
        except Exception as e:  # noqa: BLE001
            errors.append(f"{server.split('/')[2]} {type(e).__name__}")
    if elements is None:
        raise RuntimeError("semua server Overpass sibuk: " + "; ".join(errors)[:200])
    cache_set(key, elements, days=7)
    LAST_NOTE = f"{len(filters)} filter, radius {radius_m} m"
    return [r for r in (to_record(e) for e in elements) if r]

