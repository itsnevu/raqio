package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// TestOpsAlerterThrottleAnd5xx: jenis alarm yang sama maksimal sekali per 10 menit; jendela 5xx memicu tepat
// saat mencapai ambang, sekali per jendela 5 menit.
func TestOpsAlerterThrottleAnd5xx(t *testing.T) {
	now := time.Unix(0, 0)
	o := newOpsAlerter()
	o.now = func() time.Time { return now }
	if !o.allow("panic") {
		t.Fatal("alarm pertama harus lolos")
	}
	if o.allow("panic") {
		t.Fatal("alarm kedua dalam 10 menit harus ditahan")
	}
	if !o.allow("readyz") {
		t.Fatal("jenis lain punya throttle sendiri")
	}
	now = now.Add(10*time.Minute - time.Second)
	if o.allow("panic") {
		t.Fatal("belum 10 menit")
	}
	now = now.Add(time.Second)
	if !o.allow("panic") {
		t.Fatal("setelah 10 menit boleh lagi")
	}

	t.Setenv("OPS_5XX_THRESHOLD", "3")
	if o.note5xx() || o.note5xx() {
		t.Fatal("di bawah ambang tidak boleh memicu")
	}
	if !o.note5xx() {
		t.Fatal("respons 5xx ke-3 harus memicu")
	}
	if o.note5xx() || o.note5xx() {
		t.Fatal("di atas ambang pada jendela yang sama tidak memicu lagi")
	}
	now = now.Add(5 * time.Minute)
	if o.note5xx() {
		t.Fatal("jendela baru mulai menghitung dari 1")
	}
	if o.configured() {
		t.Fatal("tanpa env OPS_* tidak dikonfigurasi")
	}
}

// opsHook: penerima webhook ops palsu yang menyimpan body terakhir.
type opsHook struct {
	srv  *httptest.Server
	mu   sync.Mutex
	n    int
	last []byte
	ev   string
}

func newOpsHook() *opsHook {
	h := &opsHook{}
	h.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		h.mu.Lock()
		h.n++
		h.last = b
		h.ev = r.Header.Get("X-Raqio-Event")
		h.mu.Unlock()
		w.WriteHeader(204)
	}))
	return h
}

func (h *opsHook) count() int { h.mu.Lock(); defer h.mu.Unlock(); return h.n }

// TestOpsAlertDelivery: alarm dikirim ke OPS_WEBHOOK_URL sebagai event ops.alert bertanda tangan, rahasia diredaksi,
// panic yang tertangkap recoverPanic dibalas 500 dan dialarmkan; tanpa env hanya log (tidak panic walau ops nil).
func TestOpsAlertDelivery(t *testing.T) {
	t.Setenv("ALLOW_INSECURE_WEBHOOK", "1")
	hook := newOpsHook()
	defer hook.srv.Close()
	t.Setenv("OPS_WEBHOOK_URL", hook.srv.URL)
	t.Setenv("OPS_WEBHOOK_SECRET", "ops-rahasia")
	t.Setenv("OPS_TELEGRAM_CHAT", "")
	t.Setenv("TELEGRAM_BOT_TOKEN", "123456:ABC-tok")

	app := &App{ops: newOpsAlerter()}
	if !app.ops.configured() {
		t.Fatal("OPS_WEBHOOK_URL terisi harus dianggap dikonfigurasi")
	}
	app.deliverOpsAlert("test", "Judul", "detail")
	if hook.count() != 1 || hook.ev != "ops.alert" {
		t.Fatalf("webhook ops: n=%d event=%q", hook.count(), hook.ev)
	}
	var pl struct {
		Event string `json:"event"`
		Data  struct {
			Kind, Title, Detail, Host string
		} `json:"data"`
	}
	if err := json.Unmarshal(hook.last, &pl); err != nil || pl.Event != "ops.alert" || pl.Data.Kind != "test" || pl.Data.Title != "Judul" || pl.Data.Detail != "detail" {
		t.Fatalf("payload: %s (%v)", hook.last, err)
	}

	// panic -> 500 + alarm (asinkron) dengan path, rid, potongan stack; rahasia di nilai panic diredaksi
	h := requestID(app.recoverPanic(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("meledak dengan token bot123456:ABC-tok dan ops-rahasia")
	})))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/market/run", nil))
	if rec.Code != 500 || !strings.Contains(rec.Body.String(), "Terjadi kesalahan") {
		t.Fatalf("panic: %d %s", rec.Code, rec.Body.String())
	}
	deadline := time.Now().Add(3 * time.Second)
	for hook.count() < 2 && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	if hook.count() != 2 {
		t.Fatalf("alarm panic tidak terkirim: %d", hook.count())
	}
	body := string(hook.last)
	if !strings.Contains(body, `"kind":"panic"`) || !strings.Contains(body, "GET /market/run") || !strings.Contains(body, "rid ") || !strings.Contains(body, "goroutine") {
		t.Fatalf("isi alarm panic: %s", body)
	}
	if strings.Contains(body, "ABC-tok") || strings.Contains(body, "ops-rahasia") {
		t.Fatalf("rahasia bocor di alarm: %s", body)
	}
	// panic kedua dalam 10 menit: throttle, tidak dikirim lagi
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/market/run", nil))
	time.Sleep(200 * time.Millisecond)
	if hook.count() != 2 {
		t.Fatalf("throttle panic: %d", hook.count())
	}

	// 5xx beruntun: countRequests mengalarmkan saat mencapai ambang
	t.Setenv("OPS_5XX_THRESHOLD", "2")
	h5 := requestID(app.countRequests(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(502) })))
	for i := 0; i < 3; i++ {
		h5.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/x", nil))
	}
	deadline = time.Now().Add(3 * time.Second)
	for hook.count() < 3 && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	if hook.count() != 3 || !strings.Contains(string(hook.last), `"kind":"http_5xx"`) {
		t.Fatalf("alarm 5xx: n=%d body=%s", hook.count(), hook.last)
	}

	// tanpa saluran: hanya log, tidak ada kiriman, dan ops nil aman
	t.Setenv("OPS_WEBHOOK_URL", "")
	app.opsAlert("readyz", "x", "y")
	(&App{}).opsAlert("readyz", "x", "y")
	time.Sleep(100 * time.Millisecond)
	if hook.count() != 3 {
		t.Fatalf("tanpa env tidak boleh mengirim: %d", hook.count())
	}
}

