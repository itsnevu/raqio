-- 007: index FK dan kolom waktu, constraint, updated_at, job_logs, webhook_outbox, ringkasan laporan.
-- Idempoten: aman dijalankan ulang. Data lama yang melanggar CHECK dibersihkan dulu supaya migrasi tidak gagal.

-- ---------- index FK dan kolom waktu (retensi, purge, alert) ----------
CREATE INDEX IF NOT EXISTS reports_job            ON reports(job_id);
CREATE INDEX IF NOT EXISTS reports_org_id         ON reports(org_id, id DESC);
CREATE INDEX IF NOT EXISTS reports_created        ON reports(created_at);
CREATE INDEX IF NOT EXISTS reports_cached_from    ON reports(cached_from);
CREATE INDEX IF NOT EXISTS watch_alerts_report    ON watch_alerts(report_id);
CREATE INDEX IF NOT EXISTS watch_alerts_prev      ON watch_alerts(prev_report_id);
CREATE INDEX IF NOT EXISTS audit_log_user         ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_at           ON audit_log(at);
CREATE INDEX IF NOT EXISTS jobs_user              ON jobs(user_id);
CREATE INDEX IF NOT EXISTS jobs_finished          ON jobs(finished_at);
CREATE INDEX IF NOT EXISTS jobs_heartbeat_running ON jobs(heartbeat_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS jobs_ig_username       ON jobs((params->>'username')) WHERE kind = 'ig_profile';
CREATE INDEX IF NOT EXISTS sessions_org           ON sessions(org_id);
CREATE INDEX IF NOT EXISTS tokens_user            ON tokens(user_id);
CREATE INDEX IF NOT EXISTS tokens_org             ON tokens(org_id);
CREATE INDEX IF NOT EXISTS api_keys_created_by    ON api_keys(created_by);
CREATE INDEX IF NOT EXISTS memberships_user       ON memberships(user_id);

-- ---------- FK reports.cached_from ----------
UPDATE reports SET cached_from = NULL
 WHERE cached_from IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reports src WHERE src.id = reports.cached_from);
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_cached_from_fkey;
ALTER TABLE reports ADD CONSTRAINT reports_cached_from_fkey FOREIGN KEY (cached_from) REFERENCES reports(id) ON DELETE SET NULL;

-- ---------- CHECK constraint (bersihkan nilai lama dulu) ----------
UPDATE jobs SET status = 'failed', finished_at = coalesce(finished_at, now()), error = coalesce(error, 'status tidak dikenal (migrasi 007)')
 WHERE status NOT IN ('queued','running','done','failed','cancelled');
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('queued','running','done','failed','cancelled'));

DELETE FROM jobs WHERE kind NOT IN ('market_run','market_compare','market_detail','ig_profile');
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK (kind IN ('market_run','market_compare','market_detail','ig_profile'));

UPDATE leads SET status = 'baru' WHERE status NOT IN ('baru','dihubungi','tertarik','deal','tolak');
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IN ('baru','dihubungi','tertarik','deal','tolak'));

UPDATE invoices SET status = 'failed' WHERE status NOT IN ('pending','paid','expired','failed');
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check CHECK (status IN ('pending','paid','expired','failed'));

DELETE FROM tokens WHERE kind NOT IN ('verify','reset','invite');
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_kind_check;
ALTER TABLE tokens ADD CONSTRAINT tokens_kind_check CHECK (kind IN ('verify','reset','invite'));

UPDATE orgs SET plan = 'free' WHERE plan NOT IN ('free','pro','team','guest');
ALTER TABLE orgs DROP CONSTRAINT IF EXISTS orgs_plan_check;
ALTER TABLE orgs ADD CONSTRAINT orgs_plan_check CHECK (plan IN ('free','pro','team','guest'));

UPDATE watches SET every_days = LEAST(GREATEST(every_days, 1), 90) WHERE every_days < 1 OR every_days > 90;
ALTER TABLE watches DROP CONSTRAINT IF EXISTS watches_every_days_check;
ALTER TABLE watches ADD CONSTRAINT watches_every_days_check CHECK (every_days BETWEEN 1 AND 90);

UPDATE usage SET count = 0 WHERE count < 0;
ALTER TABLE usage DROP CONSTRAINT IF EXISTS usage_count_check;
ALTER TABLE usage ADD CONSTRAINT usage_count_check CHECK (count >= 0);

