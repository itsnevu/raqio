"""
market.py, engine riset pasar per industri x wilayah.

Sumber: Google Maps (tanpa login) + website bisnis (cari IG) + riwayat scan sebelumnya.

Usage:
  python market.py --industry "coffee shop" --area "Kemang Jakarta" [--out hasil.json]
  python market.py --industry "salon" --area "Dago Bandung" --max 120 --details 40
  python market.py --industry "kopi" --areas "Kemang;Dago" --out hasil.json      # bandingkan wilayah
  python market.py --detail --report <id reports Postgres> --key <place_id> --out hasil.json
Output: tabel market_reports & places di ig.db (cache bersama); laporan milik org ditulis worker.py ke Postgres
dari file --out. Mode --detail membaca laporan dari Postgres (DATABASE_URL), mengambil telepon/website/IG satu
bisnis dari Google Maps, dan menulis {"business": {...}} ke --out (worker yang memperbarui laporan).
"""
import argparse
import json
import logging
import math
import os
import re
import statistics
import sys
import time
from collections import Counter
from datetime import datetime, timedelta, timezone

import datastore
import gmaps
import sources

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("market")

HERE = os.path.dirname(os.path.abspath(__file__))
# folder data (ig.db, state); di Docker diarahkan ke volume lewat RAQIO_DATA_DIR
DATA_DIR = os.environ.get("RAQIO_DATA_DIR", HERE)
DB = os.path.join(DATA_DIR, "ig.db")
IG_RE = re.compile(r"instagram\.com/([A-Za-z0-9_.]{3,30})")
LINK_PAGES = ("linktr.ee", "heylink.me", "linkin.bio", "bio.link", "lynk.id", "msha.ke", "beacons.ai", "s.id")
# batas wilayah mode --areas; worker.py membaca env yang sama supaya konsisten dengan paket
MAX_COMPARE_AREAS = int(os.environ.get("MAX_COMPARE_AREAS", "8"))
# retensi cache SQLite (places, market_reports); kontak bisnis tidak disimpan selamanya
CACHE_RETENTION_DAYS = int(os.environ.get("CACHE_RETENTION_DAYS", "90"))
# batas waktu per tahap supaya satu tahap yang lambat (Maps/website tidak merespons) tidak menghabiskan JOB_TIMEOUT worker:
# detail kontak maksimal 9 menit, cari IG dari website maksimal 2,5 menit; sisanya dilewati, laporan tetap jadi
DETAILS_BUDGET_SEC = int(os.environ.get("DETAILS_BUDGET_SEC", "540"))
FIND_IG_BUDGET_SEC = int(os.environ.get("FIND_IG_BUDGET_SEC", "150"))
# exit code untuk kesalahan input/permanen (tidak perlu diulang worker); argparse juga memakai 2
EXIT_PERMANENT = 2


class PermanentError(RuntimeError):
    """Gagal yang tidak akan berhasil kalau diulang (tidak ada hasil, semua tersaring, input salah)."""


def db():
    conn = datastore.connect_sqlite(DB)
    conn.execute("""CREATE TABLE IF NOT EXISTS places (
        place_id TEXT PRIMARY KEY, data TEXT, history TEXT, last_seen TEXT)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS market_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT, industry TEXT, area TEXT, created TEXT, report TEXT)""")
    return conn


def purge_cache(days=None):
    """Hapus places dan market_reports yang lebih tua dari `days` (default CACHE_RETENTION_DAYS).
    Mengembalikan (places_dihapus, laporan_dihapus). Timestamp ISO UTC dibandingkan sebagai teks."""
    days = CACHE_RETENTION_DAYS if days is None else days
    if days <= 0:
        return 0, 0
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    conn = db()
    try:
        a = conn.execute("DELETE FROM places WHERE last_seen IS NOT NULL AND last_seen < ?", (cutoff,)).rowcount
        b = conn.execute("DELETE FROM market_reports WHERE created IS NOT NULL AND created < ?", (cutoff,)).rowcount
        conn.commit()
    finally:
        conn.close()
    return a, b


def latest_report(conn, industry, area, max_age_days=None):
    row = conn.execute("SELECT id, report, created FROM market_reports WHERE lower(industry)=? AND lower(area)=? "
                       "ORDER BY id DESC LIMIT 1", (industry.lower().strip(), area.lower().strip())).fetchone()
    if not row:
        return None
    if max_age_days is not None:
        age = datetime.now(timezone.utc) - datetime.fromisoformat(row[2])
        if age.total_seconds() > max_age_days * 86400:
            return None
    return row[0], json.loads(row[1])