// TestIntegrationMetricsExtended: metrik durasi job, job gagal, outbox webhook, alert, dan job chat muncul di /metrics.
func TestIntegrationMetricsExtended(t *testing.T) {
	t.Setenv("APP_ENV", "")
	t.Setenv("METRICS_TOKEN", "")
	e := setupIntegration(t)
	a := e.client()
	a.register("metrik@x.id", "Metrik")
	org := orgOf(t, a)
	ctx := context.Background()
	if _, err := e.app.db.Exec(ctx, `INSERT INTO jobs (org_id, kind, status, params, started_at, finished_at) VALUES
		($1,'market_run','done','{}', now() - interval '30 seconds', now()),
		($1,'market_run','done','{}', now() - interval '10 seconds', now()),
		($1,'market_run','failed','{}', now() - interval '5 seconds', now()),
		($1,'chat','done','{"sid":"x"}', now() - interval '2 seconds', now()),
		($1,'chat','queued','{"sid":"y"}', NULL, NULL)`, org); err != nil {
		t.Fatal(err)
	}
	if _, err := e.app.db.Exec(ctx, `INSERT INTO webhook_outbox (org_id, event, payload, attempts, delivered_at) VALUES
		($1,'x','{}',0,NULL), ($1,'x','{}',$2,NULL), ($1,'x','{}',1,now())`, org, outboxMaxAttempts); err != nil {
		t.Fatal(err)
	}
	if _, err := e.app.db.Exec(ctx, `INSERT INTO watch_alerts (org_id, industry, area, summary, changes) VALUES ($1,'k','a','s','{}')`, org); err != nil {
		t.Fatal(err)
	}
	resp, err := http.Get(e.srv.URL + "/metrics")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	body := string(raw)
	if resp.StatusCode != 200 {
		t.Fatalf("metrics: %d %s", resp.StatusCode, body)
	}
	for _, want := range []string{
		`raqio_job_duration_seconds{kind="market_run",quantile="0.5"} 20.0`,
		`raqio_job_duration_seconds{kind="market_run",quantile="0.9"} 28.0`,
		`raqio_job_duration_seconds{kind="chat",quantile="0.5"} 2.0`,
		`raqio_jobs_failed_total{kind="market_run"} 1`,
		`raqio_jobs_failed_total{kind="chat"} 0`,
		`raqio_chat_jobs_24h 2`,
		`raqio_webhook_outbox{state="pending"} 1`,
		`raqio_webhook_outbox{state="failed"} 1`,
		`raqio_webhook_outbox{state="delivered_24h"} 1`,
		`raqio_alerts_24h 1`,
		`raqio_jobs{status="queued"} 1`,
	} {
		if !strings.Contains(body, want+"\n") {
			t.Fatalf("metrik %q tidak ada:\n%s", want, body)
		}
	}
}
