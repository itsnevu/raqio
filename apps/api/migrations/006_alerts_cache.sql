-- Alert pantauan yang bermakna + saluran notifikasi per org + penanda laporan hasil cache.
ALTER TABLE org_settings
    ADD COLUMN IF NOT EXISTS notify_email   TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS telegram_chat  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS webhook_url    TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS webhook_secret TEXT NOT NULL DEFAULT '';

-- laporan yang sudah diperiksa loop alert (diff vs laporan sebelumnya)
ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS alerted   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cached_from BIGINT;   -- id laporan org lain yang disalin (hasil instan)
CREATE INDEX IF NOT EXISTS reports_unalerted ON reports(id) WHERE alerted = false;
CREATE INDEX IF NOT EXISTS reports_pair_recent ON reports(lower(industry), lower(area), id DESC);

CREATE TABLE IF NOT EXISTS watch_alerts (
    id             BIGSERIAL PRIMARY KEY,
    org_id         UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    report_id      BIGINT REFERENCES reports(id) ON DELETE CASCADE,
    prev_report_id BIGINT REFERENCES reports(id) ON DELETE SET NULL,
    industry       TEXT NOT NULL,
    area           TEXT NOT NULL,
    severity       INT NOT NULL DEFAULT 0,       -- makin besar makin penting
    summary        TEXT NOT NULL,                -- kalimat ringkas, siap dikirim
    changes        JSONB NOT NULL,               -- {new, gone, rating_up, rating_down, reviews_jump}
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    notified_at    TIMESTAMPTZ,
    read_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS watch_alerts_org ON watch_alerts(org_id, id DESC);
