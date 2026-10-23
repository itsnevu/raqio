-- Peran bertingkat: viewer < analyst < admin < owner. 'member' lama = analyst.
UPDATE memberships SET role='analyst' WHERE role='member';
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('viewer','analyst','admin','owner'));

-- undangan membawa peran
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'analyst';

-- API key untuk integrasi: Authorization: Bearer rq_<...>. Hanya hash yang disimpan, raw ditampilkan sekali.
CREATE TABLE IF NOT EXISTS api_keys (
    id           BIGSERIAL PRIMARY KEY,
    org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    label        TEXT NOT NULL,
    prefix       TEXT NOT NULL,                    -- 8 karakter awal, untuk dikenali di UI
    hash         TEXT NOT NULL UNIQUE,             -- sha256(raw)
    role         TEXT NOT NULL DEFAULT 'analyst' CHECK (role IN ('viewer','analyst','admin')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS api_keys_org ON api_keys(org_id, id DESC);
