package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func orgOf(t *testing.T, c *client) string {
	t.Helper()
	_, me := c.get("/auth/me")
	org, _ := me["org_id"].(string)
	if org == "" {
		t.Fatalf("org_id kosong: %v", me)
	}
	return org
}

func usageOf(t *testing.T, e *testEnv, org, kind string) int {
	t.Helper()
	var n int
	e.app.db.QueryRow(context.Background(), `SELECT coalesce(sum(count),0) FROM usage WHERE org_id=$1 AND kind=$2`, org, kind).Scan(&n)
	return n
}

// TestIntegrationQueueLimitPerOrg: enam enqueue bersamaan, checkQueueIn (advisory lock per org) meloloskan
// tepat sebatas antrean paket free (3); sisanya 409 queue_full tanpa memotong kuota.
func TestIntegrationQueueLimitPerOrg(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("race@x.id", "Race")
	org := orgOf(t, a)
	queueMax := planLimits("free").Queue

	const n = 6
	codes := make([]int, n)
	bodies := make([]map[string]any, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			codes[i], bodies[i] = a.post("/market/run", map[string]any{"industry": "kopi", "area": fmt.Sprintf("wilayah-%d", i), "fresh": true})
		}(i)
	}
	wg.Wait()
	ok, conflict := 0, 0
	for i, c := range codes {
		switch c {
		case 200:
			ok++
		case 409:
			conflict++
			if bodies[i]["code"] != "queue_full" {
				t.Fatalf("409 tanpa code queue_full: %v", bodies[i])
			}
		default:
			t.Fatalf("kode tak terduga %d: %v", c, bodies[i])
		}
	}
	if ok != queueMax || conflict != n-queueMax {
		t.Fatalf("200=%d 409=%d (batas antrean %d)", ok, conflict, queueMax)
	}
	var active int
	e.app.db.QueryRow(context.Background(), `SELECT count(*) FROM jobs WHERE org_id=$1 AND status IN ('queued','running')`, org).Scan(&active)
	if active != queueMax || usageOf(t, e, org, "market_run") != queueMax {
		t.Fatalf("job aktif %d, kuota terpakai %d (harus %d: consume+enqueue satu transaksi)", active, usageOf(t, e, org, "market_run"), queueMax)
	}
	// detail tidak kena batas antrean riset: ikut antre (202 pending karena worker tidak jalan) dan kuotanya terpotong
	old := detailWait
	detailWait = 100 * time.Millisecond
	defer func() { detailWait = old }()
	rid := insertReport(t, e, org, rep("kopi", "kemang", Place{"place_id": "p", "name": "P"}))
	code, j := a.post("/market/detail", map[string]any{"report_id": rid, "key": "p"})
	a.must(202, code, j)
	if usageOf(t, e, org, "market_detail") != 1 {
		t.Fatal("kuota cek kontak tidak terpotong padahal job diantrekan")
	}
}

// TestIntegrationRefundOnFailure: kuota job failed/cancelled final dikembalikan sekali oleh scheduler.
func TestIntegrationRefundOnFailure(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("refund@x.id", "Refund")
	org := orgOf(t, a)
	ctx := context.Background()

	// wilayah ganda (beda huruf besar/kecil) didedupe: "Tebet"+"tebet" = 1 wilayah -> kurang dari 2 -> 400
	code, j := a.post("/market/compare/run", map[string]any{"industry": "kopi", "areas": []string{"Tebet", " tebet "}})
	a.must(400, code, j)
	code, j = a.post("/market/compare/run", map[string]any{"industry": "kopi", "areas": []string{"a", "A", "b", "c"}})
	a.must(200, code, j)
	var nAreas int
	e.app.db.QueryRow(ctx, `SELECT jsonb_array_length(params->'areas') FROM jobs WHERE org_id=$1`, org).Scan(&nAreas)
	if nAreas != 3 {
		t.Fatalf("areas setelah dedupe: %d", nAreas)
	}
	if usageOf(t, e, org, "market_run") != 3 {
		t.Fatalf("usage setelah compare: %d", usageOf(t, e, org, "market_run"))
	}
	e.app.db.Exec(ctx, `UPDATE jobs SET status='failed', finished_at=now(), error='x' WHERE org_id=$1`, org)
	if n := e.app.refundFinishedJobs(ctx); n != 1 {
		t.Fatalf("refund memproses %d job", n)
	}
	if usageOf(t, e, org, "market_run") != 0 {
		t.Fatalf("usage setelah refund: %d", usageOf(t, e, org, "market_run"))
	}
	if n := e.app.refundFinishedJobs(ctx); n != 0 {
		t.Fatalf("refund kedua memproses %d job (harus 0, sudah ditandai refunded)", n)
	}
	// dibatalkan saat antre -> refund juga; job ig_profile tidak di-refund oleh scheduler
	code, j = a.post("/market/run", map[string]any{"industry": "kopi", "area": "d", "fresh": true})
	a.must(200, code, j)
	a.post("/stop", nil)
	e.app.schedulerRound(ctx)
	if usageOf(t, e, org, "market_run") != 0 {
		t.Fatalf("usage setelah batal: %d", usageOf(t, e, org, "market_run"))
	}
	var refunded bool
	e.app.db.QueryRow(ctx, `SELECT bool_and(refunded) FROM jobs WHERE org_id=$1`, org).Scan(&refunded)
	if !refunded {
		t.Fatal("job belum ditandai refunded")
	}
}

