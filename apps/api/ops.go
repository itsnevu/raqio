// ops.go: hal operasional lintas endpoint. Rate limit, health (liveness/readiness), dan metrik Prometheus.
// Sengaja tanpa dependency tambahan; format metrik ditulis manual sesuai text exposition format.
package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ---------- rate limit (token bucket per kunci, di memori) ----------

type bucket struct {
	tokens float64
	last   time.Time
}

// limiter membatasi N permintaan per detik dengan toleransi burst, per kunci (IP atau org).
// Entri yang lama tidak dipakai dibersihkan berkala supaya memori tidak tumbuh.
type limiter struct {
	mu    sync.Mutex
	rate  float64 // token per detik
	burst float64
	m     map[string]*bucket
	now   func() time.Time
}

func newLimiter(perMinute, burst int) *limiter { return newLimiterRate(float64(perMinute)/60, burst) }

// newLimiterRate: laju dalam token per detik (bisa pecahan, mis. 5.0/3600 = 5 per jam).
func newLimiterRate(perSecond float64, burst int) *limiter {
	l := &limiter{rate: perSecond, burst: float64(burst), m: map[string]*bucket{}, now: time.Now}
	go func() {
		for range time.Tick(5 * time.Minute) {
			l.sweep()
		}
	}()
	return l
}

func (l *limiter) sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	// hanya buang entri yang sudah terisi penuh lagi: menghapus lebih awal sama dengan mengisi ulang gratis
	// (penting untuk limiter lambat seperti tamu, 5 per jam)
	t := l.now()
	for k, b := range l.m {
		if b.tokens+t.Sub(b.last).Seconds()*l.rate >= l.burst {
			delete(l.m, k)
		}
	}
}

// allow mengambil satu token untuk kunci; false kalau habis.
func (l *limiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	t := l.now()
	b := l.m[key]
	if b == nil {
		b = &bucket{tokens: l.burst, last: t}
		l.m[key] = b
	}
	b.tokens += t.Sub(b.last).Seconds() * l.rate
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.last = t
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// rateLimitIP: batas umum per IP untuk semua endpoint (kecuali health).
func rateLimitIP(l *limiter, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" || r.URL.Path == "/metrics" {
			next.ServeHTTP(w, r)
			return
		}
		if !l.allow(clientIP(r)) {
			metricRateLimited.Add(1)
			w.Header().Set("Retry-After", "60")
			errJSON(w, 429, "Terlalu banyak permintaan, coba lagi sebentar.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// rateLimitOrg: batas lebih ketat per org untuk endpoint yang membuat job (mahal). Dipasang setelah requireSession.
func (a *App) rateLimitOrg(l *limiter, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := clientIP(r)
		if s, ok := r.Context().Value(sessKey).(*Session); ok && s != nil {
			key = "org:" + s.OrgID
		}
		if !l.allow(key) {
			metricRateLimited.Add(1)
			w.Header().Set("Retry-After", "60")
			errJSON(w, 429, "Terlalu banyak riset dijalankan sekaligus, tunggu sebentar.")
			return
		}
		next(w, r)
	}
}

// ---------- request id + recover ----------

type ctxKeyReqID struct{}

// requestID: pakai X-Request-Id dari proxy kalau ada, kalau tidak buat sendiri. Ikut di log dan audit.
func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if id == "" || len(id) > 64 {
			b := make([]byte, 8)
			rand.Read(b)
			id = hex.EncodeToString(b)
		}
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKeyReqID{}, id)))
	})
}

func reqID(r *http.Request) string { id, _ := r.Context().Value(ctxKeyReqID{}).(string); return id }

