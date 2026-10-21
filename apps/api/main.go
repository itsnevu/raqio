// raqio-api: backend utama. Auth, org, kuota, antrian job, dan endpoint data riset.
// Path endpoint sengaja sama dengan versi Python lama supaya frontend tidak berubah.
package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type App struct {
	mail       *Mailer
	db         *pgxpool.Pool
	secret     []byte
	legacy     *httputil.ReverseProxy
	secureCook bool
	retention  time.Duration
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if n, err := strconv.Atoi(os.Getenv(k)); err == nil && n > 0 {
		return n
	}
	return def
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	// ctx dibatalkan saat SIGINT/SIGTERM: scheduler berhenti, server shutdown rapi (compose stop, deploy ulang).
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dsn := env("DATABASE_URL", "postgres://raqio:raqio@127.0.0.1:5433/raqio?sslmode=disable")
	pcfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		slog.Error("db dsn", "err", err)
		os.Exit(1)
	}
	pcfg.MaxConns = int32(envInt("DB_MAX_CONNS", 10))
	pcfg.MinConns = 1
	pcfg.MaxConnLifetime = time.Hour
	pcfg.MaxConnIdleTime = 10 * time.Minute
	pcfg.HealthCheckPeriod = 30 * time.Second
	pool, err := pgxpool.NewWithConfig(ctx, pcfg)
	if err != nil {
		slog.Error("db", "err", err)
		os.Exit(1)
	}
	for i := 0; i < 30; i++ { // tunggu Postgres siap (compose)
		if err = pool.Ping(ctx); err == nil {
			break
		}
		time.Sleep(time.Second)
	}
	if err != nil {
		slog.Error("db ping", "err", err)
		os.Exit(1)
	}
	if err := migrate(ctx, pool); err != nil {
		slog.Error("migrate", "err", err)
		os.Exit(1)
	}

	secret := env("AUTH_SECRET", "")
	if len(secret) < 16 {
		slog.Error("AUTH_SECRET wajib diisi, minimal 16 karakter")
		os.Exit(1)
	}
	legacyURL, _ := url.Parse(env("SCRAPER_URL", "http://127.0.0.1:8000"))
	retention := 90 * 24 * time.Hour
	if d, err := time.ParseDuration(env("RETENTION", "")); err == nil && d > 0 {
		retention = d
	}
	app := &App{
		mail: newMailer(),
		db:   pool, secret: []byte(secret),
		legacy:     httputil.NewSingleHostReverseProxy(legacyURL),
		secureCook: env("COOKIE_SECURE", "0") == "1",
		retention:  retention,
	}

	mux := app.router()

	go app.scheduler(ctx)
	go app.retentionLoop(ctx)

	port := env("PORT", "8080")
	slog.Info("raqio-api jalan", "port", port, "legacy", legacyURL.String())
	// urutan: hitung metrik -> log -> rate limit per IP -> header keamanan -> router
	ipLimit := newLimiter(envInt("RATE_LIMIT_PER_MINUTE", 300), envInt("RATE_LIMIT_BURST", 60))
	handler := requestID(recoverPanic(countRequests(logRequests(rateLimitIP(ipLimit, secHeaders(mux))))))
	srv := &http.Server{Addr: ":" + port, Handler: handler, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		<-ctx.Done()
		slog.Info("shutdown: berhenti menerima koneksi baru, tunggu request berjalan maksimal 15 detik")
		sctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		srv.Shutdown(sctx)
	}()
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server", "err", err)
		os.Exit(1)
	}
	pool.Close()
	slog.Info("shutdown selesai")
}

// ---------- util http ----------

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func errJSON(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func readJSON(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 64<<10)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil && err.Error() != "EOF" {
		return err
	}
	return nil
}

func secHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("Referrer-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}

type statusWriter struct {
	http.ResponseWriter
	code int
}

func (s *statusWriter) WriteHeader(c int) { s.code = c; s.ResponseWriter.WriteHeader(c) }

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t := time.Now()
		sw := &statusWriter{ResponseWriter: w, code: 200}
		next.ServeHTTP(sw, r)
		if strings.HasPrefix(r.URL.Path, "/log") || r.URL.Path == "/healthz" || r.URL.Path == "/readyz" || r.URL.Path == "/metrics" {
			return // polling, jangan banjiri log
		}
		slog.Info("req", "m", r.Method, "path", r.URL.Path, "code", sw.code, "ms", time.Since(t).Milliseconds(), "rid", reqID(r))
	})
}

