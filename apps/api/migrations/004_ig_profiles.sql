-- Profil Instagram hasil scrape. Data publik, jadi jadi cache bersama lintas org (tidak ada org_id),
-- sama seperti cache tempat di SQLite worker. Yang milik org hanya job yang memintanya.
CREATE TABLE ig_profiles (
    username     TEXT PRIMARY KEY,
    data         JSONB NOT NULL,
    followers    INT,
    history      JSONB NOT NULL DEFAULT '[]',
    last_scraped TIMESTAMPTZ NOT NULL DEFAULT now()
);
