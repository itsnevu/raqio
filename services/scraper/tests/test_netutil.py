"""safe_url dan fetch_safe: anti SSRF, redirect manual, batas body 2 MB. Resolver dan request di-mock."""
import pytest

import netutil
from competitor_website_monitor import EMAIL_RE, find_emails

PUBLIC = {"contoh.com": ["93.184.216.34"], "v6.contoh.com": ["2606:4700::1111"],
          "campur.contoh.com": ["93.184.216.34", "10.0.0.5"], "jahat.contoh.com": ["127.0.0.1"],
          "meta.contoh.com": ["169.254.169.254"], "cgnat.contoh.com": ["100.64.0.1"], "ula.contoh.com": ["fd00::1"],
          "mapped.contoh.com": ["::ffff:10.0.0.1"], "mc.contoh.com": ["224.0.0.1"]}


@pytest.fixture(autouse=True)
def mock_resolver(monkeypatch):
    def resolve(host):
        if host not in PUBLIC:
            raise netutil.UnsafeURL(f"host tidak bisa di-resolve: {host}")
        return PUBLIC[host]
    monkeypatch.setattr(netutil, "resolve_host", resolve)


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/", "http://10.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]/",
    "http://localhost/", "http://localhost:8080/", "http://app.localhost/", "http://100.64.0.1/",
    "http://[fd00::1]/", "http://[::ffff:127.0.0.1]/", "http://224.0.0.1/", "http://0.0.0.0/",
    "http://jahat.contoh.com/", "http://meta.contoh.com/", "http://campur.contoh.com/",
    "http://cgnat.contoh.com/", "http://ula.contoh.com/", "http://mapped.contoh.com/", "http://mc.contoh.com/",
    "http://postgres:5432/", "http://legacy:8000/",
])
def test_safe_url_menolak_jaringan_internal(url):
    with pytest.raises(netutil.UnsafeURL):
        netutil.safe_url(url)


@pytest.mark.parametrize("url", [
    "ftp://contoh.com/", "file:///etc/passwd", "gopher://contoh.com/", "javascript:alert(1)",
    "http://contoh.com:22/", "http://contoh.com:5432/", "https://contoh.com:9200/",
    "http://user:pass@contoh.com/", "http://user@contoh.com/", "", "   ", "http:///path",
])
def test_safe_url_menolak_skema_port_userinfo(url):
    with pytest.raises(netutil.UnsafeURL):
        netutil.safe_url(url)


def test_safe_url_menerima_host_publik():
    url, host, port, ips = netutil.safe_url("https://contoh.com/menu?x=1#top")
    assert (url, host, port, ips) == ("https://contoh.com/menu?x=1", "contoh.com", 443, ["93.184.216.34"])
    assert netutil.safe_url("contoh.com")[0] == "https://contoh.com/"  # tanpa skema = https
    assert netutil.safe_url("http://contoh.com:8080/a")[0] == "http://contoh.com:8080/a"
    assert netutil.safe_url("https://contoh.com:8443")[0] == "https://contoh.com:8443/"
    assert netutil.safe_url("http://v6.contoh.com/")[3] == ["2606:4700::1111"]
    assert netutil.safe_url("http://93.184.216.34/")[3] == ["93.184.216.34"]  # IP publik literal boleh


def test_is_public_ip():
    assert netutil.is_public_ip("8.8.8.8") and netutil.is_public_ip("2606:4700::1111")
    for ip in ("127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "100.64.0.1",
               "fc00::1", "fe80::1", "224.0.0.1", "0.0.0.0", "::ffff:10.0.0.1", "255.255.255.255", "bukan-ip"):
        assert not netutil.is_public_ip(ip), ip


class FakeResp:
    def __init__(self, status=200, headers=None, body=b"", chunk=65536):
        self.status_code = status
        self.headers = headers or {"content-type": "text/html; charset=utf-8"}
        self._body = body
        self._chunk = chunk
        self.closed = False

    def iter_content(self, chunk_size=65536):
        for i in range(0, len(self._body), self._chunk):
            yield self._body[i:i + self._chunk]

    def close(self):
        self.closed = True


def test_fetch_safe_mengikuti_redirect_maksimal_3_dan_cek_ulang(monkeypatch):
    seen = []

    def fake_open(url, host, port, ips, timeout, headers):
        seen.append(url)
        if url.endswith("/hop"):
            return FakeResp(301, {"location": "/hop"})
        if url.endswith("/ke-internal"):
            return FakeResp(302, {"location": "http://jahat.contoh.com/admin"})
        if url.endswith("/sekali"):
            return FakeResp(302, {"location": "/tujuan"})
        return FakeResp(200, body=b"<html>hubungi kami@contoh.com</html>")
    monkeypatch.setattr(netutil, "_open", fake_open)
    r = netutil.fetch_safe("https://contoh.com/sekali")
    assert r.status_code == 200 and r.url == "https://contoh.com/tujuan" and "kami@contoh.com" in r.text
    with pytest.raises(netutil.UnsafeURL, match="internal"):
        netutil.fetch_safe("https://contoh.com/ke-internal")  # redirect ke loopback ditolak
    seen.clear()
    with pytest.raises(netutil.UnsafeURL, match="redirect"):
        netutil.fetch_safe("https://contoh.com/hop")
    assert len(seen) == 4  # 1 permintaan + 3 redirect, lalu berhenti


def test_fetch_safe_membatasi_body_2mb(monkeypatch):
    big = b"a" * (3 * 1024 * 1024)
    resp = FakeResp(200, body=big, chunk=256 * 1024)
    monkeypatch.setattr(netutil, "_open", lambda *a, **k: resp)
    r = netutil.fetch_safe("https://contoh.com/")
    assert len(r.content) == 2 * 1024 * 1024 and r.truncated and resp.closed
    kecil = FakeResp(200, body=b"x" * 1000)
    monkeypatch.setattr(netutil, "_open", lambda *a, **k: kecil)
    r = netutil.fetch_safe("https://contoh.com/")
    assert len(r.content) == 1000 and not r.truncated


def test_fetch_safe_menolak_sebelum_request(monkeypatch):
    called = []
    monkeypatch.setattr(netutil, "_open", lambda *a, **k: called.append(1))
    with pytest.raises(netutil.UnsafeURL):
        netutil.fetch_safe("http://169.254.169.254/latest/meta-data")
    assert not called


def test_email_re_tidak_kuadratik_dan_dipotong_200kb():
    import time
    teks = "a" * 400_000  # tanpa '@': regex lama kuadratik
    t0 = time.time()
    assert find_emails(teks) == set()
    assert time.time() - t0 < 2
    assert EMAIL_RE.findall("hubungi a.b@c.co.id atau x@y.com") == ["a.b@c.co.id", "x@y.com"]
    jauh = "b" * 300_000 + " rahasia@contoh.com"
    assert find_emails(jauh) == set()  # di luar 200 KB pertama tidak diproses