def compare_reports(industry, found, failed=None):
    """Skor peluang dari laporan yang sudah di tangan. found = [(area, report_id, report)],
    failed = [{"area", "error"}] untuk wilayah yang gagal diriset (dicatat, tidak diganti laporan lain)."""
    rows = []
    for area, rid, r in found:
        s, d = r.get("summary") or {}, r.get("digital") or {}
        n = max(s.get("businesses") or 0, 1)
        rows.append({
            "area": area, "report_id": rid, "created": r.get("created"),
            "businesses": s.get("businesses") or 0, "avg_rating": s.get("avg_rating"),
            "median_reviews": s.get("median_reviews") or 0, "total_reviews": s.get("total_reviews") or 0,
            "reviews_per_business": round((s.get("total_reviews") or 0) / n),
            "top3_share": s.get("top3_share") or 0, "gems": len(r.get("gems") or []), "weak": len(r.get("weak") or []),
            "website_pct": d.get("website") or 0, "whatsapp_pct": d.get("whatsapp") or 0,
            "prospects": len(r.get("prospects") or []), "capped": bool(s.get("capped")),
        })
    failed = [{"area": f.get("area"), "error": str(f.get("error") or "gagal")[:300]} for f in (failed or [])]
    if not rows:
        msg = ["Belum ada laporan untuk wilayah ini."]
        if failed:
            msg = ["Riset gagal di semua wilayah: " + "; ".join(f"{f['area']} ({f['error']})" for f in failed)]
        return {"industry": industry, "areas": [], "failed": failed, "insights": msg}

    def norm(key, invert=False):
        vals = [x[key] or 0 for x in rows]
        lo, hi = min(vals), max(vals)
        for x in rows:
            v = ((x[key] or 0) - lo) / (hi - lo) if hi > lo else 0.5
            x.setdefault("_parts", {})[key] = 1 - v if invert else v

    # peluang = permintaan per pemain tinggi + pemain lebih sedikit + pasar tidak dikuasai + pemain lemah
    norm("reviews_per_business"); norm("businesses", invert=True)
    norm("top3_share", invert=True); norm("weak"); norm("avg_rating", invert=True)
    for x in rows:
        p = x.pop("_parts")
        x["opportunity"] = round(100 * (0.35 * p["reviews_per_business"] + 0.25 * p["businesses"] +
                                        0.15 * p["top3_share"] + 0.15 * p["weak"] + 0.10 * p["avg_rating"]))
    rows.sort(key=lambda x: -x["opportunity"])
    best, crowded = rows[0], max(rows, key=lambda x: x["businesses"])
    insights = [f"Peluang terbesar: {best['area']} (skor {best['opportunity']}), {best['businesses']} pemain, "
                f"±{best['reviews_per_business']} review per bisnis."]
    if crowded["area"] != best["area"]:
        insights.append(f"Paling padat: {crowded['area']} dengan {crowded['businesses']} pemain.")
    low_digital = min(rows, key=lambda x: x["website_pct"])
    insights.append(f"Kematangan digital terendah: {low_digital['area']} ({low_digital['website_pct']}% punya "
                    f"website), target paling empuk untuk jasa digital.")
    capped = [x["area"] for x in rows if x["capped"]]
    if capped:
        insights.append(f"Catatan: jumlah pemain di {', '.join(capped)} mentok di batas pencarian, angka sebenarnya bisa lebih banyak; riset ulang dengan --max lebih besar untuk perbandingan adil.")
    if failed:
        insights.append("Wilayah yang gagal diriset (tidak ikut dibandingkan): "
                        + "; ".join(f"{f['area']} ({f['error']})" for f in failed) + ".")
    insights.append("Skor peluang = permintaan per bisnis (35%) + sedikit pesaing (25%) + pasar tidak dikuasai "
                    "pemain besar (15%) + banyak pemain lemah (15%) + rating rata-rata lebih rendah (10%).")
    return {"industry": industry, "areas": rows, "failed": failed, "insights": insights}


def wa_link(phone: str) -> str:
    d = datastore.norm_phone(phone)
    # hanya nomor HP (62 8xx) yang bisa WhatsApp; telepon kantor tidak
    return f"https://wa.me/{d}" if datastore.is_mobile(d) else ""


# Standar peringkat dan penyaringan yang dipakai laporan, dengan angka eksak. Disimpan di report["standards"]
# supaya UI bisa menunjukkan metodologi dan pengguna tahu persis dasar tiap klaim; naikkan "version" setiap
# aturan berubah supaya laporan lama tetap bisa dibaca dengan standar zamannya.
STANDARDS = {
    "version": 3,
    "sources": "daftar bisnis, rating, ulasan: Google Maps (scraping tanpa login, atau Places API resmi bila kuncinya ada). "
               "Sumber lain (Overture Maps: data Meta/Microsoft/Foursquare; OpenStreetMap; TomTom) hanya MELENGKAPI "
               "kontak bisnis yang cocok (asal tiap kontak dicatat di src_fields) atau MENAMBAH bisnis yang tidak ada di "
               "Maps bila: kategori relevan, tidak tutup, keyakinan >= 0.5, punya kontak, dan website-nya hidup saat dicek. "
               "Bisnis tambahan itu tidak muncul di hasil pencarian Maps (belum punya profil, atau di luar hasil teratas), tanpa rating, tidak ikut peringkat, ditandai on_maps=false.",
    "leaders": "rata-rata tertimbang (Bayesian): skor = v/(v+m)*R + m/(v+m)*C; R = rating bisnis, v = jumlah ulasan, "
               "C = rata-rata rating pasar, m = max(median ulasan pasar, 10). Hanya bisnis ber-rating; "
               "seri diurutkan ulasan terbanyak. Jumlah ulasan mentah TIDAK dipakai sebagai peringkat.",
    "share": "pangsa pasar memakai jumlah ulasan sebagai proxy volume pelanggan; HHI > 2500 = terkonsentrasi, "
             "> 1500 = cukup terkonsentrasi, selainnya terfragmentasi",
    "gems": "rating >= 4.7 dan 15-299 ulasan",
    "weak": "rating < 4.3 dan >= 150 ulasan",
    "growing": "pertumbuhan ulasan/bulan > 0, dihitung dari riwayat pindaian sebelumnya",
    "prospects": "sudah dicek detail, ber-rating, <= 800 ulasan, punya telepon/IG, dan minimal satu celah "
                 "(tanpa website / IG tidak ditemukan / < 100 ulasan / rating < 4.3)",
    "filters": "dibuang sebelum dihitung: tutup permanen/sementara, nama < 2 karakter, di luar 2.5x jarak median "
               "(batas 3-15 km), duplikat digabung, kategori tidak relevan dengan industri",
    "lead_score": {"whatsapp": 25, "telepon": 10, "email": 5, "tanpa_website": 20, "ig_tidak_ditemukan": 15,
                   "rating>=4.5": 15, "rating>=4.0": 8, "ulasan_30_800": 15, "ulasan<30": 5, "tumbuh": 5,
                   "jaringan_bercabang": -25, "ulasan>800": -40, "tanpa_kontak_maks": 20},
}


