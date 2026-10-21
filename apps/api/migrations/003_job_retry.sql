-- Retry job: dicoba ulang dengan backoff sampai max_attempts, baru dianggap gagal.
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS run_after    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3;