// TestIntegrationConsumeRejectsFirstInsert: baris usage pertama bulan itu juga ditolak kalau n > max atau kind asing.
func TestIntegrationConsumeRejectsFirstInsert(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("quota@x.id", "Quota")
	org := orgOf(t, a)
	ctx := context.Background()

	if err := e.app.consume(ctx, org, "free", "market_run", 6); err == nil {
		t.Fatal("n > max harus ditolak pada INSERT pertama")
	}
	if err := e.app.consume(ctx, org, "free", "tidak_ada", 1); err == nil {
		t.Fatal("kind tak dikenal harus ditolak")
	}
	if err := e.app.consume(ctx, org, "free", "market_run", 0); err == nil {
		t.Fatal("n <= 0 harus ditolak")
	}
	var rows int
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM usage WHERE org_id=$1`, org).Scan(&rows)
	if rows != 0 {
		t.Fatalf("usage tidak boleh tersimpan: %d baris", rows)
	}
	if err := e.app.consume(ctx, org, "free", "market_run", 5); err != nil {
		t.Fatalf("tepat max harus lolos: %v", err)
	}
	if err := e.app.consume(ctx, org, "free", "market_run", 1); err == nil {
		t.Fatal("melebihi kuota harus ditolak")
	}
	if err := e.app.refund(ctx, org, "market_run", 2); err != nil || usageOf(t, e, org, "market_run") != 3 {
		t.Fatalf("refund: %v, usage %d", err, usageOf(t, e, org, "market_run"))
	}
	if err := e.app.refund(ctx, org, "market_run", 99); err != nil || usageOf(t, e, org, "market_run") != 0 {
		t.Fatalf("refund tidak boleh negatif: %v, usage %d", err, usageOf(t, e, org, "market_run"))
	}
}

// TestIntegrationLatestReportsWindow: satu query window function; watchData memuat laporan sebelumnya tanpa N+1.
func TestIntegrationLatestReportsWindow(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("win@x.id", "Win")
	org := orgOf(t, a)

	insertReport(t, e, org, rep("Kopi", "Kemang", Place{"place_id": "a", "name": "A", "rating": 4.0, "reviews": 10.0}))
	k2 := insertReport(t, e, org, rep("kopi", "kemang", Place{"place_id": "a", "name": "A", "rating": 4.0, "reviews": 10.0}, Place{"place_id": "b", "name": "B", "rating": 4.5, "reviews": 3.0}))
	b1 := insertReport(t, e, org, rep("bakso", "tebet", Place{"place_id": "c", "name": "C"}))

	req := httptest.NewRequest("GET", "/", nil)
	latest := e.app.latestReports(req, org, 0)
	if len(latest) != 2 {
		t.Fatalf("latestReports: %d pasangan", len(latest))
	}
	ids := map[int64]bool{}
	for _, r := range latest {
		ids[r["id"].(int64)] = true
	}
	if !ids[k2] || !ids[b1] {
		t.Fatalf("latestReports harus id terbaru per pasangan: %v", ids)
	}
	if got := e.app.latestReports(req, org, 1); len(got) != 1 || got[0]["id"].(int64) != b1 {
		t.Fatalf("LIMIT 1 harus laporan terbaru: %v", got)
	}

	code, j := a.get("/watch/data")
	a.must(200, code, j)
	byPair := map[string]map[string]any{}
	for _, x := range list(j) {
		it := x.(map[string]any)
		byPair[pairKey(it["industry"].(string), it["area"].(string))] = it
	}
	kopi, bakso := byPair["kopi|kemang"], byPair["bakso|tebet"]
	if kopi == nil || bakso == nil {
		t.Fatalf("watch/data: %v", j)
	}
	if kopi["runs"].(float64) != 2 || int64(kopi["report_id"].(float64)) != k2 || kopi["businesses"].(float64) != 2 {
		t.Fatalf("pasangan kopi: %v", kopi)
	}
	if ch, ok := kopi["changes"].(map[string]any); !ok || len(ch["new"].([]any)) != 1 {
		t.Fatalf("perubahan kopi: %v", kopi["changes"])
	}
	if bakso["runs"].(float64) != 1 || bakso["changes"] != nil {
		t.Fatalf("pasangan bakso: %v", bakso)
	}
}

func sseRequest(ctx context.Context, org, path string) *http.Request {
	r := httptest.NewRequest("GET", path, nil)
	return r.WithContext(context.WithValue(ctx, sessKey, &Session{OrgID: org, Plan: "free", Role: "owner"}))
}

// TestIntegrationSSEStream: maksimal 3 stream per org (429), delta dari job_logs, dan fallback jobs.log worker lama.
func TestIntegrationSSEStream(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("sse@x.id", "SSE")
	org := orgOf(t, a)
	ctx := context.Background()

	for i := 0; i < sseMaxPerOrg; i++ {
		if !sseStreams.acquire(org) {
			t.Fatalf("slot %d harus tersedia", i)
		}
	}
	rec := httptest.NewRecorder()
	e.app.jobLogStreamV2(rec, sseRequest(ctx, org, "/log/stream"))
	if rec.Code != 429 || !strings.Contains(rec.Body.String(), "too_many_streams") {
		t.Fatalf("stream ke-4 harus 429: %d %s", rec.Code, rec.Body.String())
	}
	for i := 0; i < sseMaxPerOrg; i++ {
		sseStreams.release(org)
	}
	if sseStreams.count(org) != 0 {
		t.Fatalf("slot tidak dilepas: %d", sseStreams.count(org))
	}

	// job selesai dengan log per baris: satu event log berisi semua baris lalu done
	var jid int64
	e.app.db.QueryRow(ctx, `INSERT INTO jobs (org_id, kind, status, params) VALUES ($1,'market_run','done','{}') RETURNING id`, org).Scan(&jid)
	e.app.db.Exec(ctx, `INSERT INTO job_logs (job_id, seq, line) VALUES ($1,1,E'baris satu\n'),($1,2,E'baris dua\n')`, jid)
	rec = httptest.NewRecorder()
	e.app.jobLogStreamV2(rec, sseRequest(ctx, org, fmt.Sprintf("/log/stream?job=%d", jid)))
	body := rec.Body.String()
	if rec.Code != 200 || !strings.Contains(body, `baris satu\nbaris dua\n`) || !strings.Contains(body, `event: done`) || !strings.Contains(body, `"status":"done"`) {
		t.Fatalf("stream job_logs: %d %q", rec.Code, body)
	}
	if sseStreams.count(org) != 0 {
		t.Fatal("slot stream tidak dilepas setelah selesai")
	}
	// stream berjalan: hanya baris baru (seq > terakhir) yang dikirim
	var running int64
	e.app.db.QueryRow(ctx, `INSERT INTO jobs (org_id, kind, status, params) VALUES ($1,'market_run','running','{}') RETURNING id`, org).Scan(&running)
	e.app.db.Exec(ctx, `INSERT INTO job_logs (job_id, seq, line) VALUES ($1,1,E'awal\n')`, running)
	go func() {
		time.Sleep(1200 * time.Millisecond)
		e.app.db.Exec(ctx, `INSERT INTO job_logs (job_id, seq, line) VALUES ($1,2,E'lanjut\n')`, running)
		time.Sleep(1200 * time.Millisecond)
		e.app.db.Exec(ctx, `UPDATE jobs SET status='done', finished_at=now() WHERE id=$1`, running)
	}()
	rec = httptest.NewRecorder()
	e.app.jobLogStreamV2(rec, sseRequest(ctx, org, fmt.Sprintf("/log/stream?job=%d", running)))
	body = rec.Body.String()
	if strings.Count(body, "awal") != 1 || strings.Count(body, "lanjut") != 1 || !strings.Contains(body, `"status":"done"`) {
		t.Fatalf("delta stream: %q", body)
	}
	// worker lama: hanya kolom jobs.log
	var legacy int64
	e.app.db.QueryRow(ctx, `INSERT INTO jobs (org_id, kind, status, params, log) VALUES ($1,'market_run','failed','{}','log lama ünïcode') RETURNING id`, org).Scan(&legacy)
	rec = httptest.NewRecorder()
	e.app.jobLogStreamV2(rec, sseRequest(ctx, org, fmt.Sprintf("/log/stream?job=%d", legacy)))
	if !strings.Contains(rec.Body.String(), "log lama ünïcode") {
		t.Fatalf("fallback jobs.log: %q", rec.Body.String())
	}
	// GET /log membaca job_logs
	code, j := a.get("/log")
	a.must(200, code, j)
	if !strings.Contains(j["log"].(string), "log lama") {
		t.Fatalf("/log: %v", j)
	}
}

// TestIntegrationMigrateIdempotent: migrasi 007 dan 009 bisa dijalankan ulang di atas skema yang sudah ada
// (009 ikut diulang supaya index unik satu-job-aktif yang dibuat ulang 007 terhapus lagi).
func TestIntegrationMigrateIdempotent(t *testing.T) {
	e := setupIntegration(t)
	ctx := context.Background()
	if _, err := e.app.db.Exec(ctx, `DELETE FROM schema_migrations WHERE name IN ('007_indexes_constraints.sql','009_job_queue.sql')`); err != nil {
		t.Fatal(err)
	}
	if err := migrate(ctx, e.app.db); err != nil {
		t.Fatalf("migrasi 007+009 kedua kali: %v", err)
	}
	if err := migrate(ctx, e.app.db); err != nil {
		t.Fatalf("migrasi tanpa pekerjaan: %v", err)
	}
	var n int
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM pg_indexes WHERE indexname IN ('jobs_active_market_per_org','reports_org_id','job_logs_job_seq','webhook_outbox_pending','jobs_ig_username')`).Scan(&n)
	if n != 5 {
		t.Fatalf("index 007/009 kurang: %d", n)
	}
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM pg_indexes WHERE indexname='jobs_one_active_per_org'`).Scan(&n)
	if n != 0 {
		t.Fatal("index unik jobs_one_active_per_org harus terhapus oleh 009")
	}
	// CHECK aktif
	if _, err := e.app.db.Exec(ctx, `INSERT INTO orgs (name, plan) VALUES ('x','platinum')`); err == nil {
		t.Fatal("orgs.plan tak valid harus ditolak CHECK")
	}
	// trigger updated_at
	var oid string
	e.app.db.QueryRow(ctx, `INSERT INTO orgs (name, updated_at) VALUES ('u', now() - interval '1 day') RETURNING id`).Scan(&oid)
	var before float64
	e.app.db.QueryRow(ctx, `SELECT extract(epoch from now() - updated_at) FROM orgs WHERE id=$1`, oid).Scan(&before)
	if before < 80000 {
		t.Fatalf("insert tidak boleh menyentuh updated_at: umur %.0f detik", before)
	}
	e.app.db.Exec(ctx, `UPDATE orgs SET name='v' WHERE id=$1`, oid)
	var age float64
	e.app.db.QueryRow(ctx, `SELECT extract(epoch from now() - updated_at) FROM orgs WHERE id=$1`, oid).Scan(&age)
	if age > 5 {
		t.Fatalf("trigger set_updated_at tidak jalan: umur %.0f detik", age)
	}
}

// TestIntegrationMemberLimit: anggota + undangan pending dihitung terhadap batas paket.
func TestIntegrationMemberLimit(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("ml@x.id", "ML")
	org := orgOf(t, a)
	ctx := context.Background()
	if !e.app.memberLimitReached(ctx, org, "free") {
		t.Fatal("free: 1 anggota = penuh")
	}
	if e.app.memberLimitReached(ctx, org, "pro") {
		t.Fatal("pro: 1 dari 3")
	}
	for _, em := range []string{"u1@x.id", "u2@x.id"} {
		if _, err := e.app.issueToken(ctx, "invite", em, nil, &org, time.Hour); err != nil {
			t.Fatal(err)
		}
	}
	if !e.app.memberLimitReached(ctx, org, "pro") {
		t.Fatal("pro: 1 anggota + 2 undangan = penuh")
	}
	e.app.db.Exec(ctx, `UPDATE tokens SET expires_at = now() - interval '1 hour' WHERE email='u2@x.id'`)
	if e.app.memberLimitReached(ctx, org, "pro") {
		t.Fatal("undangan kedaluwarsa tidak dihitung")
	}
}

// TestIntegrationPutSettingsAtomic: validasi dulu (tidak ada yang tersimpan sebagian), secret webhook dibuat otomatis.
func TestIntegrationPutSettingsAtomic(t *testing.T) {
	t.Setenv("ALLOW_INSECURE_WEBHOOK", "1")
	e := setupIntegration(t)
	a := e.client()
	a.register("set@x.id", "Set")
	e.verifyUser(a, "set@x.id")

	code, j := a.post("/org/settings", map[string]any{"telegram_chat": "12345", "notify_email": "bukan email"})
	a.must(400, code, j)
	if j["code"] != "validation" {
		t.Fatalf("code: %v", j)
	}
	_, j = a.get("/org/settings")
	if j["telegram_chat"] != "" {
		t.Fatalf("telegram tersimpan padahal email tidak valid: %v", j)
	}
	code, j = a.post("/org/settings", map[string]any{"telegram_chat": "abc"})
	a.must(400, code, j)
	code, j = a.post("/org/settings", map[string]any{"webhook_url": "ftp://x.id/h"})
	a.must(400, code, j)
	code, j = a.post("/org/settings", map[string]any{"telegram_chat": "-100123", "notify_email": "n@x.id", "offer": "jasa"})
	a.must(200, code, j)
	if j["webhook_secret_generated"] != nil {
		t.Fatalf("tanpa webhook_url tidak boleh membuat secret: %v", j)
	}
	code, j = a.post("/org/settings", map[string]any{"webhook_url": "http://127.0.0.1:9/hook"})
	a.must(200, code, j)
	gen, _ := j["webhook_secret_generated"].(string)
	if len(gen) != 32 {
		t.Fatalf("secret otomatis harus 32 hex: %v", j)
	}
	_, j = a.get("/org/settings")
	if j["telegram_chat"] != "-100123" || j["notify_email"] != "n@x.id" || j["offer"] != "jasa" || !strings.HasSuffix(j["webhook_secret_masked"].(string), gen[28:]) {
		t.Fatalf("settings: %v", j)
	}
	code, j = a.post("/org/settings", map[string]any{"webhook_url": "http://127.0.0.1:9/hook2"})
	a.must(200, code, j)
	if j["webhook_secret_generated"] != nil {
		t.Fatal("secret sudah ada, tidak boleh dibuat ulang")
	}
	code, j = a.post("/org/settings", map[string]any{"webhook_secret": "manual-secret"})
	a.must(200, code, j)
	_, j = a.get("/org/settings")
	if !strings.HasSuffix(j["webhook_secret_masked"].(string), "cret") {
		t.Fatalf("secret manual tidak tersimpan: %v", j)
	}
}

// TestIntegrationDetailPendingAndGuestFresh: cek kontak yang belum selesai dibalas 202 dengan id job; tamu tidak boleh fresh.
func TestIntegrationDetailPendingAndGuestFresh(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("det@x.id", "Det")
	org := orgOf(t, a)
	rid := insertReport(t, e, org, rep("kopi", "kemang", Place{"place_id": "p", "name": "P"}))

	old := detailWait
	detailWait = 1500 * time.Millisecond
	defer func() { detailWait = old }()
	code, j := a.post("/market/detail", map[string]any{"report_id": rid, "key": "p"})
	a.must(202, code, j)
	if j["pending"] != true || j["job"] == nil {
		t.Fatalf("202: %v", j)
	}
	code, j = a.post("/market/detail", map[string]any{"report_id": rid, "key": ""})
	a.must(400, code, j)
	code, j = a.post("/market/detail", map[string]any{"report_id": 999999, "key": "p"})
	a.must(400, code, j)
	if j["code"] != "not_found" {
		t.Fatalf("code: %v", j)
	}

	guestLimit = newLimiterRate(5.0/3600, 5) // tes lain sudah memakai jatah tamu per IP
	g := e.client()
	code, j = g.post("/auth/guest", map[string]string{})
	g.must(200, code, j)
	code, j = g.post("/market/run", map[string]any{"industry": "kopi", "area": "kemang", "fresh": true})
	g.must(403, code, j)
	if j["code"] != "guest_no_fresh" {
		t.Fatalf("tamu fresh: %v", j)
	}
	code, j = g.post("/market/run", map[string]any{"industry": "kopi", "area": "kemang"})
	g.must(200, code, j)
	if j["cached"] != true {
		t.Fatalf("tamu harus dapat hasil instan: %v", j)
	}
}
