package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestAlertSummaryAndSeverity(t *testing.T) {
	ch := map[string][]Place{
		"new":          {Place{"name": "A"}, Place{"name": "B"}},
		"gone":         {Place{"name": "C"}},
		"rating_down":  {},
		"rating_up":    {Place{"name": "D", "delta": 0.3}},
		"reviews_jump": {},
	}
	if got := alertSeverity(ch); got != 2*2+3+1 {
		t.Fatalf("severity %d", got)
	}
	s := alertSummary("coffee shop", "Kemang", ch)
	if !strings.Contains(s, "2 pesaing baru") || !strings.Contains(s, "1 hilang dari peta") || !strings.Contains(s, "1 rating naik") {
		t.Fatalf("summary: %q", s)
	}
	if alertSummary("x", "y", map[string][]Place{}) != "" {
		t.Fatal("tanpa perubahan harus kosong")
	}
	d := alertDetail(ch)
	if !strings.Contains(d, "Pesaing baru:") || !strings.Contains(d, "- C") {
		t.Fatalf("detail: %q", d)
	}
}

func rep(industry, area string, places ...Place) map[string]any {
	all := make([]any, 0, len(places))
	for _, p := range places {
		all = append(all, map[string]any(p))
	}
	return map[string]any{"industry": industry, "area": area, "created": time.Now().UTC().Format(time.RFC3339),
		"summary": map[string]any{"businesses": len(places)}, "all": all}
}

