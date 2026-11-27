-- Hak produk per organisasi: satu akun Raqio, tetapi tidak otomatis membuka semua produk.
--   scraping = Competitor Scraping (Research, SEO, Marketing Agent)
--   wasuite  = WA-Suite (Customer Service Agent)
CREATE TABLE IF NOT EXISTS org_products (
    org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    product    TEXT NOT NULL CHECK (product IN ('scraping', 'wasuite')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, product)
);
-- Semua org yang sudah ada tetap memakai Competitor Scraping seperti sebelumnya; WA-Suite diberikan terpisah.
INSERT INTO org_products (org_id, product) SELECT id, 'scraping' FROM orgs ON CONFLICT DO NOTHING;

-- Kode undangan menentukan produk yang didapat org baru (bawaan: Competitor Scraping saja).
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS products TEXT[] NOT NULL DEFAULT '{scraping}';

-- Tiket SSO sekali pakai (60 detik) untuk membuka produk di host lain (WA-Suite) tanpa membagikan cookie sesi.
-- Disimpan sebagai hash; ditukar server-ke-server lewat POST /auth/sso/redeem dengan rahasia bersama.
CREATE TABLE IF NOT EXISTS sso_tickets (
    hash       TEXT PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    product    TEXT NOT NULL CHECK (product IN ('scraping', 'wasuite')),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sso_tickets_expires ON sso_tickets (expires_at);
