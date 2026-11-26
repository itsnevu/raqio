-- Profil bisnis pengguna (jenis, nama, pelanggan, wilayah, kelebihan, yang dihindari, masalah yang bisa dibantu).
-- Dipakai draf pesan, kecocokan prospek, dan konteks asisten. Nomor 015 dan 016 dipakai branch payments.
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb;
