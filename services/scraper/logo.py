"""
logo.py, cari logo bisnis supaya nama di laporan langsung dikenali.

Sumber, urut prioritas:
  1. website bisnis: <link rel="apple-touch-icon">, <link rel="icon">, <meta property="og:image">, lalu /favicon.ico
  2. foto profil Instagram (dari cache ig.db yang diisi job ig_profile / scraper IG)

Semua pengambilan lewat netutil.fetch_safe (tolak IP internal, redirect dibatasi, body dibatasi). Gambar diperkecil
jadi PNG 256 px dengan Pillow lalu disimpan ke tabel Postgres business_logos (global per bisnis, kunci place_id) dan
laporan diberi field "logo_key". API menyajikannya di GET /logo/<key>.
"""
import io
import json
import os
import re
import time
from urllib.parse import urljoin, urlsplit

import netutil

HERE = os.path.dirname(os.path.abspath(__file__))
SIZE = 256
MAX_IMAGE_BYTES = 1024 * 1024
MAX_HTML_BYTES = 512 * 1024
PER_SITE_TIMEOUT = 8
# Host agregator tautan: favicon-nya logo platform (mis. asterisk hijau Linktree), bukan logo bisnis.
# Dari host ini hanya gambar profil (og:image) yang boleh dipakai.
LINKHUB_HOSTS = ("linktr.ee", "linktree.com", "bio.link", "beacons.ai", "lynk.id", "taplink.cc", "taplink.at", "carrd.co",
                 "milkshake.app", "msha.ke", "linkin.bio", "campsite.bio", "solo.to", "s.id", "bit.ly", "cutt.ly", "tinyurl.com",
                 "linkpop.com", "wlo.link", "heylink.me", "allmylinks.com", "stan.store", "bio.site", "lnk.bio", "linkr.bio",
                 "linkby.me", "sociabuzz.com", "mez.ink")
# Host sosial/marketplace/peta: tidak pernah jadi sumber logo lewat jalur website (IG punya jalur sendiri).
SOCIAL_HOSTS = ("instagram.com", "facebook.com", "fb.com", "fb.me", "m.me", "tiktok.com", "twitter.com", "x.com", "youtube.com",
                "youtu.be", "wa.me", "whatsapp.com", "t.me", "telegram.me", "shopee.co.id", "shopee.com", "tokopedia.com",
                "tokopedia.link", "gofood.co.id", "gojek.com", "grab.com", "google.com", "goo.gl", "g.page", "g.co",
                "linkedin.com", "pinterest.com", "threads.net", "line.me", "lin.ee", "tripadvisor.com", "tripadvisor.co.id",
                "zomato.com", "pergikuliner.com", "traveloka.com", "tiket.com", "booking.com", "agoda.com", "airbnb.com",
                "ubereats.com", "foodpanda.com", "bukalapak.com", "lazada.co.id", "blibli.com", "olx.co.id")
# Gambar yang sama dipakai >= sekian bisnis berbeda = logo platform/tema, bukan logo bisnis: dibuang dan diblokir.
GENERIC_MIN = 3
MIN_SOURCE_PX = 32
# 4000x4000: gambar yang header-nya lebih besar ditolak sebelum didekode (bom dekompresi PNG/GIF 1 MB -> ratusan MB RAM)
MAX_PIXELS = 16_000_000

def host_kind(url):
    """'social' (lewati), 'linkhub' (hanya og:image), atau 'site' (semua kandidat)."""
    try:
        h = (urlsplit(url).hostname or "").lower()
    except Exception:
        return "site"
    h = h[4:] if h.startswith("www.") else h
    match = lambda d: h == d or h.endswith("." + d)
    if any(match(d) for d in SOCIAL_HOSTS):
        return "social"
    if any(match(d) for d in LINKHUB_HOSTS):
        return "linkhub"
    return "site"

