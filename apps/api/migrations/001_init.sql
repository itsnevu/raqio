-- Skema awal multi-tenant. Semua data milik org (tenant). User bisa anggota beberapa org.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE orgs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'free',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);

CREATE TABLE memberships (
    org_id   UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role     TEXT NOT NULL DEFAULT 'member',   -- owner | member
    PRIMARY KEY (org_id, user_id)
);

CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
    key        TEXT PRIMARY KEY,       -- ip atau email
    fails      INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ
);

-- Antrian kerja. Worker Python mengambil dengan FOR UPDATE SKIP LOCKED.
CREATE TABLE jobs (
    id               BIGSERIAL PRIMARY KEY,
    org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    kind             TEXT NOT NULL,        -- market_run | market_compare | market_detail
    params           JSONB NOT NULL DEFAULT '{}',
    status           TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | failed | cancelled
    priority         INT NOT NULL DEFAULT 0,          -- lebih kecil = lebih dulu
    log              TEXT NOT NULL DEFAULT '',
    result           JSONB,
    error            TEXT,
    cancel_requested BOOLEAN NOT NULL DEFAULT false,
    attempts         INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at       TIMESTAMPTZ,
    heartbeat_at     TIMESTAMPTZ,
    finished_at      TIMESTAMPTZ
);
CREATE INDEX jobs_queue ON jobs(status, priority, id) WHERE status = 'queued';
CREATE INDEX jobs_org ON jobs(org_id, id DESC);

CREATE TABLE reports (
    id          BIGSERIAL PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    job_id      BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    industry    TEXT NOT NULL,
    area        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    report      JSONB NOT NULL
);
CREATE INDEX reports_org_pair ON reports(org_id, lower(industry), lower(area), id DESC);

CREATE TABLE leads (
    org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    name       TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    remind     DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, key)
);

CREATE TABLE watches (
    org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    industry   TEXT NOT NULL,
    area       TEXT NOT NULL,
    every_days INT NOT NULL DEFAULT 7,
    last_run   TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX watches_pair ON watches(org_id, lower(industry), lower(area));

CREATE TABLE org_settings (
    org_id   UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
    offer    TEXT NOT NULL DEFAULT '',
    goals    JSONB NOT NULL DEFAULT '{}'   -- "industri|wilayah" -> client | rival
);

-- Meteran pemakaian per org per bulan, dasar kuota dan tagihan.
CREATE TABLE usage (
    org_id  UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    period  TEXT NOT NULL,                 -- YYYY-MM
    kind    TEXT NOT NULL,                 -- market_run | market_detail | ...
    count   INT NOT NULL DEFAULT 0,
    PRIMARY KEY (org_id, period, kind)
);
