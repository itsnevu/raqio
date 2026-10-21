-- Jejak audit: siapa melakukan apa di org mana. Diisi otomatis untuk setiap request tulis yang bersesi,
-- plus login. Dipakai untuk keperluan enterprise (investigasi, kepatuhan).
CREATE TABLE IF NOT EXISTS audit_log (
    id         BIGSERIAL PRIMARY KEY,
    org_id     UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,          -- mis. "POST /market/run", "login"
    target     TEXT NOT NULL DEFAULT '',
    ip         TEXT NOT NULL DEFAULT '',
    request_id TEXT NOT NULL DEFAULT '',
    status     INT NOT NULL DEFAULT 0,
    at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_org ON audit_log(org_id, id DESC);
