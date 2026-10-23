package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

// chatParams: bentuk params job chat sesuai kontrak dengan worker (chat.go).
type chatParams struct {
	Sid       string `json:"sid"`
	Message   string `json:"message"`
	MessageID int64  `json:"message_id"`
	Limits    struct {
		Runs    int `json:"runs"`
		Details int `json:"details"`
	} `json:"limits"`
	AppURL   string          `json:"app_url"`
	OrgName  string          `json:"org_name"`
	Plan     string          `json:"plan"`
	Role     string          `json:"role"`
	Verified bool            `json:"verified"`
	Context  json.RawMessage `json:"context"`
}

func jobParams(t *testing.T, e *testEnv, job int64) (string, chatParams) {
	t.Helper()
	var kind string
	var raw []byte
	if err := e.app.db.QueryRow(context.Background(), `SELECT kind, params FROM jobs WHERE id=$1`, job).Scan(&kind, &raw); err != nil {
		t.Fatalf("job %d: %v", job, err)
	}
	var p chatParams
	if err := json.Unmarshal(raw, &p); err != nil {
		t.Fatalf("params job %d: %v", job, err)
	}
	return kind, p
}

func jobID(t *testing.T, j map[string]any) int64 {
	t.Helper()
	f, ok := j["job"].(float64)
	if !ok || f <= 0 {
		t.Fatalf("job tidak ada di balasan: %v", j)
	}
	return int64(f)
}