LINK_RE = re.compile(r"<link\b[^>]*>", re.I)
META_RE = re.compile(r"<meta\b[^>]*>", re.I)
ATTR_RE = re.compile(r'([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'>]+))')


def _attrs(tag):
    return {k.lower(): (a if a is not None else b if b is not None else c) for k, a, b, c in ATTR_RE.findall(tag)}


def _size_of(attrs):
    m = re.search(r"(\d+)x(\d+)", attrs.get("sizes") or "")
    return int(m.group(1)) if m else 0


def candidates_from_html(html, base_url, only_og=False):
    """Daftar URL kandidat logo dari HTML, urut prioritas. Relatif diselesaikan terhadap base_url.
    only_og=True (host agregator tautan): hanya og:image/twitter:image, tanpa ikon dan favicon.ico."""
    touch, icons, og = [], [], []
    for tag in LINK_RE.findall(html):
        a = _attrs(tag)
        rel, href = (a.get("rel") or "").lower(), a.get("href")
        if not href:
            continue
        if "apple-touch-icon" in rel:
            touch.append((_size_of(a), href))
        elif "icon" in rel.split() or rel in ("icon", "shortcut icon"):
            icons.append((_size_of(a), href))
    for tag in META_RE.findall(html):
        a = _attrs(tag)
        if (a.get("property") or a.get("name") or "").lower() in ("og:image", "og:image:url", "twitter:image") and a.get("content"):
            og.append((0, a["content"]))
    out = []
    groups = (og,) if only_og else (sorted(touch, key=lambda x: -x[0]), sorted(icons, key=lambda x: -x[0]), og)
    for group in groups:
        for _, href in group:
            u = urljoin(base_url, href.strip())
            if u.startswith(("http://", "https://")) and u not in out:
                out.append(u)
    if only_og:
        return out
    sp = urlsplit(base_url)
    fav = f"{sp.scheme}://{sp.netloc}/favicon.ico"
    if fav not in out:
        out.append(fav)
    return out


def to_png(data):
    """Validasi gambar dan perkecil ke PNG persegi SIZE px (dipusatkan di latar transparan). None kalau bukan gambar."""
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS  # Pillow melempar DecompressionBombError di atas 2x nilai ini
    try:
        im = Image.open(io.BytesIO(data))
        if im.width * im.height > MAX_PIXELS:
            return None  # ukuran dibaca dari header, belum didekode: gambar raksasa ditolak tanpa makan RAM
        im.load()
    except Exception:
        return None
    if min(im.size) < MIN_SOURCE_PX:
        return None  # favicon 16 px jadi buram saat diperbesar; bukan logo yang layak tampil
    im = im.convert("RGBA")
    lo, hi = im.convert("L").getextrema()
    if hi - lo < 24:
        return None  # gambar polos (satu warna / placeholder)
    im.thumbnail((SIZE, SIZE))
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2))
    buf = io.BytesIO()
    canvas.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def phash(png):
    """Sidik jari gambar: difference hash 8x8 (64 bit, 16 hex) atas isi gambar saja (bingkai transparan hasil
    pemusatan di kanvas dipotong dulu, kalau tidak semua foto berbingkai putih menghasilkan hash yang sama).
    None kalau bukan gambar."""
    from PIL import Image
    try:
        im = Image.open(io.BytesIO(png)).convert("RGBA")
    except Exception:
        return None
    box = im.getchannel("A").getbbox()
    if box:
        im = im.crop(box)
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    g = bg.convert("L").resize((9, 8), Image.LANCZOS).tobytes()
    bits = "".join("1" if g[r * 9 + c] > g[r * 9 + c + 1] else "0" for r in range(8) for c in range(8))
    return f"{int(bits, 2):016x}"


