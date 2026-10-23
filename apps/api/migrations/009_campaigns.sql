-- Kampanye outreach (turn research into client): kirim pesan personal ke prospek lewat WhatsApp (gateway API atau
-- semi-otomatis satu klik), Instagram (semi-otomatis), dan email (otomatis). Plus halaman audit personal per prospek.
CREATE TABLE IF NOT EXISTS campaigns (
    id           BIGSERIAL PRIMARY KEY,
    org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    channel      TEXT NOT NULL CHECK (channel IN ('whatsapp','instagram','email')),
    mode         TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('auto','manual')),   -- auto = worker mengirim (gateway/SMTP)
    subject      TEXT NOT NULL DEFAULT '',          -- email saja
    template     TEXT NOT NULL,                     -- variabel: {nama} {wilayah} {industri} {celah} {rating} {ulasan} {jasa} {pengirim} {audit}
    throttle_sec INT NOT NULL DEFAULT 90 CHECK (throttle_sec BETWEEN 15 AND 3600),
    status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','done')),
    job_id       BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS campaigns_org ON campaigns(org_id, id DESC);
DROP TRIGGER IF EXISTS campaigns_updated_at ON campaigns;
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS campaign_recipients (
    id           BIGSERIAL PRIMARY KEY,
    campaign_id  BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    lead_key     TEXT NOT NULL,
    name         TEXT NOT NULL DEFAULT '',
    to_addr      TEXT NOT NULL DEFAULT '',          -- nomor WA (62...), handle IG, atau email
    vars         JSONB NOT NULL DEFAULT '{}',       -- nilai variabel template untuk prospek ini
    rendered     TEXT NOT NULL DEFAULT '',          -- pesan final siap kirim
    audit_token  TEXT NOT NULL DEFAULT '',          -- tautan audit personal /p/<token>
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped','failed','replied','unsubscribed')),
    error        TEXT NOT NULL DEFAULT '',
    sent_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, lead_key)
);
CREATE INDEX IF NOT EXISTS campaign_recipients_pending ON campaign_recipients(campaign_id, id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS campaign_recipients_audit ON campaign_recipients(audit_token) WHERE audit_token <> '';

-- berhenti berlangganan per org (alamat email atau nomor), dari tautan /u/<token> atau balasan "stop"
CREATE TABLE IF NOT EXISTS unsubscribes (
    org_id   UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    addr     TEXT NOT NULL,
    at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, addr)
);

-- pengaturan pengirim per org
ALTER TABLE org_settings
    ADD COLUMN IF NOT EXISTS sender_name       TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sender_phone      TEXT NOT NULL DEFAULT '',   -- nomor WA owner, dipakai tombol di halaman audit
    ADD COLUMN IF NOT EXISTS reply_to          TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS wa_provider       TEXT NOT NULL DEFAULT '' CHECK (wa_provider IN ('', 'fonnte', 'wablas', 'generic')),
    ADD COLUMN IF NOT EXISTS wa_gateway_url    TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS wa_gateway_token  TEXT NOT NULL DEFAULT '';

-- jenis job baru untuk worker
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK (kind IN ('market_run','market_compare','market_detail','ig_profile','chat','campaign_send'));