// TestIntegrationChat: alur asisten lewat job worker: sesi, pesan user, job kind chat, polling, simulasi worker,
// job ganda per sesi, stop + refund, isolasi org, hapus sesi, CHAT_ENABLED=0.
func TestIntegrationChat(t *testing.T) {
	t.Setenv("CHAT_ENABLED", "1")
	t.Setenv("APP_URL", "http://app.test/")
	e := setupIntegration(t)
	a := e.client()
	a.register("chat@x.id", "Chat")
	org := orgOf(t, a)
	ctx := context.Background()

	code, j := a.post("/chat/sid", map[string]any{})
	a.must(200, code, j)
	sid, _ := j["sid"].(string)
	if !uuidRe.MatchString(sid) {
		t.Fatalf("sid: %v", j)
	}
	code, j = a.get("/chat/sessions")
	a.must(200, code, j)
	if len(j["sessions"].([]any)) != 0 {
		t.Fatalf("sesi kosong tidak boleh masuk daftar: %v", j)
	}

	// validasi pesan
	code, j = a.post("/chat", map[string]any{"sid": sid, "message": "   "})
	a.must(400, code, j)
	code, j = a.post("/chat", map[string]any{"sid": sid, "message": strings.Repeat("a", chatMaxMessage+1)})
	a.must(400, code, j)
	if usageOf(t, e, org, "chat") != 0 {
		t.Fatal("pesan tidak valid tidak boleh makan kuota")
	}

	// kirim pesan: job kind chat, pesan user, judul sesi, params sesuai kontrak
	long := "  " + strings.Repeat("Halo, tolong riset kopi di Kemang. ", 3) + "  "
	code, j = a.post("/chat", map[string]any{"sid": sid, "message": long,
		"context": map[string]any{"page": "Market!", "industry": "kopi", "area": strings.Repeat("x", 200), "report_id": 999999}})
	a.must(200, code, j)
	if j["sid"] != sid {
		t.Fatalf("sid balasan harus sama: %v", j)
	}
	job := jobID(t, j)
	kind, p := jobParams(t, e, job)
	if kind != "chat" || p.Sid != sid || p.Message != strings.TrimSpace(long) || p.MessageID <= 0 {
		t.Fatalf("job chat: kind=%s params=%+v", kind, p)
	}
	if p.Limits.Runs != 5 || p.Limits.Details != 30 || p.AppURL != "http://app.test" || p.OrgName != "Chat" || p.Plan != "free" || p.Role != "owner" || p.Verified {
		t.Fatalf("params: %+v", p)
	}
	var cctx map[string]any
	if err := json.Unmarshal(p.Context, &cctx); err != nil {
		t.Fatalf("context: %s", p.Context)
	}
	if cctx["page"] != "market" || cctx["industry"] != "kopi" || len(cctx["area"].(string)) != chatMaxContext || cctx["report_id"] != nil {
		t.Fatalf("context tidak dibersihkan: %v", cctx)
	}
	var role, content string
	var msgJob *int64
	if err := e.app.db.QueryRow(ctx, `SELECT role, content, job_id FROM chat_messages WHERE session_id=$1::uuid ORDER BY id LIMIT 1`, sid).Scan(&role, &content, &msgJob); err != nil {
		t.Fatal(err)
	}
	if role != "user" || content != strings.TrimSpace(long) || msgJob == nil || *msgJob != job {
		t.Fatalf("pesan user: %s %q %v", role, content, msgJob)
	}
	var title string
	e.app.db.QueryRow(ctx, `SELECT title FROM chat_sessions WHERE id=$1::uuid`, sid).Scan(&title)
	if title != trunc(long, chatTitleLen) || len([]rune(title)) != chatTitleLen {
		t.Fatalf("judul sesi: %q", title)
	}
	if usageOf(t, e, org, "chat") != 1 {
		t.Fatalf("usage chat: %d", usageOf(t, e, org, "chat"))
	}
	_, me := a.get("/auth/me")
	if me["limits"].(map[string]any)["chats"].(float64) != 20 {
		t.Fatalf("limits.chats di /auth/me: %v", me["limits"])
	}

	// poll sebelum worker
	poll := fmt.Sprintf("/chat/poll?job=%d", job)
	code, j = a.get(poll)
	a.must(200, code, j)
	if j["done"] != false || len(j["steps"].([]any)) != 0 || j["answer"] != "" || j["error"] != "" {
		t.Fatalf("poll awal: %v", j)
	}

	// job aktif ganda per sesi: 409, kuota tidak terpotong
	code, j = a.post("/chat", map[string]any{"sid": sid, "message": "lagi"})
	a.must(409, code, j)
	if j["code"] != "chat_busy" || usageOf(t, e, org, "chat") != 1 {
		t.Fatalf("409: %v usage %d", j, usageOf(t, e, org, "chat"))
	}
	var nMsg int
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM chat_messages WHERE session_id=$1::uuid`, sid).Scan(&nMsg)
	if nMsg != 1 {
		t.Fatalf("pesan yang ditolak 409 tersimpan: %d", nMsg)
	}

	// simulasi worker: langkah ke job_logs, pesan assistant, lalu done dengan result
	e.app.db.Exec(ctx, `UPDATE jobs SET status='running', started_at=now(), heartbeat_at=now() WHERE id=$1`, job)
	e.app.db.Exec(ctx, `INSERT INTO job_logs (job_id, seq, line) VALUES ($1,1,E'🔧 list_competitors({})\n'),($1,2,E'Membaca laporan…\n'),($1,3,E'\n')`, job)
	code, j = a.get(poll)
	a.must(200, code, j)
	if j["done"] != false || len(j["steps"].([]any)) != 2 {
		t.Fatalf("poll running: %v", j)
	}
	e.app.db.Exec(ctx, `INSERT INTO chat_messages (session_id, org_id, role, content, job_id) VALUES ($1::uuid,$2,'assistant','halo juga',$3)`, sid, org, job)
	e.app.db.Exec(ctx, `UPDATE jobs SET status='done', finished_at=now(), result='{"answer":"halo juga","model":"test/model","report_ids":[7]}' WHERE id=$1`, job)
	code, j = a.get(poll)
	a.must(200, code, j)
	steps := j["steps"].([]any)
	if j["done"] != true || len(steps) != 2 || steps[0] != "🔧 list_competitors({})" || steps[1] != "Membaca laporan…" ||
		j["answer"] != "halo juga" || j["error"] != "" || j["model"] != "test/model" || len(j["report_ids"].([]any)) != 1 {
		t.Fatalf("poll selesai: %v", j)
	}

	// pesan urut, sesi masuk daftar
	code, j = a.get("/chat/messages?sid=" + sid)
	a.must(200, code, j)
	msgs := j["messages"].([]any)
	if len(msgs) != 2 || msgs[0].(map[string]any)["role"] != "user" || msgs[1].(map[string]any)["role"] != "assistant" ||
		msgs[1].(map[string]any)["content"] != "halo juga" || j["active_job"] != nil || j["title"] != title {
		t.Fatalf("messages: %v", j)
	}
	code, j = a.get("/chat/sessions")
	a.must(200, code, j)
	ss := j["sessions"].([]any)
	if len(ss) != 1 || ss[0].(map[string]any)["id"] != sid || ss[0].(map[string]any)["title"] != title {
		t.Fatalf("sessions: %v", ss)
	}
	code, j = a.get("/chat/messages?sid=bukan-uuid")
	a.must(400, code, j)

	// stop job yang masih antre: dibatalkan, kuota kembali, poll bilang "Dihentikan."
	code, j = a.post("/chat", map[string]any{"sid": sid, "message": "kedua"})
	a.must(200, code, j)
	job2 := jobID(t, j)
	if usageOf(t, e, org, "chat") != 2 {
		t.Fatalf("usage sebelum stop: %d", usageOf(t, e, org, "chat"))
	}
	code, j = a.get("/chat/messages?sid=" + sid)
	if int64(j["active_job"].(float64)) != job2 {
		t.Fatalf("active_job: %v", j["active_job"])
	}
	code, j = a.post("/chat/stop", map[string]any{"job": fmt.Sprint(job2)}) // frontend mengirim id sebagai string
	a.must(200, code, j)
	if j["ok"] != true || j["status"] != "cancelled" {
		t.Fatalf("stop: %v", j)
	}
	var st string
	var refunded bool
	e.app.db.QueryRow(ctx, `SELECT status, refunded FROM jobs WHERE id=$1`, job2).Scan(&st, &refunded)
	if st != "cancelled" || !refunded || usageOf(t, e, org, "chat") != 1 {
		t.Fatalf("setelah stop: status=%s refunded=%v usage=%d", st, refunded, usageOf(t, e, org, "chat"))
	}
	code, j = a.get(fmt.Sprintf("/chat/poll?job=%d", job2))
	if j["done"] != true || j["error"] != "Dihentikan." {
		t.Fatalf("poll dibatalkan: %v", j)
	}
	code, j = a.post("/chat/stop", map[string]any{"job": job2})
	a.must(200, code, j)
	if j["ok"] != false {
		t.Fatalf("stop ulang harus ok:false: %v", j)
	}
	if n := e.app.refundFinishedJobs(ctx); n != 0 || usageOf(t, e, org, "chat") != 1 {
		t.Fatalf("scheduler tidak boleh refund dua kali: n=%d usage=%d", n, usageOf(t, e, org, "chat"))
	}
	// job gagal (mis. kunci LLM kosong): kuota dikembalikan scheduler
	code, j = a.post("/chat", map[string]any{"sid": sid, "message": "ketiga"})
	a.must(200, code, j)
	job3 := jobID(t, j)
	e.app.db.Exec(ctx, `UPDATE jobs SET status='failed', finished_at=now(), error='OPENROUTER_API_KEY belum diisi' WHERE id=$1`, job3)
	code, j = a.get(fmt.Sprintf("/chat/poll?job=%d", job3))
	if j["done"] != true || j["error"] != "OPENROUTER_API_KEY belum diisi" {
		t.Fatalf("poll gagal: %v", j)
	}
	if n := e.app.refundFinishedJobs(ctx); n != 1 || usageOf(t, e, org, "chat") != 1 {
		t.Fatalf("refund job gagal: n=%d usage=%d", n, usageOf(t, e, org, "chat"))
	}

	// org lain: sesi tidak terbaca, poll "job tidak ada", pesan ke sid milik A membuat sesi baru untuk B
	b := e.client()
	b.register("chat-b@x.id", "ChatB")
	code, j = b.get("/chat/messages?sid=" + sid)
	b.must(404, code, j)
	code, j = b.get(poll)
	b.must(200, code, j)
	if j["done"] != true || j["error"] != "job tidak ada" || len(j["steps"].([]any)) != 0 || j["answer"] != "" {
		t.Fatalf("poll lintas org: %v", j)
	}
	code, j = b.post("/chat/stop", map[string]any{"job": job})
	b.must(200, code, j)
	if j["ok"] != false {
		t.Fatalf("stop lintas org: %v", j)
	}
	code, j = b.post("/chat/sessions/delete", map[string]any{"sid": sid})
	b.must(200, code, j)
	if j["ok"] != false {
		t.Fatalf("hapus sesi lintas org: %v", j)
	}
	code, j = b.post("/chat", map[string]any{"sid": sid, "message": "halo dari B"})
	b.must(200, code, j)
	if j["sid"] == sid || !uuidRe.MatchString(j["sid"].(string)) {
		t.Fatalf("B harus dapat sesi baru: %v", j)
	}
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM chat_messages WHERE session_id=$1::uuid`, sid).Scan(&nMsg)
	if nMsg != 4 {
		t.Fatalf("sesi A berubah oleh B: %d pesan", nMsg)
	}
	// sid buatan klien (uuid acak yang belum ada) dipakai apa adanya supaya percakapan menyambung
	local := "0f3c4b1e-7a2d-4e9f-9c1b-2d3e4f5a6b7c"
	code, j = b.post("/chat", map[string]any{"sid": local, "message": "pakai sid lokal"})
	b.must(200, code, j)
	if j["sid"] != local {
		t.Fatalf("sid lokal harus dipakai: %v", j)
	}
	code, j = a.post("/chat", map[string]any{"sid": local, "message": "coba ambil sesi B"})
	a.must(200, code, j)
	if j["sid"] == local {
		t.Fatal("sid milik org lain tidak boleh dipakai")
	}

	// CHAT_ENABLED=0
	t.Setenv("CHAT_ENABLED", "0")
	code, j = a.post("/chat", map[string]any{"sid": sid, "message": "x"})
	a.must(503, code, j)
	if j["code"] != "chat_disabled" {
		t.Fatalf("503: %v", j)
	}
	t.Setenv("CHAT_ENABLED", "1")

	// hapus sesi beserta pesannya
	code, j = a.post("/chat/sessions/delete", map[string]any{"sid": sid})
	a.must(200, code, j)
	if j["ok"] != true {
		t.Fatalf("hapus: %v", j)
	}
	code, j = a.get("/chat/messages?sid=" + sid)
	a.must(404, code, j)
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM chat_messages WHERE session_id=$1::uuid`, sid).Scan(&nMsg)
	if nMsg != 0 {
		t.Fatalf("pesan tidak ikut terhapus: %d", nMsg)
	}
}

// TestIntegrationMigrate008Idempotent: migrasi 008 bisa dijalankan ulang di atas skema yang sudah ada.
func TestIntegrationMigrate008Idempotent(t *testing.T) {
	e := setupIntegration(t)
	ctx := context.Background()
	if _, err := e.app.db.Exec(ctx, `DELETE FROM schema_migrations WHERE name='008_chat.sql'`); err != nil {
		t.Fatal(err)
	}
	if err := migrate(ctx, e.app.db); err != nil {
		t.Fatalf("migrasi 008 kedua kali: %v", err)
	}
	var n int
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM pg_indexes WHERE indexname IN ('chat_sessions_org_last','chat_messages_session','jobs_one_active_chat_per_sid')`).Scan(&n)
	if n != 3 {
		t.Fatalf("index 008 kurang: %d", n)
	}
	// CHECK kind menerima 'chat', peran pesan dibatasi, satu job chat aktif per sesi
	var org string
	e.app.db.QueryRow(ctx, `INSERT INTO orgs (name) VALUES ('m8') RETURNING id`).Scan(&org)
	if _, err := e.app.db.Exec(ctx, `INSERT INTO jobs (org_id, kind, params) VALUES ($1,'chat','{"sid":"s1"}')`, org); err != nil {
		t.Fatalf("kind chat harus diterima: %v", err)
	}
	if _, err := e.app.db.Exec(ctx, `INSERT INTO jobs (org_id, kind, params) VALUES ($1,'chat','{"sid":"s1"}')`, org); !uniqueViolationOn(err, "jobs_one_active_chat_per_sid") {
		t.Fatalf("job chat kedua untuk sesi yang sama harus ditolak index unik: %v", err)
	}
	if _, err := e.app.db.Exec(ctx, `INSERT INTO jobs (org_id, kind, params) VALUES ($1,'obrolan','{}')`, org); err == nil {
		t.Fatal("kind tak dikenal harus ditolak CHECK")
	}
	var sid string
	e.app.db.QueryRow(ctx, `INSERT INTO chat_sessions (org_id, updated_at) VALUES ($1, now() - interval '1 day') RETURNING id`, org).Scan(&sid)
	if _, err := e.app.db.Exec(ctx, `INSERT INTO chat_messages (session_id, org_id, role, content) VALUES ($1,$2,'system','x')`, sid, org); err == nil {
		t.Fatal("role selain user/assistant harus ditolak CHECK")
	}
	// trigger updated_at di chat_sessions: insert tidak menyentuhnya, update memperbaruinya
	var age float64
	e.app.db.QueryRow(ctx, `SELECT extract(epoch from now() - updated_at) FROM chat_sessions WHERE id=$1`, sid).Scan(&age)
	if age < 80000 {
		t.Fatalf("insert tidak boleh menyentuh updated_at: umur %.0f detik", age)
	}
	e.app.db.Exec(ctx, `UPDATE chat_sessions SET title='t' WHERE id=$1`, sid)
	e.app.db.QueryRow(ctx, `SELECT extract(epoch from now() - updated_at) FROM chat_sessions WHERE id=$1`, sid).Scan(&age)
	if age > 5 {
		t.Fatalf("trigger set_updated_at chat_sessions tidak jalan: umur %.0f detik", age)
	}
}

