"""
Monitor website kompetitor: harga, blog, link IG, email.
Jalan harian via cron. Output: diff vs run sebelumnya.

Daftar kompetitor di competitors.json:
    {"kompetitor_a": "https://kompetitor-a.com", ...}

Usage:
    python competitor_website_monitor.py
    python competitor_website_monitor.py --add nama https://domain.com

Semua fetch lewat netutil.fetch_safe: host diperiksa (tolak IP internal), redirect manual maksimal 3 kali,
body maksimal 2 MB, dan regex hanya dijalankan pada 200 KB teks pertama.
"""
import argparse
import hashlib
import json
import os
import re
import time

from bs4 import BeautifulSoup
import netutil

COMPETITORS_FILE = "competitors.json"
STATE_FILE = "website_state.json"
IG_RE = re.compile(r'instagram\.com/([A-Za-z0-9_.]{1,30})')
IG_SKIP = {"p", "reel", "reels", "explore", "accounts", "stories", "tv", "about", "legal"}
# kuantifier dibatasi supaya tidak kuadratik pada teks panjang tanpa '@'
EMAIL_RE = re.compile(r'[\w.+-]{1,64}@[\w-]{1,63}\.[A-Za-z]{2,24}(?:\.[A-Za-z]{2,24})?')
EMAIL_SKIP = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", "sentry", "example.",
              "domain.com", "email.com", "yourdomain", "@sentry")
CONTACT_PATHS = ("/contact", "/kontak", "/contact-us", "/hubungi-kami")
TEXT_LIMIT = netutil.TEXT_LIMIT


def load_competitors():
    if os.path.exists(COMPETITORS_FILE):
        with open(COMPETITORS_FILE) as f:
            return json.load(f)
    return {}


def fetch(url, timeout=15):
    """GET aman (anti SSRF, body <= 2 MB). Melempar netutil.UnsafeURL kalau URL ditolak."""
    return netutil.fetch_safe(url, timeout=timeout)


def find_emails(text):
    return {e for e in EMAIL_RE.findall(text[:TEXT_LIMIT]) if not any(s in e.lower() for s in EMAIL_SKIP)}


def scan(url, timeout=15, contact_pages=True):
    """Pindai satu website: IG, email, judul, harga. Halaman kontak hanya dibuka kalau beranda belum memuat email, dan
    berhenti di halaman pertama yang memuatnya (maksimal 1 + 4 permintaan, masing-masing <= timeout detik)."""
    try:
        r = fetch(url, timeout)
        html = r.text[:TEXT_LIMIT]
        soup = BeautifulSoup(html, "html.parser")
        emails = find_emails(html)
        # cek halaman kontak juga, relatif terhadap URL akhir (setelah redirect yang sudah diperiksa)
        base = r.url.split("?", 1)[0].rstrip("/")
        for path in (CONTACT_PATHS if contact_pages and not emails else ()):
            try:
                rr = fetch(base + path, min(timeout, 8))
                if rr.status_code == 200:
                    emails |= find_emails(rr.text)
                    if emails:
                        break
            except Exception:
                pass
        return {
            "status": r.status_code,
            "hash": hashlib.md5(r.content).hexdigest(),
            "ig_links": sorted({u for u in IG_RE.findall(html) if u.lower() not in IG_SKIP}),
            "emails": sorted(emails),
            "title": (soup.title.string or "").strip() if soup.title else "",
            "h1": [h.get_text(strip=True) for h in soup.find_all("h1")][:3],
            "prices": re.findall(r'Rp\s?[\d.,]{1,20}', html)[:10],
            "blog_links": sorted(set(re.findall(
                r'href="(/blog/[^"]{1,200}|/artikel/[^"]{1,200})"', html)))[:10],
            "truncated": bool(r.truncated),
            "scanned_at": time.strftime("%Y-%m-%d %H:%M"),
        }
    except Exception as e:
        return {"error": str(e)[:300], "scanned_at": time.strftime("%Y-%m-%d %H:%M")}


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {}


def save_state(s):
    with open(STATE_FILE, "w") as f:
        json.dump(s, f, indent=2, ensure_ascii=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--add", nargs=2, metavar=("NAMA", "URL"), help="tambah kompetitor")
    args = ap.parse_args()

    comps = load_competitors()
    if args.add:
        comps[args.add[0]] = args.add[1]
        with open(COMPETITORS_FILE, "w") as f:
            json.dump(comps, f, indent=2)
        print(f"Ditambahkan: {args.add[0]} -> {args.add[1]}")
        return
    if not comps:
        print(f"{COMPETITORS_FILE} kosong. Tambah dulu: "
              f"python competitor_website_monitor.py --add nama https://domain.com")
        return

    old = load_state()
    new = {}
    for name, url in comps.items():
        print(f"[scan] {name} ({url})")
        data = scan(url)
        new[name] = data
        if "error" in data:
            print(f"  error: {data['error'][:100]}")
        else:
            print(f"  IG={data['ig_links']} email={data['emails'][:3]} harga={data['prices'][:3]}")
        prev = old.get(name, {})
        if prev.get("hash") and prev["hash"] != data.get("hash"):
            print(f"  ⚠️ {name} berubah!")
            if prev.get("prices") != data.get("prices"):
                print(f"  harga: {prev.get('prices')} → {data.get('prices')}")
            added = set(data.get("ig_links", [])) - set(prev.get("ig_links", []))
            if added:
                print(f"  IG baru: {added}")
        time.sleep(2)
    save_state(new)


if __name__ == "__main__":
    main()
