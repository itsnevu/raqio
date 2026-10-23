"""Tes pengirim kampanye tanpa jaringan: SMTP dan gateway dipalsukan, Postgres dipalsukan dengan dict."""
import outreach


class FakeSMTP:
    sent = []

    def __init__(self):
        self.logged = None

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def starttls(self):
        pass

    def login(self, u, p):
        self.logged = (u, p)

    def sendmail(self, frm, to, msg):
        FakeSMTP.sent.append((frm, to, msg))


def test_build_email_bersih_dari_crlf_dan_bawa_unsubscribe(monkeypatch):
    monkeypatch.setenv("SMTP_FROM", "Raqio <no-reply@raqio.id>")
    msg, frm = outreach.build_email("x@kopi.id", "Halo\r\nBcc: korban@x.id", "isi", sender_name="Budi\nX", reply_to="budi@agency.id", unsub_url="https://r.id/u/t")
    raw = msg.as_string()
    assert frm == "no-reply@raqio.id"
    headers = raw.split("\n\n")[0].splitlines()
    assert not any(h.lower().startswith("bcc:") for h in headers)  # CRLF di subjek tidak jadi header baru
    assert any(h.startswith("Subject:") and "Bcc: korban" in h for h in headers) or any("=?utf-8?" in h for h in headers)
    assert "List-Unsubscribe: <https://r.id/u/t>" in raw
    assert "Reply-To: budi@agency.id" in raw
    assert "berhenti" in raw.lower() or "r.id/u/t" in raw


