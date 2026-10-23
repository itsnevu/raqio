"""
outreach.py, pengirim kampanye mode otomatis (job kind `campaign_send`).

Saluran:
  email    : SMTP (env SMTP_HOST/PORT/USER/PASS/FROM, sama dengan API Go), teks polos + tautan berhenti berlangganan
  whatsapp : gateway WhatsApp Business milik org: fonnte (api.fonnte.com), wablas (URL org), generic (POST JSON {to, message}
             dengan Authorization: Bearer <token>). Semua lewat netutil.fetch_safe-style pagar: hanya https, tanpa IP internal.
Instagram tidak pernah otomatis (akun diblokir), ditolak di API.

Tiap penerima: cek unsubscribes, kirim, catat status, jeda throttle_sec (+ acak 0..30%) di antara pengiriman. Heartbeat dan
cek cancel dilakukan pemanggil (worker) lewat callback.
"""
import json
import os
import random
import re
import smtplib
import time
from email.header import Header
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr

import netutil

LOG_EVERY = 1
# pemutus arus: sekian pengiriman gagal berturut-turut (SMTP/gateway mati) = kampanye dijeda dan dicoba lagi lewat retry
# job (backoff), bukan menandai semua penerima gagal satu per satu
MAX_CONSEC_FAIL = int(os.environ.get("CAMPAIGN_MAX_CONSEC_FAIL", "5"))
# alamat tujuan: satu alamat tanpa spasi/CRLF/pemisah supaya tidak bisa menyisipkan perintah SMTP atau penerima tambahan
EMAIL_RE = re.compile(r"^[^@\s<>,;]{1,64}@[^@\s<>,;]{1,255}$")


class SendError(Exception):
    pass


# ---------- email ----------

def smtp_config():
    return {"host": os.environ.get("SMTP_HOST", ""), "port": int(os.environ.get("SMTP_PORT", "587") or 587),
            "user": os.environ.get("SMTP_USER", ""), "password": os.environ.get("SMTP_PASS", ""),
            "sender": os.environ.get("SMTP_FROM", "Raqio <no-reply@raqio.local>")}


def _clean_header(s):
    """Buang CR/LF (injeksi header) dan karakter kontrol; baris baru diganti spasi."""
    return " ".join(str(s or "").replace("\r", " ").replace("\n", " ").split()).replace("\x00", "")


def build_email(to_addr, subject, body, sender_name="", reply_to="", unsub_url=""):
    cfg = smtp_config()
    name, addr = parseaddr(cfg["sender"])
    if sender_name:
        name = sender_name
    msg = MIMEText(body + (f"\n\n--\nTidak ingin dihubungi lagi? Balas 'stop' atau buka {unsub_url}" if unsub_url else ""), "plain", "utf-8")
    msg["From"] = formataddr((str(Header(_clean_header(name), "utf-8")), addr))
    msg["To"] = _clean_header(to_addr)
    msg["Subject"] = str(Header(_clean_header(subject), "utf-8"))
    if reply_to and "@" in reply_to:
        msg["Reply-To"] = _clean_header(reply_to)
    if unsub_url:
        msg["List-Unsubscribe"] = f"<{unsub_url}>"
    return msg, addr


def send_email(to_addr, subject, body, sender_name="", reply_to="", unsub_url="", smtp_factory=None):
    """Kirim satu email. Port 465 = TLS implisit (SMTP_SSL); port lain memakai STARTTLS, dan kalau server tidak
    mendukungnya kredensial TIDAK dikirim polos (kecuali SMTP_ALLOW_PLAIN=1 untuk relay internal tanpa login)."""
    cfg = smtp_config()
    if not cfg["host"]:
        raise SendError("SMTP_HOST belum diisi di worker")
    to_addr = (to_addr or "").strip()
    if not EMAIL_RE.match(to_addr):
        raise SendError(f"alamat email tidak valid: {to_addr[:60]!r}")
    msg, from_addr = build_email(to_addr, subject, body, sender_name, reply_to, unsub_url)
    implicit_tls = cfg["port"] == 465
    if smtp_factory:
        factory = smtp_factory
    elif implicit_tls:
        factory = lambda: smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=30)
    else:
        factory = lambda: smtplib.SMTP(cfg["host"], cfg["port"], timeout=30)
    with factory() as s:
        if not implicit_tls:
            try:
                s.starttls()
            except smtplib.SMTPException as e:
                if cfg["user"] and os.environ.get("SMTP_ALLOW_PLAIN") != "1":
                    raise SendError("TLS SMTP belum diatur: server menolak STARTTLS, kredensial tidak dikirim tanpa TLS "
                                    "(pakai port 465, atau SMTP_ALLOW_PLAIN=1 hanya untuk relay internal)") from e
        if cfg["user"]:
            s.login(cfg["user"], cfg["password"])
        s.sendmail(from_addr, [to_addr], msg.as_string())


