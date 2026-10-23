"""
gmaps.py, scrape hasil pencarian Google Maps TANPA login (Playwright + browserforge).

search("coffee shop kemang")  -> list bisnis: nama, rating, jumlah review, kategori,
                                  harga, alamat, koordinat, link Maps
details(places, limit=20)     -> tambah telepon, website, jam buka (buka halaman tiap tempat)

Catatan: Google sering mengubah tampilan Maps, kalau hasil kosong, selector di
bawah perlu disesuaikan.
"""
import logging
import random
import re
import time
from urllib.parse import quote_plus, unquote

from browserforge.fingerprints import FingerprintGenerator
from browserforge.injectors.playwright import NewContext
from playwright.sync_api import sync_playwright

log = logging.getLogger("gmaps")

RATING_RE = re.compile(r"^(\d[,.]\d)\s*\(([\d.,]+)\)")
PRICE_RE = re.compile(r"(Rp\s?[\d.,]+\s?[–-]\s?[\d.,]+\s?(?:rb|jt)?|Rp\s?[\d.,]+\+?\s?(?:rb|jt)?|\${1,4})")
COORD_RE = re.compile(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)")
PLACE_ID_RE = re.compile(r"!1s(0x[0-9a-f]+:0x[0-9a-f]+)")
MAPS_URL_PREFIXES = ("https://www.google.com/maps/", "https://maps.google.com/", "https://www.google.co.id/maps/",
                     "https://google.com/maps/", "https://maps.app.goo.gl/")


class Blocked(RuntimeError):
    """Google menampilkan halaman captcha / 'unusual traffic': kegagalan sementara (worker mengulang dengan backoff),
    bukan 'tidak ada hasil' yang permanen."""


def is_maps_url(u) -> bool:
    """Hanya tautan Google Maps yang boleh dibuka browser detail (laporan JSON bisa datang dari luar proses ini)."""
    return isinstance(u, str) and u.startswith(MAPS_URL_PREFIXES)


def blocked(page) -> bool:
    """True kalau yang tampil halaman captcha / blokir Google (URL /sorry/, form captcha, teks 'unusual traffic')."""
    try:
        url = (page.url or "").lower()
        if "/sorry/" in url or "recaptcha" in url:
            return True
        if page.locator("form#captcha-form, iframe[src*='recaptcha'], #recaptcha").count():
            return True
        for txt in ("unusual traffic", "lalu lintas yang tidak biasa"):
            if page.get_by_text(txt).count():
                return True
    except Exception:
        return False
    return False


def _num(s: str) -> int:
    return int(re.sub(r"[^\d]", "", s) or 0)


def _context(browser):
    fp = FingerprintGenerator(browser="chrome", os=("macos", "windows"),
                              device="desktop", locale="id-ID").generate()
    return NewContext(browser, fingerprint=fp)


PUA_RE = re.compile(r"[-]")  # ikon Google Maps (Private Use Area)


def _parse_card(label: str, text: str, href: str) -> dict:
    text = PUA_RE.sub("", text)
    lines = [l.strip() for l in text.split("\n") if l.strip() and l.strip() != label]
    d = {"name": label, "maps_url": href.split("?")[0], "rating": None, "reviews": 0,
         "category": "", "price": "", "address": "", "status": ""}
    for l in lines:
        m = RATING_RE.match(l)
        if m:
            d["rating"] = float(m.group(1).replace(",", "."))
            d["reviews"] = _num(m.group(2))
            continue
        if "·" in l and not d["category"]:
            parts = [p.strip() for p in l.split("·") if p.strip()]
            if parts and not parts[0].startswith(("Buka", "Tutup", "Open", "Closed")):  # status jam, bukan kategori
                d["category"] = parts[0]
            for p in parts[1:]:
                if PRICE_RE.fullmatch(p.replace(" ", " ")):
                    d["price"] = p
                elif not d["address"]:
                    d["address"] = p
            continue
        if l.startswith(("Buka", "Tutup", "Open", "Closed", "Tutup permanen", "Tutup sementara")) and not d["status"]:
            d["status"] = l.split("·")[0].strip()
    m = COORD_RE.search(unquote(href))
    if m:
        d["lat"], d["lon"] = float(m.group(1)), float(m.group(2))
    m = PLACE_ID_RE.search(unquote(href))
    d["place_id"] = m.group(1) if m else d["maps_url"]
    return d


