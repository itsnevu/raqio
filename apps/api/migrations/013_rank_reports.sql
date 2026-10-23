-- Laporan koreksi data dari halaman peringkat publik (/top): masukan anonim "data keliru" per pasangan/bisnis.
-- Dibaca operator lewat DB (lihat runbook); dibatasi 5 kiriman per IP per hari di handler rankReport.
CREATE TABLE IF NOT EXISTS rank_reports (
    id         BIGSERIAL PRIMARY KEY,
    industry   TEXT NOT NULL,
    area       TEXT NOT NULL,
    biz_key    TEXT NOT NULL DEFAULT '',
    message    TEXT NOT NULL,
    ip         TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rank_reports_created ON rank_reports(created_at);
CREATE INDEX IF NOT EXISTS rank_reports_ip_day ON rank_reports(ip, created_at);