// insertReport menyuntik laporan seperti worker (termasuk kolom summary sesuai kontrak worker).
func insertReport(t *testing.T, e *testEnv, org string, r map[string]any) int64 {
	t.Helper()
	raw, _ := json.Marshal(r)
	sm, _ := json.Marshal(summaryOf(r))
	var id int64
	if err := e.app.db.QueryRow(context.Background(), `INSERT INTO reports (org_id, industry, area, report, summary) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		org, r["industry"], r["area"], raw, sm).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

// verifyUser: tandai email terverifikasi lalu login ulang (pengaturan webhook butuh email terverifikasi).
func (e *testEnv) verifyUser(c *client, email string) {
	e.t.Helper()
	if _, err := e.app.db.Exec(context.Background(), `UPDATE users SET email_verified_at=now() WHERE email=$1`, email); err != nil {
		e.t.Fatal(err)
	}
	code, j := c.post("/auth/login", map[string]string{"email": email, "password": "rahasia123"})
	c.must(200, code, j)
}

// hookServer: penerima webhook palsu yang mencatat event per nama dan memverifikasi tanda tangan HMAC.
type hookServer struct {
	srv    *httptest.Server
	mu     sync.Mutex
	got    map[string]int
	badSig int
	fail   int // berapa request pertama yang dibalas 500
}

func newHookServer(secret string) *hookServer {
	h := &hookServer{got: map[string]int{}}
	h.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(body)
		want := "sha256=" + hex.EncodeToString(mac.Sum(nil))
		h.mu.Lock()
		defer h.mu.Unlock()
		if h.fail > 0 {
			h.fail--
			w.WriteHeader(500)
			return
		}
		if r.Header.Get("X-Raqio-Signature") != want {
			h.badSig++
		}
		h.got[r.Header.Get("X-Raqio-Event")]++
		w.WriteHeader(204)
	}))
	return h
}

func (h *hookServer) count(event string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.got[event]
}

func TestIntegrationAlertsWebhookAndCache(t *testing.T) {
	t.Setenv("ALLOW_INSECURE_WEBHOOK", "1")
	t.Setenv("SUGGEST_MIN_ORGS", "1")
	e := setupIntegration(t)
	o := e.client()
	o.register("w@x.id", "W")
	e.verifyUser(o, "w@x.id")
	_, me := o.get("/auth/me")
	org := me["org_id"].(string)

	secret := "rahasia-webhook"
	hook := newHookServer(secret)
	defer hook.srv.Close()

	code, j := o.post("/org/settings", map[string]string{"webhook_url": hook.srv.URL, "webhook_secret": secret, "notify_email": "alert@x.id"})
	o.must(200, code, j)
	if j["webhook_secret_generated"] != nil {
		t.Fatalf("secret dikirim sendiri, tidak boleh dibuatkan: %v", j)
	}
	code, j = o.get("/org/settings")
	o.must(200, code, j)
	if j["webhook_url"] != hook.srv.URL || j["webhook_secret_masked"] == "" || j["notify_email"] != "alert@x.id" {
		t.Fatalf("settings: %v", j)
	}
	code, j = o.post("/org/webhook/test", map[string]string{})
	o.must(200, code, j)
	if j["ok"] != true {
		t.Fatalf("tes webhook: %v", j)
	}

	// laporan 1 lalu laporan 2 dengan perubahan: 1 baru, 1 hilang, 1 rating turun. Laporan 2 punya kontak berbayar.
	ctx := context.Background()
	insertReport(t, e, org, rep("kopi", "Kemang",
		Place{"place_id": "a", "name": "Kopi A", "rating": 4.5, "reviews": 100.0},
		Place{"place_id": "b", "name": "Kopi B", "rating": 4.0, "reviews": 50.0}))
	e.app.processNewReports(ctx) // laporan pertama: tidak ada alert
	r2 := insertReport(t, e, org, rep("kopi", "Kemang",
		Place{"place_id": "a", "name": "Kopi A", "rating": 4.1, "reviews": 120.0, "phone": "0812", "website": "https://a.id", "instagram": "kopia", "emails": []any{"a@a.id"}, "_detailed": true},
		Place{"place_id": "c", "name": "Kopi C", "rating": 4.8, "reviews": 10.0}))
	e.app.processNewReports(ctx)
	time.Sleep(1500 * time.Millisecond) // notifikasi berjalan di worker pool, lalu masuk outbox
	e.app.processOutbox(ctx)            // webhook asinkron: kirim outbox secara eksplisit

	code, j = o.get("/watch/alerts")
	o.must(200, code, j)
	alerts := j["alerts"].([]any)
	if len(alerts) != 1 || j["unread"].(float64) != 1 {
		t.Fatalf("alerts: %v", j)
	}
	al := alerts[0].(map[string]any)
	sum := al["summary"].(string)
	if !strings.Contains(sum, "1 pesaing baru") || !strings.Contains(sum, "1 hilang dari peta") || !strings.Contains(sum, "1 rating turun") {
		t.Fatalf("summary: %q", sum)
	}
	if int64(al["report_id"].(float64)) != r2 || al["severity"].(float64) < 7 || al["notified_at"] == nil {
		t.Fatalf("alert: %v", al)
	}
	code, j = o.post("/watch/alerts/read", map[string]any{"all": true})
	o.must(200, code, j)
	_, j = o.get("/watch/alerts")
	if j["unread"].(float64) != 0 {
		t.Fatalf("belum terbaca semua: %v", j["unread"])
	}
	if hook.count("ping") != 1 || hook.count("report.done") != 2 || hook.count("watch.alert") != 1 || hook.badSig != 0 {
		t.Fatalf("webhook diterima: %v, tanda tangan salah: %d", hook.got, hook.badSig)
	}
	var pending int
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM webhook_outbox WHERE delivered_at IS NULL`).Scan(&pending)
	if pending != 0 {
		t.Fatalf("outbox masih ada %d belum terkirim", pending)
	}

	// hasil instan: org lain meminta pasangan yang sama -> laporan disalin tanpa job dan tanpa kuota,
	// hanya data dasar Maps (tanpa kontak berbayar), tanpa id sumber di JSON
	p := e.client()
	p.register("p@x.id", "P")
	code, j = p.post("/market/run", map[string]any{"industry": "Kopi", "area": "kemang"})
	p.must(200, code, j)
	if j["cached"] != true || j["job"] != nil || j["report_id"] == nil {
		t.Fatalf("cached run: %v", j)
	}
	copyID := jsonNum(j["report_id"])
	_, j = p.get("/market/report?id=" + copyID)
	if j["industry"] != "Kopi" || len(j["all"].([]any)) != 2 {
		t.Fatalf("laporan salinan: %v", j)
	}
	if _, ada := j["cached_from"]; ada {
		t.Fatal("cached_from tidak boleh ada di JSON salinan")
	}
	for _, x := range j["all"].([]any) {
		pl := x.(map[string]any)
		for _, f := range contactFields {
			if _, ada := pl[f]; ada {
				t.Fatalf("salinan cache membawa field %s: %v", f, pl)
			}
		}
	}
	_, j = p.get("/org")
	if u, ok := j["usage"].(map[string]any); ok && u["market_run"] != nil && u["market_run"].(float64) != 0 {
		t.Fatalf("hasil cache tidak boleh makan kuota: %v", u)
	}
	// klik kedua: tidak ada salinan baru, id lama dikembalikan
	code, j = p.post("/market/run", map[string]any{"industry": "kopi", "area": "Kemang"})
	p.must(200, code, j)
	if jsonNum(j["report_id"]) != copyID {
		t.Fatalf("salinan ganda: %v vs %s", j["report_id"], copyID)
	}
	var nCopies int
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM reports WHERE cached_from IS NOT NULL`).Scan(&nCopies)
	if nCopies != 1 {
		t.Fatalf("salinan cache: %d", nCopies)
	}
	// salinan cache tidak memicu webhook report.done
	e.app.processNewReports(ctx)
	e.app.processOutbox(ctx)
	if hook.count("report.done") != 2 {
		t.Fatalf("report.done untuk salinan cache: %d", hook.count("report.done"))
	}
	// daftar laporan: ringkasan ikut, ditandai cached
	_, j = p.get("/market/reports")
	l := list(j)
	if len(l) != 1 || l[0].(map[string]any)["cached"] != true || l[0].(map[string]any)["summary"].(map[string]any)["businesses"].(float64) != 2 {
		t.Fatalf("daftar laporan: %v", l)
	}

	// fresh=true melewati cache -> masuk antrian job
	code, j = p.post("/market/run", map[string]any{"industry": "Kopi", "area": "kemang", "fresh": true})
	p.must(200, code, j)
	if j["cached"] == true || j["job"] == nil {
		t.Fatalf("fresh run harus jadi job: %v", j)
	}

	// saran: ambang 1 org -> pasangan asli tampil (salinan tidak dihitung); ambang 2 -> kosong; kurasi -> tampil
	_, j = p.get("/market/suggest")
	items := j["items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["industry"] != "kopi" || items[0].(map[string]any)["org_id"] != nil {
		t.Fatalf("suggest: %v", items)
	}
	t.Setenv("SUGGEST_MIN_ORGS", "2")
	_, j = p.get("/market/suggest")
	if len(j["items"].([]any)) != 0 {
		t.Fatalf("suggest harus kosong di bawah ambang: %v", j["items"])
	}
	t.Setenv("SUGGEST_CURATED", "Kopi|KEMANG;bakso|tebet")
	_, j = p.get("/market/suggest")
	if len(j["items"].([]any)) != 1 {
		t.Fatalf("suggest kurasi: %v", j["items"])
	}
}

// TestIntegrationOutboxRetry: pengiriman gagal dijadwalkan ulang dengan backoff, sukses menandai delivered_at,
// dan setelah outboxMaxAttempts tidak diambil lagi.
func TestIntegrationOutboxRetry(t *testing.T) {
	t.Setenv("ALLOW_INSECURE_WEBHOOK", "1")
	e := setupIntegration(t)
	o := e.client()
	o.register("ob@x.id", "OB")
	e.verifyUser(o, "ob@x.id")
	_, me := o.get("/auth/me")
	org := me["org_id"].(string)
	hook := newHookServer("s")
	defer hook.srv.Close()
	code, j := o.post("/org/settings", map[string]string{"webhook_url": hook.srv.URL, "webhook_secret": "s"})
	o.must(200, code, j)

	ctx := context.Background()
	hook.mu.Lock()
	hook.fail = 1
	hook.mu.Unlock()
	e.app.webhook(org, "ping", map[string]any{"n": 1})
	if d, f := e.app.processOutbox(ctx); d != 0 || f != 1 {
		t.Fatalf("putaran 1: delivered %d failed %d", d, f)
	}
	var attempts int
	var nextIn float64
	var lastErr *string
	var delivered *time.Time
	e.app.db.QueryRow(ctx, `SELECT attempts, extract(epoch from next_at - now()), last_error, delivered_at FROM webhook_outbox`).Scan(&attempts, &nextIn, &lastErr, &delivered)
	if attempts != 1 || nextIn < 50 || nextIn > 70 || lastErr == nil || delivered != nil {
		t.Fatalf("backoff pertama: attempts=%d next_in=%.0f err=%v delivered=%v", attempts, nextIn, lastErr, delivered)
	}
	// belum jatuh tempo: tidak diambil
	if d, f := e.app.processOutbox(ctx); d != 0 || f != 0 {
		t.Fatalf("belum jatuh tempo tapi diproses: %d %d", d, f)
	}
	e.app.db.Exec(ctx, `UPDATE webhook_outbox SET next_at=now()`)
	if d, f := e.app.processOutbox(ctx); d != 1 || f != 0 {
		t.Fatalf("putaran 2: delivered %d failed %d", d, f)
	}
	e.app.db.QueryRow(ctx, `SELECT attempts, last_error, delivered_at FROM webhook_outbox`).Scan(&attempts, &lastErr, &delivered)
	if attempts != 2 || lastErr != nil || delivered == nil || hook.count("ping") != 1 {
		t.Fatalf("sukses: attempts=%d err=%v delivered=%v ping=%d", attempts, lastErr, delivered, hook.count("ping"))
	}
	// menyerah setelah outboxMaxAttempts
	e.app.db.Exec(ctx, `UPDATE webhook_outbox SET delivered_at=NULL, attempts=$1, next_at=now()`, outboxMaxAttempts)
	if d, f := e.app.processOutbox(ctx); d != 0 || f != 0 {
		t.Fatalf("sudah menyerah tapi diproses: %d %d", d, f)
	}
	// org tanpa webhook_url: tidak ada baris outbox
	e.app.db.Exec(ctx, `UPDATE org_settings SET webhook_url='' WHERE org_id=$1`, org)
	e.app.webhook(org, "ping", map[string]any{"n": 2})
	var n int
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM webhook_outbox`).Scan(&n)
	if n != 1 {
		t.Fatalf("outbox untuk org tanpa webhook: %d baris", n)
	}
}

func jsonNum(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