def search(query: str, max_results: int = 80, headless: bool = True) -> list:
    """Hasil pencarian Maps (scroll sampai habis / max_results). Melempar Blocked kalau Google menampilkan captcha."""
    out, seen = [], set()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        try:
            page = _context(browser).new_page()
            page.goto(f"https://www.google.com/maps/search/{quote_plus(query)}?hl=id",
                      wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(4000)
            # klik "Setuju" kalau muncul halaman consent
            for txt in ("Terima semua", "Accept all", "Setuju"):
                btn = page.get_by_role("button", name=txt)
                if btn.count():
                    btn.first.click(); page.wait_for_timeout(2000); break
            if blocked(page):
                raise Blocked("Google Maps menampilkan captcha / blokir sementara; coba lagi beberapa menit lagi")
            feed = page.locator('div[role="feed"]')
            if not feed.count():
                # query sangat spesifik -> langsung ke 1 tempat
                log.info("[gmaps] tidak ada daftar hasil (mungkin 1 tempat)")
                return out
            stale = 0
            while len(out) < max_results and stale < 4:
                cards = page.locator('div[role="feed"] a[href*="/maps/place/"]')
                before = len(out)
                for i in range(cards.count()):
                    a = cards.nth(i)
                    href = a.get_attribute("href") or ""
                    label = a.get_attribute("aria-label") or ""
                    if not label or href in seen:
                        continue
                    seen.add(href)
                    try:
                        text = a.locator("xpath=..").inner_text(timeout=2000)
                    except Exception:
                        text = ""
                    card = _parse_card(label, text, href)
                    # foto profil di kartu (lh3/lh5.googleusercontent.com): sumber logo kalau website/IG tidak ada
                    try:
                        img = a.locator("xpath=..").locator("img").first
                        src = img.get_attribute("src", timeout=1000) if img.count() else ""
                        if src and src.startswith("https://") and "googleusercontent" in src:
                            card["photo"] = src.split("=")[0] + "=w192-h192-k-no"
                    except Exception:
                        pass
                    out.append(card)
                    if len(out) >= max_results:
                        break
                if page.get_by_text("Anda telah mencapai akhir daftar").count() or \
                   page.get_by_text("You've reached the end of the list").count():
                    break
                stale = stale + 1 if len(out) == before else 0
                feed.first.evaluate("e => e.scrollBy(0, e.scrollHeight)")
                page.wait_for_timeout(random.randint(1500, 2500))
        finally:
            browser.close()
    log.info(f"[gmaps] '{query}': {len(out)} tempat")
    return out


def details(places: list, limit: int = 20, headless: bool = True, budget_sec: float = None) -> None:
    """Isi phone, website, hours untuk `limit` tempat pertama (in-place). Berhenti setelah `budget_sec` detik total
    (sisanya tetap tanpa detail) supaya Maps yang lambat tidak menghabiskan jatah waktu job; juga berhenti kalau Google
    memblokir (captcha). Tautan yang bukan Google Maps tidak dibuka (ditandai _detail_error)."""
    todo = [p for p in places if not p.get("_detailed")][:limit]
    if not todo:
        return
    t0 = time.time()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=headless)
        try:
            page = _context(browser).new_page()
            for i, d in enumerate(todo):
                if budget_sec and time.time() - t0 > budget_sec:
                    log.info(f"[gmaps] detail dihentikan: batas {budget_sec:.0f} detik habis, {len(todo) - i} tempat belum dicek")
                    break
                if not is_maps_url(d.get("maps_url")):
                    d["_detail_error"] = "bukan tautan Google Maps"
                    log.info(f"[gmaps] detail dilewati {d.get('name')}: bukan tautan Google Maps")
                    continue
                try:
                    page.goto(d["maps_url"] + ("&" if "?" in d["maps_url"] else "?") + "hl=id", wait_until="domcontentloaded", timeout=45000)
                    if blocked(page):
                        log.info(f"[gmaps] Maps memblokir sementara (captcha); detail dihentikan, {len(todo) - i} tempat belum dicek")
                        break
                    page.wait_for_selector('h1', timeout=15000)
                    page.wait_for_timeout(1200)
                    phone = page.locator('button[data-item-id^="phone:tel:"]')
                    if phone.count():
                        d["phone"] = phone.first.get_attribute("data-item-id").split("tel:", 1)[1]
                    site = page.locator('a[data-item-id="authority"]')
                    if site.count():
                        d["website"] = site.first.get_attribute("href") or ""
                    # link sosmed kadang ada di bagian info
                    for a in page.locator('a[href*="instagram.com/"]').all()[:3]:
                        m = re.search(r"instagram\.com/([A-Za-z0-9_.]{3,30})", a.get_attribute("href") or "")
                        if m and m.group(1).lower() not in ("p", "reel", "explore", "accounts"):
                            d["instagram"] = m.group(1); break
                    if d.get("website") and "instagram.com/" in d["website"]:
                        m = re.search(r"instagram\.com/([A-Za-z0-9_.]{3,30})", d["website"])
                        if m:
                            d["instagram"] = m.group(1); d["website"] = ""
                    d["_detailed"] = True
                except Exception as e:
                    log.info(f"[gmaps] detail gagal {d['name']}: {str(e)[:80]}")
                page.wait_for_timeout(random.randint(800, 1600))
        finally:
            browser.close()


if __name__ == "__main__":
    import json
    import sys
    logging.basicConfig(level=logging.INFO)
    res = search(" ".join(sys.argv[1:]) or "coffee shop kemang", max_results=30)
    details(res, limit=5)
    print(json.dumps(res[:8], indent=2, ensure_ascii=False))