def power_scores(places):
    """Skor peringkat per bisnis: rata-rata Bayesian, formula sama persis dengan lib/market/power.ts di web
    (satu sumber kebenaran: angka dihitung di sini, web memakai nilai tersimpan). Rating ditarik ke rata-rata
    pasar sampai jumlah ulasannya meyakinkan, supaya 4.9 bintang dari 12 ulasan tidak mengalahkan 4.7 dari 900,
    dan raksasa ber-rating 4.2 tidak jadi "teratas" cuma karena ulasannya banyak."""
    rated = [p for p in places if p.get("rating")]
    if not rated:
        return
    c = statistics.mean(p["rating"] for p in rated)
    m = max(statistics.median((p.get("reviews") or 0) for p in rated), 10)
    for p in rated:
        v = p.get("reviews") or 0
        p["power_score"] = round((v / (v + m)) * p["rating"] + (m / (v + m)) * c, 3)


def lead_score(p):
    """Skor peluang jual 0-100 + alasannya. None kalau detail (telepon/website) belum diambil."""
    if not p.get("_detailed"):
        return None, []
    s, why = 0, []
    rating, reviews = p.get("rating") or 0, p.get("reviews") or 0
    # bisa dihubungi
    if wa_link(p.get("phone")):
        s += 25; why.append("bisa WhatsApp")
    elif p.get("phone"):
        s += 10; why.append("ada telepon")
    if p.get("emails"):
        s += 5; why.append("ada email")
    # celah digital
    if not p.get("website"):
        s += 20; why.append("tanpa website")
    if not p.get("instagram") or p.get("instagram_shared"):
        s += 15; why.append("IG tidak ditemukan")
    # bisnis sehat = mampu bayar dan layak dibantu
    if rating >= 4.5:
        s += 15; why.append(f"rating {rating}")
    elif rating >= 4.0:
        s += 8
    if 30 <= reviews <= 800:
        s += 15; why.append(f"{reviews} ulasan, aktif")
    elif reviews < 30:
        s += 5
    if (p.get("reviews_per_month") or 0) > 0:
        s += 5; why.append("sedang tumbuh")
    # bukan target: jaringan besar / pemain dominan
    if (p.get("branches_in_area") or 1) > 1:
        s -= 25; why.append("jaringan bercabang")
    if reviews > 800:
        s -= 40; why.append("pemain besar")
    if not (p.get("phone") or p.get("instagram") or p.get("emails")):
        s = min(s, 20); why.append("tidak ada kontak")
    return max(0, min(100, s)), why


def score_all(report):
    """Tempel lead_score ke semua bisnis di laporan (juga untuk laporan lama)."""
    for key in ("all", "prospects", "leaders", "gems", "weak", "growing"):
        for p in report.get(key) or []:
            p["lead_score"], p["lead_reasons"] = lead_score(p)
    return report


def lead_key(p):
    return p.get("place_id") or p.get("maps_url") or ""


def detail_business(biz):
    """Cek kontak satu bisnis (in-place): telepon/website/IG dari Google Maps, IG dari website, normalisasi, skor.
    Melempar RuntimeError kalau Google Maps tidak merespons (transien)."""
    if not biz.get("maps_url"):
        raise PermanentError("bisnis tidak ada di laporan")
    biz.pop("_detailed", None)
    gmaps.details([biz], limit=1)
    if biz.get("_detail_error"):
        raise PermanentError(f"bisnis tidak bisa dicek: {biz['_detail_error']}")
    if not biz.get("_detailed"):
        raise RuntimeError("Google Maps tidak merespons, coba lagi sebentar lagi")
    biz["detail_src"] = "fresh"
    if biz.get("instagram"):
        biz["ig_src"] = "maps"
    if biz.get("website") and not biz.get("instagram"):
        find_instagram([biz], limit=1)
    biz.update({k: v for k, v in (datastore.clean_place(dict(biz)) or {}).items()
                if k in ("phone", "website", "instagram", "emails")})
    if biz.get("phone"):
        biz["whatsapp"] = wa_link(biz["phone"])
    biz["lead_score"], biz["lead_reasons"] = lead_score(biz)
    return biz


def update_place_cache(biz):
    """Simpan kontak yang baru didapat ke cache tempat (places), supaya riset berikutnya tidak cek ulang."""
    if not biz.get("place_id"):
        return
    conn = db()
    try:
        got = conn.execute("SELECT data FROM places WHERE place_id=?", (biz["place_id"],)).fetchone()
        if got:
            d = json.loads(got[0])
            d.update({k: biz[k] for k in ("phone", "website", "instagram", "emails", "_detailed", "ig_src") if biz.get(k)})
            conn.execute("UPDATE places SET data=? WHERE place_id=?", (json.dumps(d, ensure_ascii=False), biz["place_id"]))
            conn.commit()
    finally:
        conn.close()


def load_report_pg(report_id):
    """Laporan (JSON) dari tabel reports Postgres (DATABASE_URL), atau None. Pemeriksaan org dilakukan worker."""
    import psycopg
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise PermanentError("DATABASE_URL belum diisi untuk mode --detail")
    with psycopg.connect(dsn, autocommit=True, connect_timeout=10) as conn:
        row = conn.execute("SELECT report FROM reports WHERE id=%s", (int(report_id),)).fetchone()
    if not row:
        return None
    rep = row[0]
    return rep if isinstance(rep, dict) else json.loads(rep)


def detail_main(report_id, key, out):
    """Mode --detail: cek kontak satu bisnis dari laporan Postgres, tulis {"business": ...} ke --out.
    Exit code EXIT_PERMANENT untuk kesalahan input (laporan/bisnis tidak ada), 1 untuk gagal sementara."""
    try:
        rep = load_report_pg(report_id)
        if not rep:
            raise PermanentError("laporan tidak ada")
        biz = next((x for x in rep.get("all") or [] if lead_key(x) == key), None)
        if not biz or not biz.get("maps_url"):
            raise PermanentError("bisnis tidak ada di laporan")
        biz = dict(biz)
        log.info(f"[detail] cek kontak {biz.get('name')}")
        detail_business(biz)
        try:
            update_place_cache(biz)
        except Exception as e:  # noqa: BLE001
            log.info(f"      cache tempat gagal diperbarui: {e}")
    except PermanentError as e:
        write_out(out, {"mode": "detail", "error": str(e)[:300], "permanent": True})
        log.info(str(e))
        sys.exit(EXIT_PERMANENT)
    except Exception as e:
        write_out(out, {"mode": "detail", "error": f"{type(e).__name__}: {e}"[:300], "permanent": False})
        raise
    write_out(out, {"mode": "detail", "report_id": report_id, "key": key, "business": biz})
    log.info(f"DETAIL_DONE {biz.get('name')}: telepon {'ada' if biz.get('phone') else '-'}, "
             f"website {'ada' if biz.get('website') else '-'}, IG {biz.get('instagram') or '-'}")