def fetch_image(url, timeout=PER_SITE_TIMEOUT):
    """Unduh satu gambar lewat pagar netutil, kembalikan PNG kecil atau None."""
    try:
        r = netutil.fetch_safe(url, timeout=timeout, max_bytes=MAX_IMAGE_BYTES,
                               headers={"Accept": "image/*,*/*;q=0.5"})
    except Exception:
        return None
    if r.status_code != 200 or not r.content or r.truncated:
        return None
    ct = (r.headers.get("content-type") or "").lower()
    if ct and not ct.startswith("image/") and "octet-stream" not in ct and "svg" not in ct:
        return None
    return to_png(r.content)


def from_website(url, timeout=PER_SITE_TIMEOUT):
    """Logo dari website: (png_bytes, sumber) atau None. Host sosial dilewati, host agregator tautan (Linktree dkk.)
    hanya boleh gambar profilnya (og:image), bukan favicon platform."""
    if not url:
        return None
    kind = host_kind(url)
    if kind == "social":
        return None
    try:
        r = netutil.fetch_safe(url, timeout=timeout, max_bytes=MAX_HTML_BYTES,
                               headers={"Accept": "text/html,*/*;q=0.5"})
    except Exception:
        return None
    if r.status_code != 200:
        return None
    html = r.content.decode("utf-8", errors="replace")
    cands = candidates_from_html(html, r.url, only_og=(kind == "linkhub"))
    for i, cand in enumerate(cands[:5]):
        png = fetch_image(cand, timeout)
        if png:
            return png, ("linkhub" if kind == "linkhub" else "og" if i >= 3 else "website")
    return None


def ig_profile_pic_url(username):
    """URL foto profil dari cache ig.db (diisi scraper IG), atau None."""
    import datastore
    db = os.path.join(os.environ.get("RAQIO_DATA_DIR", HERE), "ig.db")
    if not username or not os.path.exists(db):
        return None
    conn = datastore.connect_sqlite(db)
    try:
        row = conn.execute("SELECT data FROM profiles WHERE lower(username)=?", (username.lower().lstrip("@"),)).fetchone()
    except Exception:
        row = None
    finally:
        conn.close()
    if not row:
        return None
    try:
        d = json.loads(row[0])
    except Exception:
        return None
    return d.get("profile_pic") or d.get("profile_pic_url_hd") or d.get("profile_pic_url") or None


def from_instagram(username, timeout=PER_SITE_TIMEOUT):
    url = ig_profile_pic_url(username)
    if not url:
        return None
    png = fetch_image(url, timeout)
    return (png, "instagram") if png else None


def from_photo(url, timeout=PER_SITE_TIMEOUT):
    """Foto profil kartu Google Maps (googleusercontent), diperkecil seperti sumber lain."""
    if not url or "googleusercontent" not in url:
        return None
    png = fetch_image(url, timeout)
    return (png, "maps") if png else None


def find_logo(biz, timeout=PER_SITE_TIMEOUT):
    """(png_bytes, sumber) dari website, lalu Instagram, lalu foto kartu Maps; None kalau semua kosong."""
    got = from_website(biz.get("website"), timeout) if biz.get("website") else None
    if not got and biz.get("instagram"):
        got = from_instagram(str(biz["instagram"]), timeout)
    if not got and biz.get("photo"):
        got = from_photo(str(biz["photo"]), timeout)
    return got


# ---------- Postgres ----------

def key_of(biz):
    return biz.get("place_id") or biz.get("maps_url") or ""


def known_keys(conn, keys):
    """Kunci yang sudah punya logo di business_logos."""
    keys = [k for k in keys if k]
    if not keys:
        return set()
    rows = conn.execute("SELECT key FROM business_logos WHERE key = ANY(%s)", (keys,)).fetchall()
    return {r[0] for r in rows}