// TestIntegrationChatGuestQuota: tamu boleh memakai asisten, kuota 3 pesan lalu 402; params menandai plan guest.
func TestIntegrationChatGuestQuota(t *testing.T) {
	t.Setenv("CHAT_ENABLED", "1")
	e := setupIntegration(t)
	guestLimit = newLimiterRate(5.0/3600, 5) // tes lain sudah memakai jatah tamu per IP
	g := e.client()
	code, j := g.post("/auth/guest", map[string]string{})
	g.must(200, code, j)
	if j["limits"].(map[string]any)["chats"].(float64) != 3 {
		t.Fatalf("limits tamu: %v", j["limits"])
	}
	org := orgOf(t, g)
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		code, j = g.post("/chat", map[string]any{"sid": "", "message": fmt.Sprintf("pesan %d", i)})
		g.must(200, code, j)
		id := jobID(t, j)
		if i == 0 {
			_, p := jobParams(t, e, id)
			if p.Plan != "guest" || !p.Verified || p.Limits.Runs != 2 {
				t.Fatalf("params tamu: %+v", p)
			}
		}
		e.app.db.Exec(ctx, `UPDATE jobs SET status='done', finished_at=now(), result='{"answer":"ok"}' WHERE id=$1`, id)
	}
	code, j = g.post("/chat", map[string]any{"sid": "", "message": "keempat"})
	g.must(402, code, j)
	if j["code"] != "quota_exceeded" || usageOf(t, e, org, "chat") != 3 {
		t.Fatalf("402: %v usage %d", j, usageOf(t, e, org, "chat"))
	}
	_, j = g.get("/org")
	if j["usage"].(map[string]any)["chat"].(float64) != 3 {
		t.Fatalf("usage chat di /org: %v", j["usage"])
	}
	// sid kosong = sesi baru tiap pesan
	_, j = g.get("/chat/sessions")
	if len(j["sessions"].([]any)) != 3 {
		t.Fatalf("sessions tamu: %v", j)
	}
}

