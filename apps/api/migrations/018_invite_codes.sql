-- Akses awal Raqio lewat kode undangan (INVITE_ONLY, bawaan aktif) dan catatan email yang mencoba masuk
-- tanpa undangan, supaya peminat bisa dihitung dan dihubungi nanti.

-- Kode undangan disimpan sebagai hash (sama dengan tabel tokens); kode mentah hanya tampil sekali saat dibuat.
-- hint = 4 karakter terakhir, untuk mengenali kode di daftar admin tanpa menyimpan kodenya.
CREATE TABLE IF NOT EXISTS invite_codes (
    code_hash   TEXT PRIMARY KEY,
    hint        TEXT NOT NULL DEFAULT '',
    label       TEXT NOT NULL DEFAULT '',
    max_uses    INT  NOT NULL DEFAULT 1 CHECK (max_uses > 0),
    uses        INT  NOT NULL DEFAULT 0 CHECK (uses >= 0 AND uses <= max_uses),
    expires_at  TIMESTAMPTZ,
    disabled_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- siapa mendaftar dengan kode mana
CREATE TABLE IF NOT EXISTS invite_code_redemptions (
    code_hash  TEXT NOT NULL REFERENCES invite_codes(code_hash),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (code_hash, user_id)
);

-- percobaan masuk/daftar/tamu dari email yang belum diundang. Satu baris per email+sumber per jam (dibatasi di aplikasi).
CREATE TABLE IF NOT EXISTS access_requests (
    id         BIGSERIAL PRIMARY KEY,
    email      TEXT NOT NULL,
    source     TEXT NOT NULL CHECK (source IN ('login', 'register')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_requests_email_time ON access_requests (email, created_at);
CREATE INDEX IF NOT EXISTS access_requests_time ON access_requests (created_at);
