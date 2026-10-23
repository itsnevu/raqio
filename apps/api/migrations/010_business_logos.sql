-- Logo bisnis (favicon/apple-touch-icon website, og:image, atau foto profil Instagram), diunduh dan diperkecil worker
-- menjadi PNG 96 px. Global per bisnis (kunci place_id), bukan per org: gambar publik, dipakai semua laporan.
CREATE TABLE IF NOT EXISTS business_logos (
    key          TEXT PRIMARY KEY,                -- leadKey bisnis (place_id atau maps_url)
    source       TEXT NOT NULL DEFAULT '',        -- website | instagram | og
    content_type TEXT NOT NULL DEFAULT 'image/png',
    data         BYTEA NOT NULL,
    fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
