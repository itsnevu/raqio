-- Antrean riset: org boleh mengantrekan beberapa pencarian sekaligus (batas per paket di planLimits.Queue,
-- ditegakkan checkQueueIn di jobs.go dengan advisory lock transaksi per org). Index unik satu-job-aktif dari
-- migrasi 007 dihapus; index parsial biasa menggantikannya supaya hitung job aktif per org tetap murah.
DROP INDEX IF EXISTS jobs_one_active_per_org;
CREATE INDEX IF NOT EXISTS jobs_active_market_per_org ON jobs(org_id)
 WHERE status IN ('queued','running') AND kind IN ('market_run','market_compare','market_detail');