def find_instagram(places, limit=25, budget_sec=None):
    """Website / halaman link-in-bio -> akun IG. Dibatasi `budget_sec` total (default FIND_IG_BUDGET_SEC) dan 8 detik
    per permintaan supaya website yang lambat tidak memakan jatah waktu job."""
    from competitor_website_monitor import scan
    budget_sec = FIND_IG_BUDGET_SEC if budget_sec is None else budget_sec
    todo = [p for p in places if p.get("website") and not p.get("instagram")][:limit]
    t0 = time.time()
    for i, p in enumerate(todo):
        if time.time() - t0 > budget_sec:
            log.info(f"      cari IG dihentikan: batas {budget_sec} detik habis, {len(todo) - i} website belum dicek")
            break
        try:
            d = scan(p["website"], timeout=8)
            igs = d.get("ig_links") or []
            if igs:
                p["instagram"] = igs[0]
                p["ig_src"] = "website"
            if d.get("emails"):
                p["emails"] = d["emails"][:3]
        except Exception:
            pass
        time.sleep(1)


def load_previous(conn, places):
    """Gabungkan data detail lama (phone/website/IG) + hitung momentum review."""
    now = datetime.now(timezone.utc)
    for p in places:
        row = conn.execute("SELECT data, history FROM places WHERE place_id=?", (p["place_id"],)).fetchone()
        p["history"] = json.loads(row[1]) if row and row[1] else []
        if row:
            old = json.loads(row[0])
            p["seen_before"] = True
            for k in ("phone", "website", "instagram", "emails", "_detailed"):
                if old.get(k) and not p.get(k):
                    p[k] = old[k]
                    if k == "_detailed":
                        p["detail_src"] = "db"  # detail kontak dari database Raqio (pindaian sebelumnya)
            if old.get("ig_src") and p.get("instagram") == old.get("instagram"):
                p["ig_src"] = old["ig_src"]
        prev = [h for h in p["history"] if h.get("reviews")]
        if prev:
            first = prev[0]
            days = max((now - datetime.fromisoformat(first["ts"])).total_seconds() / 86400, 0.01)
            p["reviews_delta"] = p["reviews"] - first["reviews"]
            p["reviews_per_month"] = round(p["reviews_delta"] / days * 30, 1) if days >= 1 else None
            p["tracked_days"] = round(days, 1)


def save_places(conn, places):
    now = datetime.now(timezone.utc).isoformat()
    for p in places:
        hist = datastore.snapshot(p.pop("history", []), {"reviews": p["reviews"], "rating": p["rating"]})
        for k in ("brand_group", "power_score"):  # field turunan per-batch (relatif ke pasar saat itu), tidak disimpan
            p.pop(k, None)
        conn.execute("""INSERT INTO places VALUES (?,?,?,?) ON CONFLICT(place_id) DO UPDATE SET
            data=excluded.data, history=excluded.history, last_seen=excluded.last_seen""",
                     (p["place_id"], json.dumps(p, ensure_ascii=False), json.dumps(hist[-60:]), now))
    conn.commit()


def pct(n, d):
    return round(n / d * 100) if d else 0


def build_report(industry, area, places):
    return {"industry": industry, "area": area, "created": datetime.now(timezone.utc).isoformat(),
            "standards": STANDARDS, **sections(industry, area, places)}


def rebuild_sections(report):
    """Susun ulang semua bagian turunan (summary, digital, leaders, gems, weak, growing, prospects, insights)
    dari report["all"] yang sudah diperbarui, mis. setelah cek kontak satu bisnis. Field lain
    (data_quality, ai_strategy, created) dipertahankan; summary.capped ikut dipertahankan."""
    capped = (report.get("summary") or {}).get("capped")
    old_src = report.get("sources") or {}
    sec = sections(report.get("industry") or "", report.get("area") or "", report.get("all") or [])
    if capped is not None:
        sec["summary"]["capped"] = capped
    for k in ("providers", "verify"):  # statistik pengumpulan sumber hanya ada saat pindaian; dipertahankan
        if k in old_src:
            sec["sources"][k] = old_src[k]
    report.update(sec)
    return score_all(report)


