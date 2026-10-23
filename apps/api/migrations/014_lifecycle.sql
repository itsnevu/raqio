-- Siklus hidup dan tim:
--  orgs.expiry_warned_at  penanda peringatan H-3 masa paket (warnExpiringPlans), di-reset saat perpanjangan
--  jobs.notified          email "laporan siap / riset gagal" dikirim sekali per job (notifyFinishedJobs)
--  leads.assignee         penanggung jawab prospek di tim (anggota org)
--  leads.features         snapshot fitur bisnis SAAT lead dibuat (rating, ulasan, kanal) — fondasi dataset
--                         kalibrasi skor lead; tidak pernah ditimpa oleh pembaruan status
ALTER TABLE orgs  ADD COLUMN IF NOT EXISTS expiry_warned_at TIMESTAMPTZ;
ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS notified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assignee UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS features JSONB;

-- job lama dianggap sudah diberi tahu supaya migrasi tidak memicu banjir email
UPDATE jobs SET notified = true WHERE status IN ('done','failed','cancelled');
CREATE INDEX IF NOT EXISTS jobs_notify_pending ON jobs(finished_at) WHERE notified = false AND status IN ('done','failed');