def store_logo(conn, key, png, source):
    """Simpan logo. False kalau gambarnya ternyata logo generik: sudah diblokir (logo_generic) atau dipakai
    >= GENERIC_MIN bisnis berbeda (ikon platform, tema, placeholder); yang terlanjur tersimpan ikut dihapus."""
    h = phash(png)
    if h:
        if conn.execute("SELECT 1 FROM logo_generic WHERE phash=%s", (h,)).fetchone():
            return False
        row = conn.execute("SELECT count(DISTINCT key) FROM business_logos WHERE phash=%s AND key<>%s", (h, key)).fetchone()
        n = int(row[0]) if row else 0
        if n + 1 >= GENERIC_MIN:
            conn.execute("""INSERT INTO logo_generic (phash, seen, example_source) VALUES (%s,%s,%s)
                            ON CONFLICT (phash) DO UPDATE SET seen=excluded.seen""", (h, n + 1, source))
            conn.execute("DELETE FROM business_logos WHERE phash=%s", (h,))
            return False
    conn.execute("""INSERT INTO business_logos (key, source, content_type, data, fetched_at, phash) VALUES (%s,%s,'image/png',%s,now(),%s)
                    ON CONFLICT (key) DO UPDATE SET source=excluded.source, data=excluded.data, fetched_at=now(), phash=excluded.phash""",
                 (key, source, png, h))
    return True


def purge_generic(conn, log=None):
    """Bersihkan logo generik yang sudah tersimpan: isi phash yang kosong, lalu gambar yang dipakai >= GENERIC_MIN
    bisnis berbeda dipindah ke logo_generic dan dihapus. Mengembalikan jumlah logo yang dihapus."""
    rows = conn.execute("SELECT key, data FROM business_logos WHERE phash IS NULL").fetchall()
    for key, data in rows:
        conn.execute("UPDATE business_logos SET phash=%s WHERE key=%s", (phash(bytes(data)), key))
    groups = conn.execute("""SELECT phash, count(DISTINCT key), min(source) FROM business_logos
                             WHERE phash IS NOT NULL GROUP BY phash HAVING count(DISTINCT key) >= %s""", (GENERIC_MIN,)).fetchall()
    removed = 0
    for h, n, src in groups:
        conn.execute("""INSERT INTO logo_generic (phash, seen, example_source) VALUES (%s,%s,%s)
                        ON CONFLICT (phash) DO UPDATE SET seen=excluded.seen""", (h, int(n), src))
        conn.execute("DELETE FROM business_logos WHERE phash=%s", (h,))
        removed += int(n)
        if log:
            log(f"[logo] generik dibuang: {n} bisnis memakai gambar yang sama ({src})")
    return removed


def enrich_report(conn, report, limit=40, heartbeat=None, should_stop=None, log=None, budget_sec=150):
    """Isi logo_key untuk bisnis di laporan: yang sudah ada di tabel langsung ditandai, yang punya website/IG diambil
    (maksimal `limit` situs, total `budget_sec` detik). Mengembalikan (ditandai, diunduh)."""
    places = report.get("all") or []
    keys = [key_of(p) for p in places]
    have = known_keys(conn, keys)
    marked = downloaded = 0
    for p in places:
        k = key_of(p)
        if k and k in have:
            p["logo_key"] = k
            marked += 1
        elif p.get("logo_key"):
            p.pop("logo_key", None)  # kunci basi (logo sudah dihapus karena generik): coba cari lagi
    t0 = time.time()
    tried = 0
    for p in places:
        k = key_of(p)
        if not k or p.get("logo_key") or not (p.get("website") or p.get("instagram") or p.get("photo")):
            continue
        if tried >= limit or time.time() - t0 > budget_sec or (should_stop and should_stop()):
            break
        tried += 1
        got = find_logo(p)
        if heartbeat:
            heartbeat()
        if not got:
            continue
        png, source = got
        if not store_logo(conn, k, png, source):
            if log:
                log(f"[logo] {p.get('name')}: dilewati, gambar generik ({source})")
            continue
        p["logo_key"] = k
        downloaded += 1
        if log:
            log(f"[logo] {p.get('name')}: {source}")
    sync_lists(report)
    return marked, downloaded


