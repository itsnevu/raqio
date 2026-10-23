-- 008: asisten chat sebagai job worker (chat_sessions, chat_messages, job kind 'chat'), dan pengingat lead harian
-- (org_digest). Idempoten: aman dijalankan ulang.

-- ---------- sesi chat: satu percakapan per org, riwayat untuk LLM ditulis worker ----------
CREATE TABLE IF NOT EXISTS chat_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    title           TEXT NOT NULL DEFAULT '',          -- 60 karakter pertama pesan pertama
    history         JSONB NOT NULL DEFAULT '[]',       -- riwayat pesan LLM (ditulis worker, dipotong worker)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS chat_sessions_org_last ON chat_sessions(org_id, last_message_at DESC);
DROP TRIGGER IF EXISTS chat_sessions_set_updated_at ON chat_sessions;
CREATE TRIGGER chat_sessions_set_updated_at BEFORE UPDATE ON chat_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- pesan: user ditulis API, assistant ditulis worker ----------
CREATE TABLE IF NOT EXISTS chat_messages (
    id         BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content    TEXT NOT NULL,
    job_id     BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_session ON chat_messages(session_id, id);
CREATE INDEX IF NOT EXISTS chat_messages_job     ON chat_messages(job_id);

-- ---------- job kind 'chat' ----------
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK (kind IN ('market_run','market_compare','market_detail','ig_profile','chat'));
-- satu job chat aktif per sesi (pengaman race di samping cek di API); pakai kolom params->>'sid'
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active_chat_per_sid ON jobs((params->>'sid'))
 WHERE kind = 'chat' AND status IN ('queued','running');
-- usage.kind bebas (jenis kuota baru seperti 'chat' cukup didaftarkan di Go)
ALTER TABLE usage DROP CONSTRAINT IF EXISTS usage_kind_check;

-- ---------- pengingat lead harian: kapan terakhir ringkasan dikirim ke org ----------
CREATE TABLE IF NOT EXISTS org_digest (
    org_id       UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