# ---------- whatsapp gateway ----------

def _post_json(url, headers, payload, timeout=20):
    """POST ke gateway lewat pagar netutil: host diperiksa (hanya IP publik) dan koneksi dipin ke IP itu (anti DNS
    rebinding di antara pemeriksaan dan koneksi). Mengembalikan (status, body_text)."""
    cur, host, port, ips = netutil.safe_url(url)
    sess = netutil.pinned_session(host, port, ips)
    try:
        r = sess.post(cur, headers=headers, json=payload, timeout=timeout, allow_redirects=False)
        return int(r.status_code), (r.text or "")[:500]
    finally:
        sess.close()


def _post_form(url, headers, data, timeout=20):
    cur, host, port, ips = netutil.safe_url(url)
    sess = netutil.pinned_session(host, port, ips)
    try:
        r = sess.post(cur, headers=headers, data=data, timeout=timeout, allow_redirects=False)
        return int(r.status_code), (r.text or "")[:500]
    finally:
        sess.close()


def send_whatsapp(to_number, message, sender, post_json=_post_json, post_form=_post_form):
    """Kirim lewat gateway org. sender = dict(wa_provider, wa_gateway_url, wa_gateway_token)."""
    prov = (sender or {}).get("wa_provider") or ""
    token = (sender or {}).get("wa_gateway_token") or ""
    url = (sender or {}).get("wa_gateway_url") or ""
    if not prov or not token:
        raise SendError("gateway WhatsApp belum diatur")
    if prov == "fonnte":
        status, body = post_form("https://api.fonnte.com/send", {"Authorization": token},
                                 {"target": to_number, "message": message, "countryCode": "62"})
    elif prov == "wablas":
        if not url:
            raise SendError("URL gateway Wablas kosong")
        status, body = post_json(url.rstrip("/") + "/api/send-message", {"Authorization": token},
                                 {"data": [{"phone": to_number, "message": message}]})
    elif prov == "generic":
        if not url:
            raise SendError("URL gateway kosong")
        status, body = post_json(url, {"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                                 {"to": to_number, "message": message})
    else:
        raise SendError(f"provider tidak dikenal: {prov}")
    if status >= 300:
        raise SendError(f"gateway {prov} membalas {status}: {body[:160]}")
    low = body.lower()
    if '"status":false' in low.replace(" ", "") or '"status": false' in low:
        raise SendError(f"gateway {prov} menolak: {body[:160]}")
    return body


# ---------- loop kampanye ----------

def run_campaign(conn, job, params, heartbeat, should_stop, log):
    """Proses penerima pending satu per satu. Mengembalikan (status, result, error) untuk worker."""
    cid = int(params["campaign_id"])
    channel = params.get("channel")
    throttle = max(15, int(params.get("throttle_sec") or 90))
    sender = params.get("sender") or {}
    subject = params.get("subject") or ""
    app_url = (params.get("app_url") or os.environ.get("APP_URL") or "http://localhost:3000").rstrip("/")
    org = job["org_id"]
    # dilanjutkan oleh retry job yang sama setelah jeda otomatis (pemutus arus): status kembali running
    conn.execute("UPDATE campaigns SET status='running' WHERE id=%s AND status='paused' AND job_id=%s", (cid, job["id"]))
    sent = failed = skipped = consec = 0
    first = True
    while True:
        if should_stop():
            conn.execute("UPDATE campaigns SET status='paused' WHERE id=%s AND status='running'", (cid,))
            return "cancelled", {"sent": sent, "failed": failed, "skipped": skipped}, "Dihentikan."
        row = conn.execute("""SELECT id, name, to_addr, rendered FROM campaign_recipients
                              WHERE campaign_id=%s AND status='pending' ORDER BY id LIMIT 1""", (cid,)).fetchone()
        if not row:
            break
        rid, name, to_addr, rendered = row
        if not first:
            delay = throttle * (1 + random.random() * 0.3)
            waited = 0.0
            while waited < delay:
                time.sleep(min(5, delay - waited))
                waited += 5
                heartbeat()
                if should_stop():
                    conn.execute("UPDATE campaigns SET status='paused' WHERE id=%s AND status='running'", (cid,))
                    return "cancelled", {"sent": sent, "failed": failed, "skipped": skipped}, "Dihentikan."
        first = False
        unsub = conn.execute("SELECT 1 FROM unsubscribes WHERE org_id=%s AND addr=%s", (org, to_addr)).fetchone()
        if unsub:
            conn.execute("UPDATE campaign_recipients SET status='unsubscribed', error='minta berhenti' WHERE id=%s", (rid,))
            skipped += 1
            log(f"[kampanye] {name}: dilewati, minta berhenti dihubungi")
            continue
        try:
            if channel == "email":
                unsub_url = f"{app_url}/u/{unsub_token(conn, org, to_addr)}"
                send_email(to_addr, subject, rendered, sender.get("name", ""), sender.get("reply_to", ""), unsub_url)
            elif channel == "whatsapp":
                send_whatsapp(to_addr, rendered, sender)
            else:
                raise SendError(f"saluran {channel} tidak bisa otomatis")
            conn.execute("UPDATE campaign_recipients SET status='sent', sent_at=now(), error='' WHERE id=%s", (rid,))
            touch_lead(conn, org, rid, "dihubungi", f"[kampanye #{cid}] terkirim")
            sent += 1
            consec = 0
            log(f"[kampanye] {name}: terkirim ke {to_addr}")
        except Exception as e:  # noqa: BLE001
            err = str(e)[:300]
            conn.execute("UPDATE campaign_recipients SET status='failed', error=%s WHERE id=%s", (err, rid))
            failed += 1
            consec += 1
            log(f"[kampanye] {name}: gagal, {err}")
            if isinstance(e, SendError) and ("belum diisi" in err or "belum diatur" in err):
                conn.execute("UPDATE campaigns SET status='paused' WHERE id=%s", (cid,))
                job["permanent"] = True
                return "failed", {"sent": sent, "failed": failed, "skipped": skipped}, err
            if consec >= MAX_CONSEC_FAIL:
                conn.execute("UPDATE campaigns SET status='paused' WHERE id=%s", (cid,))
                log(f"[kampanye] {consec} pengiriman gagal berturut-turut; kampanye dijeda, dicoba lagi otomatis nanti")
                return "failed", {"sent": sent, "failed": failed, "skipped": skipped}, \
                    f"{consec} pengiriman gagal berturut-turut (terakhir: {err[:120]}); kampanye dijeda, dicoba lagi otomatis"
        heartbeat()
    conn.execute("UPDATE campaigns SET status='done', finished_at=now() WHERE id=%s", (cid,))
    return "done", {"sent": sent, "failed": failed, "skipped": skipped}, None


def unsub_token(conn, org, addr):
    """Token berhenti berlangganan sama persis dengan Go: base64url(org|addr) + "." + 32 karakter pertama dari
    base64url(HMAC-SHA256(AUTH_SECRET, payload)) (lihat App.sign dan unsubToken di campaigns.go)."""
    import base64
    import hashlib
    import hmac
    secret = os.environ.get("AUTH_SECRET", "")
    if not secret:
        raise SendError("AUTH_SECRET belum diisi di worker (token berhenti berlangganan tidak bisa ditandatangani)")
    payload = base64.urlsafe_b64encode(f"{org}|{addr}".encode()).decode().rstrip("=")
    mac = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
    sig = base64.urlsafe_b64encode(mac).decode().rstrip("=")[:32]
    return f"{payload}.{sig}"


def touch_lead(conn, org, recipient_id, status, note):
    row = conn.execute("SELECT lead_key, name FROM campaign_recipients WHERE id=%s", (recipient_id,)).fetchone()
    if not row:
        return
    key, name = row
    rank = {"baru": 0, "dihubungi": 1, "tertarik": 2}.get(status, 0)
    conn.execute("""INSERT INTO leads (org_id, key, name, status, note) VALUES (%s,%s,%s,%s,%s)
        ON CONFLICT (org_id, key) DO UPDATE SET
          status = CASE WHEN (CASE leads.status WHEN 'baru' THEN 0 WHEN 'dihubungi' THEN 1 WHEN 'tertarik' THEN 2 ELSE 3 END) < %s THEN %s ELSE leads.status END,
          note = CASE WHEN leads.note = '' THEN %s ELSE left(leads.note || E'\\n' || %s, 2000) END,
          updated_at = now()""", (org, key, name, status, note, rank, status, note, note))


def params_summary(params):
    return json.dumps({k: v for k, v in (params or {}).items() if k != "sender"}, ensure_ascii=False)[:300]