// TestIntegrationChatContextAndSuggestions: context dibersihkan (report_id org lain dan bentuk salah diabaikan),
// saran pertanyaan mengikuti laporan/halaman.
func TestIntegrationChatContextAndSuggestions(t *testing.T) {
	t.Setenv("CHAT_ENABLED", "1")
	e := setupIntegration(t)
	a := e.client()
	a.register("ctx@x.id", "Ctx")
	org := orgOf(t, a)
	b := e.client()
	b.register("ctx-b@x.id", "CtxB")
	orgB := orgOf(t, b)

	// tanpa laporan: contoh umum, tanpa pertanyaan "Ringkas laporan"
	code, j := a.get("/chat/suggestions")
	a.must(200, code, j)
	sug := j["suggestions"].([]any)
	if len(sug) < 3 || len(sug) > 5 || j["report_id"] != nil {
		t.Fatalf("saran umum: %v", j)
	}
	for _, s := range sug {
		if strings.HasPrefix(s.(string), "Ringkas laporan") {
			t.Fatalf("tanpa laporan tidak boleh ada saran laporan: %v", sug)
		}
	}

	rid := insertReport(t, e, org, rep("Kopi", "Kemang", Place{"place_id": "p1", "name": "Kopi A"}))
	ridB := insertReport(t, e, orgB, rep("Bakso", "Tebet", Place{"place_id": "p2", "name": "Bakso B"}))

	// context: report_id milik org melengkapi industri/wilayah
	code, j = a.post("/chat", map[string]any{"sid": "", "message": "apa celah pasarnya?", "context": map[string]any{"report_id": rid, "business_key": "p1"}})
	a.must(200, code, j)
	_, p := jobParams(t, e, jobID(t, j))
	var c map[string]any
	json.Unmarshal(p.Context, &c)
	if int64(c["report_id"].(float64)) != rid || c["industry"] != "Kopi" || c["area"] != "Kemang" || c["business_key"] != "p1" {
		t.Fatalf("context laporan: %v", c)
	}
	// report_id org lain (dikirim sebagai string) diabaikan, field lain tetap
	code, j = a.post("/chat", map[string]any{"sid": "", "message": "x", "context": map[string]any{"report_id": fmt.Sprint(ridB), "page": "watch"}})
	a.must(200, code, j)
	_, p = jobParams(t, e, jobID(t, j))
	c = nil
	json.Unmarshal(p.Context, &c)
	if c["report_id"] != nil || c["industry"] != nil || c["page"] != "watch" {
		t.Fatalf("report_id org lain harus diabaikan: %v", c)
	}
	// context bukan objek atau kosong: tidak diteruskan
	for _, bad := range []any{"bukan objek", 123, map[string]any{"industry": "", "area": "  "}} {
		code, j = a.post("/chat", map[string]any{"sid": "", "message": "x", "context": bad})
		a.must(200, code, j)
		_, p = jobParams(t, e, jobID(t, j))
		if len(p.Context) != 0 {
			t.Fatalf("context %v harus diabaikan, dapat %s", bad, p.Context)
		}
	}

	// saran: laporan milik org, laporan org lain (diabaikan), halaman prospek, umum dengan laporan terbaru
	code, j = a.get(fmt.Sprintf("/chat/suggestions?report_id=%d", rid))
	a.must(200, code, j)
	sug = j["suggestions"].([]any)
	if int64(j["report_id"].(float64)) != rid || j["industry"] != "Kopi" || len(sug) < 3 || len(sug) > 5 ||
		!strings.Contains(sug[0].(string), "Kemang") || !strings.Contains(sug[0].(string), "Kopi") {
		t.Fatalf("saran laporan: %v", j)
	}
	code, j = a.get(fmt.Sprintf("/chat/suggestions?report_id=%d", ridB))
	a.must(200, code, j)
	if j["report_id"] != nil || j["industry"] != nil {
		t.Fatalf("laporan org lain harus diabaikan: %v", j)
	}
	for _, s := range j["suggestions"].([]any) {
		if strings.Contains(s.(string), "Tebet") || strings.Contains(s.(string), "Bakso") {
			t.Fatalf("bocor laporan org lain: %v", j)
		}
	}
	code, j = a.get("/chat/suggestions?page=prospects")
	a.must(200, code, j)
	if j["page"] != "prospects" || !strings.Contains(j["suggestions"].([]any)[0].(string), "jatuh tempo") {
		t.Fatalf("saran prospek: %v", j)
	}
	code, j = a.get("/chat/suggestions?page=Market%20x")
	a.must(200, code, j)
	sug = j["suggestions"].([]any)
	if j["page"] != "marketx" || len(sug) != 5 || sug[0] != "Ringkas laporan Kopi di Kemang yang terbaru." {
		t.Fatalf("saran umum dengan laporan: %v", j)
	}
	// viewer tidak boleh (analyst+): sesi tanpa login 401
	resp, err := http.Get(e.srv.URL + "/chat/suggestions")
	if err != nil || resp.StatusCode != 401 {
		t.Fatalf("tanpa sesi: %v %v", resp, err)
	}
	resp.Body.Close()
}