def test_send_email_butuh_smtp_host(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    try:
        outreach.send_email("x@kopi.id", "s", "b")
        raise AssertionError("harus gagal")
    except outreach.SendError as e:
        assert "SMTP_HOST" in str(e)


def test_send_email_lewat_smtp_palsu(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("SMTP_USER", "u")
    monkeypatch.setenv("SMTP_PASS", "p")
    FakeSMTP.sent.clear()
    outreach.send_email("x@kopi.id", "Subjek", "Isi", smtp_factory=FakeSMTP)
    assert len(FakeSMTP.sent) == 1 and FakeSMTP.sent[0][1] == ["x@kopi.id"]


def test_send_whatsapp_provider(monkeypatch):
    calls = []

    def pj(url, headers, payload, timeout=20):
        calls.append(("json", url, headers, payload))
        return 200, '{"status":true}'

    def pf(url, headers, data, timeout=20):
        calls.append(("form", url, headers, data))
        return 200, '{"status":true}'

    outreach.send_whatsapp("628111", "halo", {"wa_provider": "fonnte", "wa_gateway_token": "T"}, pj, pf)
    outreach.send_whatsapp("628111", "halo", {"wa_provider": "wablas", "wa_gateway_token": "T", "wa_gateway_url": "https://pati.wablas.com/"}, pj, pf)
    outreach.send_whatsapp("628111", "halo", {"wa_provider": "generic", "wa_gateway_token": "T", "wa_gateway_url": "https://gw.x.id/send"}, pj, pf)
    assert calls[0][0] == "form" and "fonnte.com" in calls[0][1] and calls[0][3]["target"] == "628111"
    assert calls[1][1] == "https://pati.wablas.com/api/send-message" and calls[1][3]["data"][0]["phone"] == "628111"
    assert calls[2][2]["Authorization"] == "Bearer T" and calls[2][3] == {"to": "628111", "message": "halo"}
    try:
        outreach.send_whatsapp("628111", "halo", {"wa_provider": "generic", "wa_gateway_token": "T", "wa_gateway_url": "https://gw.x.id/send"},
                               lambda *a, **k: (401, "unauthorized"), pf)
        raise AssertionError("harus gagal")
    except outreach.SendError as e:
        assert "401" in str(e)
    try:
        outreach.send_whatsapp("628111", "halo", {}, pj, pf)
        raise AssertionError("harus gagal")
    except outreach.SendError:
        pass


class FakePg:
    """Simulasi tabel campaign_recipients, unsubscribes, campaigns, leads secukupnya."""

    def __init__(self, recipients, unsub=()):
        self.recipients = recipients  # list dict id,name,to_addr,rendered,status,lead_key
        self.unsub = set(unsub)
        self.campaign_status = "running"
        self.leads = {}

    def execute(self, sql, params=None):
        s = " ".join(sql.split())
        fake = self

        class R:
            def __init__(self, rows):
                self.rows = rows

            def fetchone(self):
                return self.rows[0] if self.rows else None

        if s.startswith("SELECT id, name, to_addr, rendered FROM campaign_recipients"):
            pend = [r for r in fake.recipients if r["status"] == "pending"]
            return R([(r["id"], r["name"], r["to_addr"], r["rendered"]) for r in pend[:1]])
        if s.startswith("SELECT 1 FROM unsubscribes"):
            return R([(1,)] if params[1] in fake.unsub else [])
        if s.startswith("UPDATE campaign_recipients SET status='unsubscribed'"):
            next(r for r in fake.recipients if r["id"] == params[0])["status"] = "unsubscribed"
        elif s.startswith("UPDATE campaign_recipients SET status='sent'"):
            next(r for r in fake.recipients if r["id"] == params[0])["status"] = "sent"
        elif s.startswith("UPDATE campaign_recipients SET status='failed'"):
            r = next(r for r in fake.recipients if r["id"] == params[1])
            r["status"], r["error"] = "failed", params[0]
        elif s.startswith("UPDATE campaigns SET status='done'"):
            fake.campaign_status = "done"
        elif s.startswith("UPDATE campaigns SET status='paused'"):
            fake.campaign_status = "paused"
        elif s.startswith("SELECT lead_key, name FROM campaign_recipients"):
            r = next(r for r in fake.recipients if r["id"] == params[0])
            return R([(r["lead_key"], r["name"])])
        elif s.startswith("INSERT INTO leads"):
            fake.leads[params[1]] = params[3]
        return R([])


def test_run_campaign_whatsapp_kirim_lewati_unsub_dan_selesai(monkeypatch):
    monkeypatch.setattr(outreach, "send_whatsapp", lambda to, msg, sender: "ok")
    monkeypatch.setattr(outreach.time, "sleep", lambda s: None)
    recs = [
        {"id": 1, "name": "A", "to_addr": "628111", "rendered": "halo A", "status": "pending", "lead_key": "a"},
        {"id": 2, "name": "B", "to_addr": "628222", "rendered": "halo B", "status": "pending", "lead_key": "b"},
    ]
    conn = FakePg(recs, unsub={"628222"})
    logs = []
    st, res, err = outreach.run_campaign(conn, {"id": 9, "org_id": "org"}, {"campaign_id": 5, "channel": "whatsapp", "throttle_sec": 15, "sender": {}},
                                         heartbeat=lambda: None, should_stop=lambda: False, log=logs.append)
    assert st == "done" and err is None and res == {"sent": 1, "failed": 0, "skipped": 1}
    assert recs[0]["status"] == "sent" and recs[1]["status"] == "unsubscribed"
    assert conn.campaign_status == "done" and conn.leads["a"] == "dihubungi"


def test_run_campaign_stop_menjeda(monkeypatch):
    recs = [{"id": 1, "name": "A", "to_addr": "628111", "rendered": "x", "status": "pending", "lead_key": "a"}]
    conn = FakePg(recs)
    st, _, err = outreach.run_campaign(conn, {"id": 9, "org_id": "org"}, {"campaign_id": 5, "channel": "whatsapp", "sender": {}},
                                       heartbeat=lambda: None, should_stop=lambda: True, log=lambda t: None)
    assert st == "cancelled" and err == "Dihentikan." and conn.campaign_status == "paused" and recs[0]["status"] == "pending"


def test_run_campaign_gateway_belum_diatur_gagal_permanen(monkeypatch):
    recs = [{"id": 1, "name": "A", "to_addr": "628111", "rendered": "x", "status": "pending", "lead_key": "a"}]
    conn = FakePg(recs)
    job = {"id": 9, "org_id": "org"}
    st, _, err = outreach.run_campaign(conn, job, {"campaign_id": 5, "channel": "whatsapp", "sender": {}},
                                       heartbeat=lambda: None, should_stop=lambda: False, log=lambda t: None)
    assert st == "failed" and "belum diatur" in err and job.get("permanent") and conn.campaign_status == "paused"


def test_unsub_token_sama_dengan_go(monkeypatch):
    import base64
    import hashlib
    import hmac
    monkeypatch.setenv("AUTH_SECRET", "rahasia-tes-yang-panjang-sekali-32")
    tok = outreach.unsub_token(None, "org-1", "x@y.id")
    payload = base64.urlsafe_b64encode(b"org-1|x@y.id").decode().rstrip("=")
    mac = hmac.new(b"rahasia-tes-yang-panjang-sekali-32", payload.encode(), hashlib.sha256).digest()
    sig = base64.urlsafe_b64encode(mac).decode().rstrip("=")[:32]
    assert tok == f"{payload}.{sig}"
    # nilai yang sama dengan Go untuk input yang sama (dibandingkan di tes integrasi Go lewat /u/<token>)
    assert len(sig) == 32 and "=" not in tok
