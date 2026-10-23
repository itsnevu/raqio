"""
netutil.py, HTTP client bersama yang tahan blokir DNS ISP, plus fetch aman untuk website pihak ketiga.

ISP Indonesia memblokir situs dengan membelokkan DNS ke server blokir, sehingga
muncul error SSL ("no alternative certificate subject name", "self signed").
Di sini nama domain di-resolve lewat DNS-over-HTTPS (Cloudflare/Google), jadi
tidak bisa dibelokkan. Verifikasi sertifikat TETAP aktif, koneksi tetap aman.

Tidak menembus blokir berbasis SNI/DPI; untuk itu perlu VPN/proxy.

Bagian kedua (safe_url, fetch_safe) dipakai untuk membuka website bisnis dari hasil scraping,
yang bisa saja diisi penyerang. Aturannya:
  - hanya http/https, port 80/443/8080/8443, tanpa userinfo;
  - host di-resolve dulu, semua IP harus publik (tolak privat/loopback/link-local/CGNAT/ULA/multicast);
  - koneksi dipin ke IP yang sudah diperiksa (CURLOPT_RESOLVE) supaya DNS rebinding tidak bisa menukar IP;
  - redirect diikuti manual maksimal 3 kali, tiap tujuan diperiksa ulang;
  - body dibaca streaming dan dihentikan setelah MAX_BODY (2 MB).
"""
import ipaddress
import socket
import time
from urllib.parse import urljoin, urlsplit, urlunsplit

from curl_cffi import CurlOpt
from curl_cffi import requests as creq

DOH_SERVERS = [b"https://1.1.1.1/dns-query", b"https://8.8.8.8/dns-query"]


def session(impersonate="chrome", doh=0):
    """curl_cffi Session dengan DNS-over-HTTPS."""
    return creq.Session(impersonate=impersonate,
                        curl_options={CurlOpt.DOH_URL: DOH_SERVERS[doh % len(DOH_SERVERS)]})


def request(method, url, retries=3, **kw):
    """GET/POST dengan DoH + retry; ganti server DoH kalau gagal."""
    kw.setdefault("timeout", 20)
    kw.setdefault("impersonate", "chrome")
    last = None
    for i in range(retries):
        try:
            opts = {CurlOpt.DOH_URL: DOH_SERVERS[i % len(DOH_SERVERS)]}
            return creq.request(method, url, curl_options=opts, **kw)
        except Exception as e:
            last = e
            if i + 1 < retries:  # tidak perlu menunggu setelah percobaan terakhir
                time.sleep(2 * (i + 1))
    raise last


def get(url, **kw):
    return request("GET", url, **kw)


def post(url, **kw):
    return request("POST", url, **kw)


# ---------------------------------------------------------------------------
# fetch aman (anti SSRF) untuk website bisnis
# ---------------------------------------------------------------------------

ALLOWED_SCHEMES = ("http", "https")
ALLOWED_PORTS = (80, 443, 8080, 8443)
MAX_BODY = 2 * 1024 * 1024       # byte; body dipotong setelah ini
MAX_REDIRECTS = 3
TEXT_LIMIT = 200 * 1024          # karakter teks yang diproses regex (email, harga)
CGNAT = ipaddress.ip_network("100.64.0.0/10")


class UnsafeURL(ValueError):
    """URL ditolak karena skema/port/host tidak diizinkan atau mengarah ke jaringan internal."""


def is_public_ip(ip) -> bool:
    """True hanya untuk alamat yang boleh dihubungi dari worker."""
    try:
        ip = ipaddress.ip_address(ip.strip("[]") if isinstance(ip, str) else ip)
    except ValueError:
        return False
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if ip.version == 6 and getattr(ip, "sixtofour", None) is not None:
        ip = ip.sixtofour
    if ip.version == 6 and getattr(ip, "teredo", None) is not None:
        ip = ip.teredo[1]
    if (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved
            or ip.is_unspecified or not ip.is_global):
        return False
    if ip.version == 4 and ip in CGNAT:
        return False
    return True


def resolve_host(host: str) -> list:
    """Semua alamat IP (v4 dan v6) untuk host. Dipisah supaya mudah di-mock di tes."""
    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise UnsafeURL(f"host tidak bisa di-resolve: {host} ({e})") from e
    return sorted({ai[4][0] for ai in infos})