DERIVED_LISTS = ("leaders", "gems", "weak", "growing", "prospects")


def sync_lists(report):
    """Salin logo_key dari report["all"] ke daftar turunan (leaders dkk.) yang berisi salinan bisnis yang sama."""
    keys = {key_of(p): p["logo_key"] for p in report.get("all") or [] if p.get("logo_key") and key_of(p)}
    for name in DERIVED_LISTS:
        for p in report.get(name) or []:
            k = key_of(p)
            if k in keys:
                p["logo_key"] = keys[k]
            elif p.get("logo_key"):
                p.pop("logo_key", None)


def apply_keys(report, keys):
    """Tempel logo_key dari peta {key: logo_key} ke report["all"] lalu salin ke daftar turunan."""
    for p in report.get("all") or []:
        k = key_of(p)
        if k in keys:
            p["logo_key"] = keys[k]
    sync_lists(report)


def enrich_one(conn, biz, log=None):
    """Logo untuk satu bisnis (dipakai setelah Cek kontak). Mengembalikan True kalau logo tersedia."""
    k = key_of(biz)
    if not k:
        return False
    if k in known_keys(conn, [k]):
        biz["logo_key"] = k
        return True
    got = find_logo(biz)
    if not got or not store_logo(conn, k, got[0], got[1]):
        return False
    biz["logo_key"] = k
    if log:
        log(f"[logo] {biz.get('name')}: {got[1]}")
    return True


# ---------- backfill laporan lama ----------

def backfill(dsn, limit_reports=50, per_report=60, log=print):
    """Isi logo untuk laporan asli terbaru per pasangan industri+wilayah yang bisnisnya belum punya logo_key.
    Unduhan (jaringan, sampai 4 menit per laporan) dilakukan TANPA kunci; laporan dikunci FOR UPDATE hanya sebentar
    saat logo_key ditempel ke versi terbaru, supaya job Cek kontak pada laporan yang sama tidak tertahan."""
    import psycopg
    total = 0
    with psycopg.connect(dsn, autocommit=True) as conn:
        purged = purge_generic(conn, log=log)
        if purged:
            log(f"[backfill] {purged} logo generik dihapus")
        rows = conn.execute("""SELECT id FROM (
              SELECT id, row_number() OVER (PARTITION BY lower(industry), lower(area) ORDER BY id DESC) rn
              FROM reports WHERE cached_from IS NULL) t WHERE rn = 1 ORDER BY id DESC LIMIT %s""", (limit_reports,)).fetchall()
        for (rid,) in rows:
            row = conn.execute("SELECT report FROM reports WHERE id=%s", (rid,)).fetchone()
            if not row:
                continue
            rep = row[0] if isinstance(row[0], dict) else json.loads(row[0])
            marked, downloaded = enrich_report(conn, rep, limit=per_report, log=log, budget_sec=240)
            if marked or downloaded:
                keys = {key_of(p): p["logo_key"] for p in rep.get("all") or [] if p.get("logo_key") and key_of(p)}
                with conn.transaction():
                    row = conn.execute("SELECT report FROM reports WHERE id=%s FOR UPDATE", (rid,)).fetchone()
                    if row:
                        cur = row[0] if isinstance(row[0], dict) else json.loads(row[0])
                        apply_keys(cur, keys)
                        conn.execute("UPDATE reports SET report=%s WHERE id=%s", (json.dumps(cur, ensure_ascii=False), rid))
            log(f"[backfill] laporan {rid}: {marked} sudah ada, {downloaded} baru")
            total += downloaded
    return total


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Logo bisnis: backfill laporan lama")
    ap.add_argument("--backfill", action="store_true")
    ap.add_argument("--reports", type=int, default=50)
    args = ap.parse_args()
    if args.backfill:
        n = backfill(os.environ.get("DATABASE_URL", "postgres://raqio:raqio@127.0.0.1:5433/raqio"), args.reports)
        print(f"selesai, {n} logo baru")
