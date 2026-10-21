// ops.go: hal operasional lintas endpoint. Rate limit, health (liveness/readiness), dan metrik Prometheus.
// Sengaja tanpa dependency tambahan; format metrik ditulis manual sesuai text exposition format.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
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

func newLimiter(perMinute, burst int) *limiter {
	l := &limiter{rate: float64(perMinute) / 60, burst: float64(burst), m: map[string]*bucket{}, now: time.Now}
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
	cut := l.now().Add(-10 * time.Minute)
	for k, b := range l.m {
		if b.last.Before(cut) {
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

// recoverPanic: handler yang panic dibalas 500 rapi dan dicatat, bukan memutus koneksi tanpa jejak.
func recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic", "err", fmt.Sprint(rec), "path", r.URL.Path, "rid", reqID(r), "stack", string(debug.Stack()))
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

// countRequests mencatat jumlah request per kelas status dan yang sedang berjalan.
func countRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		metricReqInflight.Add(1)
		defer metricReqInflight.Add(-1)
		sw := &statusWriter{ResponseWriter: w, code: 200}
		next.ServeHTTP(sw, r)
		if c := sw.code / 100; c >= 1 && c <= 5 {
			metricReqTotal[c].Add(1)
		}
	})
}

// metrics: format teks Prometheus. Jumlah job per status diambil langsung dari DB (murah, tabel kecil).
func (a *App) metrics(w http.ResponseWriter, r *http.Request) {
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
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	w.Write([]byte(b.String()))
}

// ---------- health ----------

// healthz: proses hidup. Tidak menyentuh DB, supaya restart loop tidak terpicu hanya karena DB sibuk.
func healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]string{"status": "ok", "service": "raqio-api"})
}

// readyz: siap menerima trafik, DB bisa dicapai.
func (a *App) readyz(w http.ResponseWriter, r *http.Request) {
	if err := a.db.Ping(r.Context()); err != nil {
		writeJSON(w, 503, map[string]string{"status": "db down"})
		return
	}
	writeJSON(w, 200, map[string]string{"status": "ready"})
}
