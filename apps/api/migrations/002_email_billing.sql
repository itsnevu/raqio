-- Verifikasi email, reset password, undangan tim, dan tagihan paket.
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
ALTER TABLE orgs  ADD COLUMN plan_until TIMESTAMPTZ;   -- NULL = tanpa batas (free) atau diatur manual

CREATE TABLE tokens (
    hash       TEXT PRIMARY KEY,            -- sha256(token), token mentah hanya ada di email
    kind       TEXT NOT NULL,               -- verify | reset | invite
    email      TEXT NOT NULL,
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    org_id     UUID REFERENCES orgs(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tokens_email ON tokens(email, kind);

CREATE TABLE invoices (
    id          BIGSERIAL PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    provider    TEXT NOT NULL,              -- xendit | manual
    external_id TEXT UNIQUE,                -- id invoice di provider
    plan        TEXT NOT NULL,
    amount      BIGINT NOT NULL,            -- rupiah
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | expired | failed
    url         TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at     TIMESTAMPTZ
);
CREATE INDEX invoices_org ON invoices(org_id, id DESC);