def sections(industry, area, places):
    """Bagian laporan yang diturunkan dari daftar bisnis. Bisa dipanggil ulang dengan report["all"]."""
    for p in places:
        p.setdefault("reviews", 0)
    n = len(places)
    # bisnis yang hanya ada di sumber lain tidak punya rating/ulasan: statistik pasar (median, bucket, kematangan digital)
    # dihitung dari bisnis Maps saja supaya angkanya tidak tertarik ke nol; mereka tetap ada di "all", prospek, dan sumber
    maps_places = [p for p in places if p.get("on_maps") is not False]
    extra_only = [p for p in places if p.get("on_maps") is False]
    n_maps = len(maps_places)
    rated = [p for p in maps_places if p.get("rating")]
    reviews = [p["reviews"] or 0 for p in maps_places]
    total_rev = sum(reviews) or 1
    by_rev = sorted(places, key=lambda p: -(p.get("reviews") or 0))
    detailed = [p for p in maps_places if p.get("_detailed")]
    # peringkat resmi laporan: rata-rata tertimbang (STANDARDS["leaders"]), bukan jumlah ulasan mentah
    power_scores(places)
    ranked = sorted(rated, key=lambda p: (-(p.get("power_score") or 0), -(p.get("reviews") or 0)))

    shares = [r / total_rev for r in reviews]
    hhi = round(sum(s * s for s in shares) * 10000)
    top3 = pct(sum(p["reviews"] for p in by_rev[:3]), total_rev)
    top10 = pct(sum(p["reviews"] for p in by_rev[:10]), total_rev)
    conc = ("terkonsentrasi (dikuasai sedikit pemain)" if hhi > 2500 else
            "cukup terkonsentrasi" if hhi > 1500 else "terfragmentasi (banyak pemain kecil)")

    def slim(p, extra=()):
        keys = ("place_id", "name", "rating", "reviews", "category", "address", "maps_url", "instagram",
                "website", "phone", "reviews_per_month", "status", "emails", "price", "dist_km",
                "instagram_shared", "website_shared", "branches_in_area", "brand_group", "power_score", "lat", "lon",
                "_detailed", "detail_src", "ig_src", "seen_before", "photo", "logo_key",
                "sources", "src_fields", "confidence", "src_url", "web_ok", "source") + tuple(extra)
        d = {k: p.get(k) for k in keys if p.get(k) not in (None, "")}
        if p.get("on_maps") is False:
            d["on_maps"] = False  # hanya ada di sumber lain; True (Maps) tidak perlu disimpan
        if p.get("phone"):
            d["whatsapp"] = wa_link(p["phone"])
        return d

    gems = sorted([p for p in rated if p["rating"] >= 4.7 and 15 <= p["reviews"] < 300],
                  key=lambda p: -(p["rating"] * math.log10(p["reviews"] + 1)))
    weak = sorted([p for p in rated if p["rating"] < 4.3 and p["reviews"] >= 150],
                  key=lambda p: p["rating"])
    growing = sorted([p for p in places if (p.get("reviews_per_month") or 0) > 0],
                     key=lambda p: -p["reviews_per_month"])
    # prospek: bisnis kecil yang bagus tapi lemah digital -> bisa ditawari bantuan
    prospects = []
    for p in places:
        off_maps = p.get("on_maps") is False
        if not p.get("_detailed") or (not p.get("rating") and not off_maps):
            continue
        gaps = []
        if off_maps:
            gaps.append("tidak muncul di hasil Maps")
        if not p.get("website"):
            gaps.append("tanpa website")
        if not p.get("instagram"):
            gaps.append("IG tidak ditemukan")
        if not off_maps and p["reviews"] < 100:
            gaps.append("review masih sedikit")
        if p.get("rating") and p["rating"] < 4.3:
            gaps.append(f"rating {p['rating']}")
        if gaps and p["reviews"] <= 800 and (p.get("phone") or p.get("instagram")):
            score, _ = lead_score(p)
            prospects.append(dict(slim(p), gaps=gaps, score=score))
    prospects.sort(key=lambda x: (-x["score"], -x.get("rating", 0)))

    cats = Counter(p.get("category") or "Lainnya" for p in places)
    rating_buckets = Counter(
        "4.5+" if p["rating"] >= 4.5 else "4.0–4.4" if p["rating"] >= 4.0 else "3.5–3.9" if p["rating"] >= 3.5 else "<3.5"
        for p in rated)
    size_buckets = Counter(
        "1000+" if r >= 1000 else "200–999" if r >= 200 else "50–199" if r >= 50 else "<50" for r in reviews)

    digital = {
        "sampled": len(detailed),
        "website": pct(sum(1 for p in detailed if p.get("website")), len(detailed)),
        "instagram": pct(sum(1 for p in detailed if p.get("instagram")), len(detailed)),
        "phone": pct(sum(1 for p in detailed if p.get("phone")), len(detailed)),
        "whatsapp": pct(sum(1 for p in detailed if wa_link(p.get("phone"))), len(detailed)),
    }

    # dari mana tiap potong data berasal; dipakai pie chart "Sumber data" di laporan
    by_source = Counter(s for p in places for s in (p.get("sources") or ["maps"]))
    src = {
        "total": n,
        "maps": by_source.get("maps", 0),  # daftar bisnis, rating, ulasan: dari Google Maps saat pindaian ini
        "by_source": dict(by_source),
        "maps_only": sum(1 for p in places if (p.get("sources") or ["maps"]) == ["maps"]),
        "multi": sum(1 for p in places if len(p.get("sources") or []) > 1),
        "extra_only": len(extra_only),
        "enriched": sum(1 for p in places if p.get("on_maps") is not False and p.get("src_fields")),
        "seen_before": sum(1 for p in places if p.get("seen_before")),
        "detail_fresh": sum(1 for p in detailed if p.get("detail_src") == "fresh"),
        "detail_db": sum(1 for p in detailed if p.get("detail_src") == "db"),
        "detail_none": n - len(detailed),
        "ig_maps": sum(1 for p in places if p.get("instagram") and p.get("ig_src") == "maps"),
        "ig_website": sum(1 for p in places if p.get("instagram") and p.get("ig_src") == "website"),
        "ig_other": sum(1 for p in places if p.get("instagram") and p.get("ig_src") not in ("maps", "website")),
    }

    insights = []
    others = sorted(k for k in by_source if k != "maps")
    if n_maps:
        insights.append(f"{n_maps} bisnis {industry} ditemukan di Google Maps di {area}"
                        + (f", ditambah {len(extra_only)} dari sumber lain yang tidak muncul di hasil Maps." if extra_only
                           else " (batas bawah, hanya yang muncul di Google Maps)."))
    if extra_only:
        insights.append(f"{len(extra_only)} bisnis tambahan dari {', '.join(sources.LABEL.get(k, k) for k in others)} tidak "
                        f"muncul di hasil pencarian Google Maps ini (belum punya profil Maps, atau di luar hasil teratas Maps "
                        f"untuk kata kunci ini): tanpa rating, tidak ikut peringkat, layak dicek dan ditawari.")
    if src["enriched"]:
        insights.append(f"Kontak {src['enriched']} bisnis dilengkapi dari sumber lain ({', '.join(others)}); asal tiap kontak dicatat.")
    if n_maps:
        insights.append(f"Pasar {conc}: 3 teratas memegang {top3}% dari seluruh review, 10 teratas {top10}%.")
        if ranked:
            t = ranked[0]
            insights.append(f"Teratas menurut rata-rata tertimbang: {t['name']} (skor {t['power_score']:.2f} dari "
                            f"rating {t['rating']} × {t['reviews']} ulasan); peringkat tidak memakai jumlah ulasan mentah.")
        if rated:
            avg = statistics.mean(p["rating"] for p in rated)
            insights.append(f"Rating rata-rata {avg:.2f}. Standar pasar tinggi, di bawah 4,5 sudah terlihat kalah."
                            if avg >= 4.5 else f"Rating rata-rata {avg:.2f}, ada ruang untuk bersaing lewat kualitas layanan.")
        if size_buckets.get("<50", 0) / n_maps > 0.4:
            insights.append(f"{pct(size_buckets['<50'], n_maps)}% pemain masih kecil (<50 review): pasar banyak pendatang baru.")
        if weak:
            insights.append(f"{len(weak)} pemain ramai tapi rating < 4,3 (mis. {weak[0]['name']}): pelanggan mereka "
                            f"tidak puas, peluang merebut pasar dengan kualitas.")
        if gems:
            insights.append(f"{len(gems)} hidden gem (rating ≥4,7, review <300), calon pemain yang sedang naik.")
        if detailed:
            insights.append(f"Kematangan digital: {digital['website']}% punya website, {digital['instagram']}% IG "
                            f"terdeteksi, {digital['whatsapp']}% bisa dihubungi via WhatsApp (dari {len(detailed)} sampel).")
        if growing:
            g = growing[0]
            insights.append(f"Tumbuh paling cepat: {g['name']} (+{g['reviews_per_month']} review/bulan).")
        else:
            insights.append("Momentum (review/bulan) muncul setelah wilayah ini dipindai ulang beberapa hari lagi.")

    return {
        "summary": {
            "businesses": n, "maps_businesses": n_maps, "extra_businesses": len(extra_only), "total_reviews": sum(reviews),
            "avg_rating": round(statistics.mean(p["rating"] for p in rated), 2) if rated else None,
            "median_reviews": int(statistics.median(reviews)) if reviews else 0,
            "hhi": hhi, "top3_share": top3, "top10_share": top10, "concentration": conc,
        },
        "insights": insights,
        "categories": cats.most_common(8),
        "rating_buckets": [[k, rating_buckets.get(k, 0)] for k in ("4.5+", "4.0–4.4", "3.5–3.9", "<3.5")],
        "size_buckets": [[k, size_buckets.get(k, 0)] for k in ("1000+", "200–999", "50–199", "<50")],
        "digital": digital,
        "sources": src,
        "leaders": [dict(slim(p), rank=i + 1) for i, p in enumerate(ranked[:10])],
        "gems": [slim(p) for p in gems[:10]],
        "weak": [slim(p) for p in weak[:8]],
        "growing": [slim(p) for p in growing[:10]],
        "prospects": prospects[:25],
        "all": [slim(p) for p in by_rev],
    }