// recoverPanic: handler yang panic dibalas 500 rapi, dicatat, dan dialarmkan ke pengelola (ops_alert.go),
// bukan memutus koneksi tanpa jejak.
func (a *App) recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				stack := string(debug.Stack())
				slog.Error("panic", "err", fmt.Sprint(rec), "path", r.URL.Path, "rid", reqID(r), "stack", stack)
				a.opsAlert("panic", "Panic di "+r.Method+" "+r.URL.Path,
					fmt.Sprintf("rid %s\n%s\n%s", reqID(r), trunc(fmt.Sprint(rec), 200), trunc(stack, 400)))
				errJSON(w, 500, "Terjadi kesalahan di server.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// ---------- audit ----------

// audit mencatat aksi ke audit_log. Tidak pernah menggagalkan request; kalau insert gagal hanya dicatat di log.
func (a *App) audit(r *http.Request, orgID, userID *string, action, target string, status int) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if _, err := a.db.Exec(ctx, `INSERT INTO audit_log (org_id, user_id, action, target, ip, request_id, status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		orgID, userID, action, trunc(target, 200), clientIP(r), reqID(r), status); err != nil {
		slog.Warn("audit gagal", "err", err, "action", action)
	}
}

// ---------- metrik ----------

var (
	metricReqTotal    [6]atomic.Int64 // indeks = kelas status (1xx..5xx), 0 tidak dipakai
	metricReqInflight atomic.Int64
	metricRateLimited atomic.Int64
	metricStart       = time.Now()
)

// countRequests mencatat jumlah request per kelas status dan yang sedang berjalan. Respons 5xx juga dihitung
// per jendela 5 menit: mencapai OPS_5XX_THRESHOLD memicu alarm ops.
func (a *App) countRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		metricReqInflight.Add(1)
		defer metricReqInflight.Add(-1)
		sw := &statusWriter{ResponseWriter: w, code: 200}
		next.ServeHTTP(sw, r)
		if c := sw.code / 100; c >= 1 && c <= 5 {
			metricReqTotal[c].Add(1)
			if c == 5 && a.ops != nil && a.ops.note5xx() {
				a.opsAlert("http_5xx", fmt.Sprintf("%d respons 5xx dalam 5 menit", a.ops.threshold5xx()),
					"terakhir: "+r.Method+" "+r.URL.Path+" "+strconv.Itoa(sw.code)+" rid "+reqID(r))
			}
		}
	})
}

// metricsAllowed: /metrics dibuka kalau METRICS_TOKEN kosong atau Authorization: Bearer cocok. Tanpa token di
// produksi, hanya dari IP privat/loopback (scraper Prometheus di jaringan yang sama).
func metricsAllowed(r *http.Request) bool {
	tok := env("METRICS_TOKEN", "")
	if tok != "" {
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		return got != r.Header.Get("Authorization") && subtle.ConstantTimeCompare([]byte(strings.TrimSpace(got)), []byte(tok)) == 1
	}
	if !isProduction() {
		return true
	}
	ip := net.ParseIP(clientIP(r))
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast())
}

// metrics: format teks Prometheus. Jumlah job per status diambil langsung dari DB (murah, tabel kecil).
func (a *App) metrics(w http.ResponseWriter, r *http.Request) {
	if !metricsAllowed(r) {
		errJSON(w, 403, "metrics hanya untuk pemantau internal")
		return
	}
	var b strings.Builder
	b.WriteString("# HELP raqio_http_requests_total Jumlah request HTTP per kelas status.\n# TYPE raqio_http_requests_total counter\n")
	for c := 1; c <= 5; c++ {
		fmt.Fprintf(&b, "raqio_http_requests_total{class=\"%dxx\"} %d\n", c, metricReqTotal[c].Load())
	}
	fmt.Fprintf(&b, "# HELP raqio_http_inflight Request yang sedang diproses.\n# TYPE raqio_http_inflight gauge\nraqio_http_inflight %d\n", metricReqInflight.Load())
	fmt.Fprintf(&b, "# HELP raqio_rate_limited_total Request yang ditolak rate limit.\n# TYPE raqio_rate_limited_total counter\nraqio_rate_limited_total %d\n", metricRateLimited.Load())
	fmt.Fprintf(&b, "# HELP raqio_uptime_seconds Lama proses hidup.\n# TYPE raqio_uptime_seconds gauge\nraqio_uptime_seconds %d\n", int64(time.Since(metricStart).Seconds()))

	b.WriteString("# HELP raqio_jobs Jumlah job per status.\n# TYPE raqio_jobs gauge\n")
	rows, err := a.db.Query(r.Context(), `SELECT status, count(*) FROM jobs WHERE status IN ('queued','running') OR finished_at > now() - interval '24 hours' GROUP BY status`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var st string
			var n int64
			if rows.Scan(&st, &n) == nil {
				fmt.Fprintf(&b, "raqio_jobs{status=%q} %d\n", st, n)
			}
		}
	}
	var oldest float64
	if a.db.QueryRow(r.Context(), `SELECT coalesce(extract(epoch FROM now() - min(created_at)), 0) FROM jobs WHERE status='queued'`).Scan(&oldest) == nil {
		fmt.Fprintf(&b, "# HELP raqio_jobs_oldest_queued_seconds Umur job tertua yang masih antri.\n# TYPE raqio_jobs_oldest_queued_seconds gauge\nraqio_jobs_oldest_queued_seconds %.0f\n", oldest)
	}
	a.metricsJobs24h(r.Context(), &b)
	a.metricsOutboxAlerts(r.Context(), &b)
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	w.Write([]byte(b.String()))
}

// metricsJobs24h: satu query agregat per kind atas job 24 jam terakhir: durasi job done (p50, p90), jumlah gagal,
// dan jumlah job chat yang dibuat.
func (a *App) metricsJobs24h(ctx context.Context, b *strings.Builder) {
	rows, err := a.db.Query(ctx, `SELECT kind,
			percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at - started_at))
				FILTER (WHERE status='done' AND started_at IS NOT NULL AND finished_at > now() - interval '24 hours'),
			percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at - started_at))
				FILTER (WHERE status='done' AND started_at IS NOT NULL AND finished_at > now() - interval '24 hours'),
			count(*) FILTER (WHERE status='failed' AND finished_at > now() - interval '24 hours'),
			count(*) FILTER (WHERE created_at > now() - interval '24 hours')
		FROM jobs WHERE finished_at > now() - interval '24 hours' OR created_at > now() - interval '24 hours'
		GROUP BY kind ORDER BY kind`)
	if err != nil {
		logDB("metrics", "jobs 24h", err)
		return
	}
	defer rows.Close()
	type row struct {
		kind            string
		p50, p90        *float64
		failed, created int64
	}
	var list []row
	for rows.Next() {
		var x row
		if rows.Scan(&x.kind, &x.p50, &x.p90, &x.failed, &x.created) == nil {
			list = append(list, x)
		}
	}
	b.WriteString("# HELP raqio_job_duration_seconds Durasi job selesai 24 jam terakhir per jenis (kuantil).\n# TYPE raqio_job_duration_seconds gauge\n")
	for _, x := range list {
		if x.p50 != nil && x.p90 != nil {
			fmt.Fprintf(b, "raqio_job_duration_seconds{kind=%q,quantile=\"0.5\"} %.1f\nraqio_job_duration_seconds{kind=%q,quantile=\"0.9\"} %.1f\n", x.kind, *x.p50, x.kind, *x.p90)
		}
	}
	b.WriteString("# HELP raqio_jobs_failed_total Job gagal final 24 jam terakhir per jenis.\n# TYPE raqio_jobs_failed_total gauge\n")
	var chat int64
	for _, x := range list {
		fmt.Fprintf(b, "raqio_jobs_failed_total{kind=%q} %d\n", x.kind, x.failed)
		if x.kind == "chat" {
			chat = x.created
		}
	}
	fmt.Fprintf(b, "# HELP raqio_chat_jobs_24h Job asisten (chat) yang dibuat 24 jam terakhir.\n# TYPE raqio_chat_jobs_24h gauge\nraqio_chat_jobs_24h %d\n", chat)
}

// metricsOutboxAlerts: satu query untuk outbox webhook (menunggu, menyerah, terkirim 24 jam) dan alert pantauan 24 jam.
func (a *App) metricsOutboxAlerts(ctx context.Context, b *strings.Builder) {
	var pending, failed, delivered, alerts int64
	err := a.db.QueryRow(ctx, `SELECT
			(SELECT count(*) FROM webhook_outbox WHERE delivered_at IS NULL AND attempts < $1),
			(SELECT count(*) FROM webhook_outbox WHERE delivered_at IS NULL AND attempts >= $1),
			(SELECT count(*) FROM webhook_outbox WHERE delivered_at > now() - interval '24 hours'),
			(SELECT count(*) FROM watch_alerts WHERE created_at > now() - interval '24 hours')`, outboxMaxAttempts).
		Scan(&pending, &failed, &delivered, &alerts)
	if err != nil {
		logDB("metrics", "outbox+alerts", err)
		return
	}
	fmt.Fprintf(b, "# HELP raqio_webhook_outbox Webhook di outbox: pending (masih dicoba), failed (menyerah), delivered_24h.\n# TYPE raqio_webhook_outbox gauge\n"+
		"raqio_webhook_outbox{state=\"pending\"} %d\nraqio_webhook_outbox{state=\"failed\"} %d\nraqio_webhook_outbox{state=\"delivered_24h\"} %d\n", pending, failed, delivered)
	fmt.Fprintf(b, "# HELP raqio_alerts_24h Alert pantauan yang dibuat 24 jam terakhir.\n# TYPE raqio_alerts_24h gauge\nraqio_alerts_24h %d\n", alerts)
}

// ---------- health ----------

// healthz: proses hidup. Tidak menyentuh DB, supaya restart loop tidak terpicu hanya karena DB sibuk.
func healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]string{"status": "ok", "service": "raqio-api"})
}

// readyzFails: kegagalan ping DB berturut-turut; yang ketiga memicu alarm ops, sukses mengembalikan ke nol.
var readyzFails atomic.Int32

// readyz: siap menerima trafik, DB bisa dicapai.
func (a *App) readyz(w http.ResponseWriter, r *http.Request) {
	if err := a.db.Ping(r.Context()); err != nil {
		if n := readyzFails.Add(1); n == 3 {
			a.opsAlert("readyz", "DB tidak bisa dicapai 3 kali berturut-turut", redactErr(err))
		}
		writeJSON(w, 503, map[string]string{"status": "db down"})
		return
	}
	readyzFails.Store(0)
	writeJSON(w, 200, map[string]string{"status": "ready"})
}