func trunc(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

// router memasang semua endpoint; dipakai main dan tes integrasi.
func (app *App) router() *http.ServeMux {
	mux := http.NewServeMux()
	if env("DOCS", "1") == "1" {
		mux.HandleFunc("GET /openapi.yaml", app.openapi)
		mux.HandleFunc("GET /docs", app.swaggerUI)
	}
	mux.HandleFunc("GET /healthz", healthz)
	mux.HandleFunc("GET /readyz", app.readyz)
	mux.HandleFunc("GET /metrics", app.metrics)

	// auth (tanpa sesi)
	mux.HandleFunc("POST /auth/register", app.register)
	mux.HandleFunc("POST /auth/login", app.login)
	mux.HandleFunc("POST /auth/logout", app.logout)
	mux.HandleFunc("POST /auth/forgot", app.forgot)
	mux.HandleFunc("POST /auth/reset", app.resetPassword)
	mux.HandleFunc("GET /auth/verify", app.verifyEmail)
	mux.HandleFunc("GET /auth/invite", app.inviteInfo)
	mux.HandleFunc("GET /billing/plans", app.listPlans)
	mux.HandleFunc("POST /billing/webhook/xendit", app.xenditWebhook)

	// butuh sesi
	auth := app.requireSession
	mux.Handle("GET /auth/me", auth(app.me))
	mux.Handle("POST /auth/switch-org", auth(app.switchOrg))
	mux.Handle("POST /auth/delete-account", auth(app.deleteAccount))
	mux.Handle("GET /org", auth(app.orgInfo))
	mux.Handle("POST /org/invite", auth(app.orgInviteEmail))
	mux.Handle("POST /org/remove-member", auth(app.removeMember))
	mux.Handle("POST /auth/accept-invite", auth(app.acceptInvite))
	mux.Handle("POST /auth/resend-verify", auth(app.resendVerify))
	mux.Handle("POST /auth/change-password", auth(app.changePassword))
	mux.Handle("POST /billing/checkout", auth(app.checkout))
	mux.Handle("GET /billing/invoices", auth(app.listInvoices))
	mux.Handle("GET /org/settings", auth(app.getSettings))
	mux.Handle("POST /org/settings", auth(app.putSettings))

	mux.Handle("GET /market/reports", auth(app.listReports))
	mux.Handle("GET /market/report", auth(app.getReport))
	// endpoint yang membuat job dibatasi per org, bukan hanya per IP
	jobLimit := newLimiter(envInt("JOB_RATE_LIMIT_PER_MINUTE", 10), envInt("JOB_RATE_LIMIT_BURST", 5))
	mux.Handle("POST /market/run", auth(app.rateLimitOrg(jobLimit, app.runMarket)))
	mux.Handle("POST /market/compare/run", auth(app.rateLimitOrg(jobLimit, app.runCompare)))
	mux.Handle("GET /market/compare", auth(app.getCompare))
	mux.Handle("GET /market/watches", auth(app.listWatches))
	mux.Handle("POST /market/watch", auth(app.setWatch))
	mux.Handle("POST /market/lead", auth(app.setLead))
	mux.Handle("POST /market/detail", auth(app.rateLimitOrg(jobLimit, app.detail)))
	mux.Handle("GET /prospects/data", auth(app.prospects))
	mux.Handle("GET /watch/data", auth(app.watchData))
	mux.Handle("GET /log", auth(app.jobLog))
	mux.Handle("POST /stop", auth(app.stopJob))
	mux.Handle("GET /jobs", auth(app.listJobs))

	// fitur IG lama masih di Python; diteruskan, tetap wajib login
	mux.Handle("GET /business", auth(app.igProfile))
	mux.Handle("POST /run", auth(app.rateLimitOrg(jobLimit, app.igRun)))
	for _, p := range []string{"/chat", "/chat/", "/ask", "/tools", "/competitors", "/report", "/static/"} {
		mux.Handle(p, auth(app.legacy.ServeHTTP))
	}

	return mux
}