def safe_url(u: str):
    """Periksa URL. Mengembalikan (url_normal, host, port, [ip]) atau melempar UnsafeURL."""
    if not isinstance(u, str) or not u.strip():
        raise UnsafeURL("url kosong")
    u = u.strip()
    if "://" not in u:
        u = "https://" + u
    parts = urlsplit(u)
    scheme = (parts.scheme or "").lower()
    if scheme not in ALLOWED_SCHEMES:
        raise UnsafeURL(f"skema tidak diizinkan: {scheme or '-'}")
    if parts.username is not None or parts.password is not None:
        raise UnsafeURL("url dengan userinfo ditolak")
    host = (parts.hostname or "").strip().strip(".").lower()
    if not host:
        raise UnsafeURL("host kosong")
    try:
        port = parts.port
    except ValueError as e:
        raise UnsafeURL("port tidak valid") from e
    if port is None:
        port = 443 if scheme == "https" else 80
    if port not in ALLOWED_PORTS:
        raise UnsafeURL(f"port tidak diizinkan: {port}")
    if host == "localhost" or host.endswith(".localhost") or host.endswith(".local") or host.endswith(".internal"):
        raise UnsafeURL(f"host internal ditolak: {host}")
    try:
        ipaddress.ip_address(host)
        ips = [host]
    except ValueError:
        if "." not in host:  # nama tanpa titik = host jaringan lokal (mis. "postgres", "legacy")
            raise UnsafeURL(f"host tanpa domain ditolak: {host}") from None
        ips = resolve_host(host)
    if not ips:
        raise UnsafeURL(f"host tidak punya alamat: {host}")
    bad = [ip for ip in ips if not is_public_ip(ip)]
    if bad:
        raise UnsafeURL(f"host mengarah ke jaringan internal: {host} -> {bad[0]}")
    netloc = f"[{host}]" if ":" in host else host
    if port not in (80, 443) or (scheme == "http" and port != 80) or (scheme == "https" and port != 443):
        netloc += f":{port}"
    url = urlunsplit((scheme, netloc, parts.path or "/", parts.query, ""))
    return url, host, port, ips


class SafeResponse:
    """Hasil fetch_safe: status, header, body (maksimal MAX_BODY), penanda terpotong."""

    def __init__(self, url, status_code, headers, content, truncated):
        self.url = url
        self.status_code = status_code
        self.headers = headers or {}
        self.content = content
        self.truncated = truncated

    @property
    def text(self) -> str:
        ctype = str(self.headers.get("content-type") or "")
        enc = "utf-8"
        if "charset=" in ctype.lower():
            enc = ctype.lower().split("charset=", 1)[1].split(";")[0].strip().strip('"') or "utf-8"
        try:
            return self.content.decode(enc, errors="replace")
        except LookupError:
            return self.content.decode("utf-8", errors="replace")

    @property
    def ok(self) -> bool:
        return 200 <= self.status_code < 300


def pinned_session(host, port, ips, impersonate="chrome"):
    """Session curl_cffi yang koneksinya dipin ke IP hasil safe_url (CURLOPT_RESOLVE), supaya DNS rebinding di antara
    pemeriksaan dan koneksi tidak bisa menukar tujuan. Dipakai fetch_safe dan gateway WhatsApp (outreach)."""
    return creq.Session(impersonate=impersonate, curl_options={CurlOpt.RESOLVE: [f"{host}:{port}:{','.join(ips)}"]})


def _open(url, host, port, ips, timeout, headers):
    """Satu request tanpa redirect, koneksi dipin ke IP yang sudah diperiksa. Dipisah supaya bisa di-mock."""
    s = pinned_session(host, port, ips)
    try:
        resp = s.request("GET", url, allow_redirects=False, stream=True, timeout=timeout, headers=headers or None)
    except Exception:
        s.close()
        raise
    resp._raqio_session = s  # ditutup di read_limited
    return resp


def read_limited(resp, max_bytes=MAX_BODY):
    """Baca body streaming, berhenti setelah max_bytes. Mengembalikan (bytes, terpotong)."""
    buf, total, truncated = [], 0, False
    try:
        for chunk in resp.iter_content(chunk_size=65536):
            if not chunk:
                continue
            room = max_bytes - total
            if len(chunk) >= room:
                buf.append(chunk[:room])
                total += len(chunk[:room])
                truncated = True  # masih ada sisa yang tidak dibaca (atau pas di batas; ditandai terpotong)
                break
            buf.append(chunk)
            total += len(chunk)
    finally:
        for closer in (getattr(resp, "close", None), getattr(getattr(resp, "_raqio_session", None), "close", None)):
            try:
                if closer:
                    closer()
            except Exception:
                pass
    return b"".join(buf), truncated


def fetch_safe(url, timeout=15, max_bytes=MAX_BODY, max_redirects=MAX_REDIRECTS, headers=None):
    """GET website pihak ketiga dengan semua pagar di atas. Melempar UnsafeURL atau error jaringan."""
    cur = url
    for _ in range(max_redirects + 1):
        cur, host, port, ips = safe_url(cur)
        resp = _open(cur, host, port, ips, timeout, headers)
        status = int(getattr(resp, "status_code", 0) or 0)
        hdrs = {str(k).lower(): v for k, v in dict(getattr(resp, "headers", None) or {}).items()}
        if status in (301, 302, 303, 307, 308) and hdrs.get("location"):
            read_limited(resp, 0)  # tutup koneksi tanpa membaca body
            cur = urljoin(cur, str(hdrs["location"]))
            continue
        body, truncated = read_limited(resp, max_bytes)
        return SafeResponse(cur, status, hdrs, body, truncated)
    raise UnsafeURL(f"terlalu banyak redirect (> {max_redirects}): {url}")