-- ---------- updated_at + trigger generik ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

ALTER TABLE reports      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE orgs         ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE invoices     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE watches      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE api_keys     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS reports_set_updated_at      ON reports;
DROP TRIGGER IF EXISTS org_settings_set_updated_at ON org_settings;
DROP TRIGGER IF EXISTS orgs_set_updated_at         ON orgs;
DROP TRIGGER IF EXISTS users_set_updated_at        ON users;
DROP TRIGGER IF EXISTS invoices_set_updated_at     ON invoices;
DROP TRIGGER IF EXISTS watches_set_updated_at      ON watches;
DROP TRIGGER IF EXISTS api_keys_set_updated_at     ON api_keys;
CREATE TRIGGER reports_set_updated_at      BEFORE UPDATE ON reports      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER org_settings_set_updated_at BEFORE UPDATE ON org_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orgs_set_updated_at         BEFORE UPDATE ON orgs         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_set_updated_at        BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER invoices_set_updated_at     BEFORE UPDATE ON invoices     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER watches_set_updated_at      BEFORE UPDATE ON watches      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER api_keys_set_updated_at     BEFORE UPDATE ON api_keys     FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- job: satu job pasar aktif per org, fencing worker, refund kuota ----------
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_by TEXT;                       -- id worker yang memegang job (fencing)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS refunded  BOOLEAN NOT NULL DEFAULT false; -- kuota sudah dikembalikan (failed/cancelled)

-- job aktif ganda dari era sebelum index unik: pertahankan yang paling awal, sisanya dibatalkan
UPDATE jobs SET status = 'cancelled', finished_at = now(), error = coalesce(error, 'job aktif ganda dibatalkan (migrasi 007)')
 WHERE status IN ('queued','running') AND kind IN ('market_run','market_compare','market_detail')
   AND id NOT IN (SELECT min(id) FROM jobs WHERE status IN ('queued','running') AND kind IN ('market_run','market_compare','market_detail') GROUP BY org_id);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active_per_org ON jobs(org_id)
 WHERE status IN ('queued','running') AND kind IN ('market_run','market_compare','market_detail');
CREATE INDEX IF NOT EXISTS jobs_refund_pending ON jobs(id) WHERE refunded = false AND status IN ('failed','cancelled');

-- ---------- log job per baris (pengganti append ke jobs.log) ----------
-- Kontrak worker: INSERT INTO job_logs(job_id, seq, line) VALUES (%s, %s, %s); seq naik monoton per job.
CREATE TABLE IF NOT EXISTS job_logs (
    id     BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    seq    INT NOT NULL,
    line   TEXT NOT NULL,
    at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_logs_job_seq ON job_logs(job_id, seq);

-- ---------- outbox webhook: dikirim loop latar belakang dengan backoff ----------
CREATE TABLE IF NOT EXISTS webhook_outbox (
    id           BIGSERIAL PRIMARY KEY,
    org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    event        TEXT NOT NULL,
    payload      JSONB NOT NULL,
    attempts     INT NOT NULL DEFAULT 0,
    next_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    last_error   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_outbox_pending ON webhook_outbox(next_at) WHERE delivered_at IS NULL;
CREATE INDEX IF NOT EXISTS webhook_outbox_org ON webhook_outbox(org_id);

-- ---------- satu laporan per (job, wilayah): cegah duplikat saat worker crash di antara insert dan finish ----------
UPDATE reports SET job_id = NULL WHERE id IN (
    SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY job_id, lower(area) ORDER BY id DESC) rn
                    FROM reports WHERE job_id IS NOT NULL) x WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS reports_job_area ON reports(job_id, lower(area)) WHERE job_id IS NOT NULL;

-- ---------- ringkasan laporan di kolom sendiri (daftar dan pantau tidak membaca JSON penuh) ----------
-- Kontrak worker: INSERT INTO reports (..., report, summary) VALUES (..., %s, %s::jsonb) dengan summary = report["summary"].
ALTER TABLE reports ADD COLUMN IF NOT EXISTS summary JSONB;
UPDATE reports SET summary = report->'summary' WHERE summary IS NULL AND report ? 'summary';