def classify_categories(industry, places):
    """Nilai relevansi tiap kategori Maps untuk industri ini: cache DB -> AI -> aturan."""
    conn = db()
    conn.execute("""CREATE TABLE IF NOT EXISTS category_relevance (
        industry TEXT, category TEXT, verdict TEXT, source TEXT, PRIMARY KEY (industry, category))""")
    key = industry.lower().strip()
    cats = sorted({p.get("category") or "" for p in places} - {""})
    verdicts = {c: v for c, v in conn.execute(
        "SELECT category, verdict FROM category_relevance WHERE industry=?", (key,)) if c in cats}
    todo = [c for c in cats if c not in verdicts]
    source = "rules"
    if todo and os.getenv("OPENROUTER_API_KEY"):
        try:
            import agent
            import netutil
            examples = {c: [p["name"] for p in places if p.get("category") == c][:3] for c in todo}
            prompt = (f"Industri yang diriset: \"{industry}\". Untuk tiap kategori Google Maps di bawah, nilai apakah "
                      "bisnis di kategori itu termasuk industri tersebut (pesaing langsung). Jawab JSON saja: "
                      '{"kategori": "yes"|"no"|"maybe"}. "maybe" = kategori campuran/umum yang perlu dilihat '
                      "dari nama bisnisnya.\n\n" + json.dumps(examples, ensure_ascii=False))
            for model in agent.candidate_models()[:3]:
                r = netutil.post("https://openrouter.ai/api/v1/chat/completions", retries=1, timeout=60,
                                 headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
                                          "Content-Type": "application/json"},
                                 json={"model": model, "temperature": 0,
                                       "messages": [{"role": "user", "content": prompt}]})
                j = r.json()
                content = ((j.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
                if content:
                    m = re.search(r"\{.*\}", content, re.S)
                    got = json.loads(m.group(0)) if m else {}
                    got = {c: v for c, v in got.items() if c in todo and v in ("yes", "no", "maybe")}
                    if got:
                        verdicts.update(got)
                        source = "ai"
                        break
        except Exception as e:
            log.info(f"      klasifikasi AI gagal, pakai aturan: {e}")
    rest = [c for c in todo if c not in verdicts]
    verdicts.update(datastore.rule_verdicts(industry, rest))
    # aturan kata kunci menang kalau bilang relevan (AI kadang terlalu ketat, mis. "Kafe" untuk coffee shop)
    ai_said = dict(verdicts)
    for c, v in datastore.rule_verdicts(industry, todo).items():
        if v == "yes" and ai_said.get(c) != "no":  # AI tegas "no" tetap dihormati
            verdicts[c] = "yes"
    # kata inti industri ada di nama kategori (mis. "kopi" di "Tempat penyangraian kopi") = pasti relevan
    core = datastore.INDUSTRY_ALIASES.get(datastore.industry_group(industry), [])
    for c in todo:
        if any(w.strip() and w.strip() in c.lower() for w in core):
            verdicts[c] = "yes"
    for c in todo:
        conn.execute("INSERT OR REPLACE INTO category_relevance VALUES (?,?,?,?)",
                     (key, c, verdicts[c], source if c not in rest else "rules"))
    conn.commit()
    conn.close()
    return verdicts


def llm_insights(report):
    """Narasi strategi dari LLM (opsional, kalau OPENROUTER_API_KEY ada)."""
    if not os.getenv("OPENROUTER_API_KEY"):
        return None
    try:
        import agent
        import netutil
        data = {k: report[k] for k in ("industry", "area", "summary", "insights", "digital",
                                       "rating_buckets", "size_buckets")}
        data["leaders"] = [{k: p.get(k) for k in ("name", "rating", "reviews")} for p in report["leaders"][:5]]
        data["gems"] = [{k: p.get(k) for k in ("name", "rating", "reviews")} for p in report["gems"][:5]]
        data["weak"] = [{k: p.get(k) for k in ("name", "rating", "reviews")} for p in report["weak"][:5]]
        prompt = ("Kamu analis pasar. Dari data riset pasar Google Maps berikut, tulis 4–6 poin strategi "
                  "konkret dalam bahasa Indonesia untuk pemilik bisnis baru/kecil di industri dan wilayah ini "
                  "(positioning, celah, cara menang). Satu kalimat per poin, mulai dengan '- '. Jangan mengarang "
                  "angka di luar data.\n\n" + json.dumps(data, ensure_ascii=False))
        for model in agent.candidate_models()[:4]:
            r = netutil.post("https://openrouter.ai/api/v1/chat/completions", retries=1, timeout=90,
                             headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
                                      "Content-Type": "application/json"},
                             json={"model": model, "temperature": 0.4,
                                   "messages": [{"role": "user", "content": prompt}]})
            j = r.json()
            content = ((j.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
            if content:
                lines = [l.strip()[2:].strip() for l in content.splitlines()
                         if l.strip().startswith(("- ", "* ", "• "))]
                return [l.replace(" \u2014 ", ", ").replace("\u2014", ", ") for l in lines] or None
    except Exception as e:
        log.info(f"LLM insight gagal: {e}")
    return None


def run(industry, area, max_results=120, detail_limit=30, use_sources=None):
    """use_sources: None = env MARKET_SOURCES; "none" = hanya Google Maps; "overture,osm" = daftar eksplisit."""
    t0 = time.time()
    log.info(f"[1/5] Cari '{industry}' di '{area}' (Google Maps)…")
    places = gmaps.search(f"{industry} {area}", max_results=max_results)
    if not places:
        raise PermanentError("Tidak ada hasil dari Google Maps. Coba kata kunci lain.")
    places, quality = datastore.clean_batch(places)
    log.info(f"      bersihkan: {quality['raw']} mentah -> {quality['kept']} bersih "
             f"(tidak valid/tutup {quality['invalid_or_closed']}, di luar wilayah {quality['out_of_area']}, "
             f"duplikat digabung {quality['duplicates_merged']})")
    verdicts = classify_categories(industry, places)
    places, irrelevant = datastore.apply_relevance(places, industry, verdicts)
    quality["irrelevant"] = len(irrelevant)
    quality["irrelevant_examples"] = [f"{p['name']} ({p.get('category') or '-'})" for p in irrelevant[:6]]
    quality["kept"] = len(places)
    log.info(f"      relevansi: {len(irrelevant)} bukan '{industry}' dibuang "
             f"({', '.join(quality['irrelevant_examples'][:3]) or '-'})")
    if not places:
        raise PermanentError("Semua hasil tersaring (tidak valid / di luar wilayah / tidak relevan).")
    for p in places:
        p.setdefault("sources", ["maps"])
        p.setdefault("on_maps", True)
    maps_n = len(places)
    providers, verify = [], {}
    names = sources.enabled(use_sources)
    if names:
        log.info(f"      sumber lain ({', '.join(names)}): cari bisnis dan kontak tambahan…")
        center, radius_km = sources.center_radius(places)
        extra, providers = sources.collect(industry, area, center, radius_km, log=log.info, override=use_sources)
        extra = [e for e in (datastore.clean_place(e) for e in extra) if e]
        extra = sources.relevant(extra, industry)
        merged, n_merged = datastore.dedupe(places + extra)
        standalone = [p for p in merged if not p.get("on_maps")]
        kept, dropped, verify = sources.validate_standalone(standalone, log=log.info)
        places = [p for p in merged if p.get("on_maps")] + kept
        quality.update(sources_relevant=len(extra), sources_matched=n_merged, sources_added=len(kept), sources_dropped=len(dropped))
        log.info(f"      sumber lain: {len(extra)} relevan, {n_merged} cocok dengan Maps (kontak dilengkapi), "
                 f"{len(kept)} bisnis tambahan lolos validasi, {len(dropped)} dibuang")
    conn = db()
    load_previous(conn, places)
    # detail: pemimpin pasar + bisnis kecil (calon prospek), yang belum pernah di-detail
    by_rev = sorted(places, key=lambda p: -p["reviews"])
    small = [p for p in places if 10 <= p["reviews"] <= 800]
    pick, seen = [], set()
    for p in by_rev[:detail_limit // 3] + small:
        if p["place_id"] not in seen and not p.get("_detailed"):
            pick.append(p); seen.add(p["place_id"])
    pick = pick[:detail_limit]
    log.info(f"[2/5] {len(places)} bisnis. Ambil detail (telepon/website/IG) {len(pick)} tempat…")
    gmaps.details(pick, limit=len(pick), budget_sec=DETAILS_BUDGET_SEC)
    for p in pick:
        if p.get("_detailed"):
            p["detail_src"] = "fresh"  # detail kontak dicek sekarang di Google Maps
            if p.get("instagram"):
                p["ig_src"] = "maps"
    log.info("[3/5] Cari akun IG dari website / link-in-bio…")
    find_instagram(places)
    # normalisasi ulang field yang baru didapat (HP, website, IG) + tandai akun bersama/cabang
    places = [datastore.clean_place(p) or p for p in places]
    datastore.flag_shared(places)
    quality["chains"] = len({p["brand_group"] for p in places if p.get("branches_in_area", 1) > 1})
    quality["brands"] = len({p["brand_group"] for p in places})
    log.info("[4/5] Susun laporan…")
    report = score_all(build_report(industry, area, places))
    report["data_quality"] = quality
    report["summary"]["capped"] = maps_n >= max_results  # jumlah bisnis Maps mentok di batas pencarian
    report["sources"]["providers"] = providers
    if verify:
        report["sources"]["verify"] = verify
    ai = llm_insights(report)
    if ai:
        report["ai_strategy"] = ai
    save_places(conn, places)
    cur = conn.execute("INSERT INTO market_reports (industry, area, created, report) VALUES (?,?,?,?)",
                       (industry, area, report["created"], json.dumps(report, ensure_ascii=False)))
    conn.commit()
    rid = cur.lastrowid
    conn.close()
    log.info(f"[5/5] Selesai dalam {int(time.time() - t0)} detik. REPORT_ID={rid}")
    return rid, report


def write_out(path, data):
    """Tulis hasil JSON untuk worker secara atomik (tulis ke file sementara lalu rename)."""
    if not path:
        return
    tmp = f"{path}.tmp{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--industry")
    ap.add_argument("--area", help="satu wilayah")
    ap.add_argument("--areas", help="beberapa wilayah dipisah ';' untuk dibandingkan")
    ap.add_argument("--reuse-days", type=int, default=7,
                    help="mode --areas: pakai laporan wilayah yang umurnya < N hari (tidak riset ulang)")
    ap.add_argument("--max", type=int, default=120, help="maks bisnis dari Google Maps")
    ap.add_argument("--details", type=int, default=30, help="jumlah tempat yang diambil telepon/website-nya")
    ap.add_argument("--out", help="tulis hasil (laporan JSON lengkap) ke file ini; dibaca worker.py")
    ap.add_argument("--detail", action="store_true", help="cek kontak satu bisnis dari laporan Postgres (--report, --key)")
    ap.add_argument("--report", type=int, help="mode --detail: id laporan di tabel reports Postgres")
    ap.add_argument("--key", help="mode --detail: key bisnis (place_id / maps_url)")
    ap.add_argument("--sources", help="sumber tambahan dipisah koma (overture,osm,places_api,tomtom) atau 'none'; "
                                      "default env MARKET_SOURCES")
    args = ap.parse_args()
    if args.detail:
        if args.report is None or not args.key:
            ap.error("mode --detail butuh --report dan --key")
        detail_main(args.report, args.key, args.out)
        return
    if not args.industry:
        ap.error("butuh --industry")
    if args.areas:
        areas = [a.strip() for a in args.areas.split(";") if a.strip()][:MAX_COMPARE_AREAS]
        conn = db()
        reused = {a: latest_report(conn, args.industry, a, args.reuse_days) for a in areas}
        conn.close()
        todo = [a for a in areas if not reused[a]]
        log.info(f"[compare] {len(areas)} wilayah, {len(areas) - len(todo)} pakai laporan tersimpan, "
                 f"{len(todo)} riset baru")
        results = []
        for a in areas:
            if reused[a]:
                rid, rep = reused[a]
                results.append({"area": a, "ok": True, "report_id": rid, "report": rep, "reused": True})
                continue
            i = todo.index(a) + 1
            log.info(f"[compare] wilayah {i}/{len(todo)}: {a}")
            try:
                rid, rep = run(args.industry, a, args.max, args.details, use_sources=args.sources)
                results.append({"area": a, "ok": True, "report_id": rid, "report": rep})
            except PermanentError as e:
                log.info(f"  {a}: {e}")
                results.append({"area": a, "ok": False, "error": str(e)[:300], "permanent": True})
            except Exception as e:  # transien (timeout browser, jaringan); wilayah lain tetap diriset
                log.info(f"  {a}: gagal sementara: {type(e).__name__}: {str(e)[:200]}")
                results.append({"area": a, "ok": False, "error": f"{type(e).__name__}: {e}"[:300], "permanent": False})
            # hasil parsial ditulis tiap wilayah: kalau worker menghentikan proses (batas waktu), yang selesai tidak hilang
            write_out(args.out, {"mode": "compare", "industry": args.industry, "areas": results, "partial": True})
        found = [(r["area"], r["report_id"], r["report"]) for r in results if r["ok"]]
        failed = [{"area": r["area"], "error": r["error"]} for r in results if not r["ok"]]
        res = compare_reports(args.industry, found, failed)
        write_out(args.out, {"mode": "compare", "industry": args.industry, "areas": results, "compare": res})
        print("\n".join("• " + i for i in res["insights"]))
        log.info("COMPARE_DONE")
        if not found:
            sys.exit(EXIT_PERMANENT if all(r.get("permanent") for r in results) else 1)
        return
    if not args.area:
        ap.error("butuh --area atau --areas")
    try:
        rid, rep = run(args.industry, args.area, args.max, args.details, use_sources=args.sources)
    except PermanentError as e:
        write_out(args.out, {"mode": "run", "error": str(e)[:300], "permanent": True})
        log.info(str(e))
        sys.exit(EXIT_PERMANENT)
    except Exception as e:
        write_out(args.out, {"mode": "run", "error": f"{type(e).__name__}: {e}"[:300], "permanent": False})
        raise
    write_out(args.out, {"mode": "run", "report_id": rid, "report": rep})
    print("\n".join("• " + i for i in rep["insights"]))


if __name__ == "__main__":
    main()
