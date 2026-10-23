-- Filter logo: sidik jari gambar (phash) per logo dan daftar gambar generik (favicon platform, tema, placeholder)
-- yang dipakai banyak bisnis berbeda sehingga bukan logo bisnis. Diisi worker (services/scraper/logo.py).
ALTER TABLE business_logos ADD COLUMN IF NOT EXISTS phash TEXT;
CREATE INDEX IF NOT EXISTS business_logos_phash ON business_logos (phash);
CREATE TABLE IF NOT EXISTS logo_generic (
  phash TEXT PRIMARY KEY,
  seen INT NOT NULL DEFAULT 0,
  example_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
