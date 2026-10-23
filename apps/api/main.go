// raqio-api: backend utama. Auth, org, kuota, antrian job, dan endpoint data riset.
// Path endpoint sengaja sama dengan versi Python lama supaya frontend tidak berubah.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
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
	secureCook bool
	retention  time.Duration
	ops        *opsAlerter // alarm operasional (ops_alert.go); nil = hanya log
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

// checkAuthSecret: AUTH_SECRET minimal 32 karakter dan bukan placeholder dari .env.example.
func checkAuthSecret(secret string) error {
	if len(secret) < 32 {
		return errors.New("AUTH_SECRET wajib diisi, minimal 32 karakter acak (mis. openssl rand -hex 32)")
	}
	low := strings.ToLower(secret)
	for _, bad := range []string{"ganti-dengan", "ganti", "changeme", "change-me", "placeholder", "example"} {
		if strings.Contains(low, bad) {
			return errors.New("AUTH_SECRET masih placeholder (" + bad + "), isi dengan string acak")
		}
	}
	return nil
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	// ctx dibatalkan saat SIGINT/SIGTERM: scheduler berhenti, server shutdown rapi (compose stop, deploy ulang).
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	secret := env("AUTH_SECRET", "")
	if err := checkAuthSecret(secret); err != nil {
		slog.Error(err.Error())
		os.Exit(1)
	}
	if isProduction() && env("SMTP_HOST", "") == "" {
		slog.Error("APP_ENV=production tetapi SMTP_HOST kosong: email verifikasi, reset password, dan undangan TIDAK terkirim (isi SMTP_HOST)")
	}
	if isProduction() && insecureWebhookAllowed() {
		slog.Error("ALLOW_INSECURE_WEBHOOK=1 di produksi: webhook http:// dan loopback diizinkan, matikan")
	}

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
	// statement_timeout: query yang macet (lock, seq scan tak terduga) dihentikan server, bukan menahan koneksi pool
	pcfg.ConnConfig.RuntimeParams["statement_timeout"] = env("DB_STATEMENT_TIMEOUT_MS", "30000")
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

	retention := 90 * 24 * time.Hour
	if d, err := time.ParseDuration(env("RETENTION", "")); err == nil && d > 0 {
		retention = d
	}
	app := &App{
		mail: newMailer(),
		db:   pool, secret: []byte(secret),
		secureCook: env("COOKIE_SECURE", "0") == "1",
		retention:  retention,
		ops:        newOpsAlerter(),
	}

	mux := app.router()

	// loop latar belakang: masing-masing memakai pg_try_advisory_lock, aman dijalankan beberapa replika
	go app.scheduler(ctx)
	go app.retentionLoop(ctx)
	go app.alertLoop(ctx)
	go app.outboxLoop(ctx)

	port := env("PORT", "8080")
	slog.Info("raqio-api jalan", "port", port, "env", env("APP_ENV", "dev"), "chat", chatEnabled(), "ops_alert", app.ops.configured())
	// urutan: request id -> tangkap panic -> hitung metrik -> log -> rate limit per IP -> header keamanan -> router
	ipLimit := newLimiter(envInt("RATE_LIMIT_PER_MINUTE", 300), envInt("RATE_LIMIT_BURST", 60))
	handler := requestID(app.recoverPanic(app.countRequests(logRequests(rateLimitIP(ipLimit, secHeaders(mux))))))
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      0, // SSE /log/stream bisa terbuka sampai 30 menit
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    64 << 10,
	}
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

var errNotJSON = errors.New("Content-Type harus application/json")

// readJSON: body maksimal 64 KB dan wajib Content-Type application/json (body kosong tanpa Content-Type boleh).
// browserGuard sudah membalas 415 lebih dulu untuk endpoint bersesi; di sini pengaman lapis kedua.
func readJSON(r *http.Request, v any) error {
	if !hasJSONBody(r) {
		return errNotJSON
	}
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

// Flush meneruskan ke writer asli supaya SSE tetap jalan di balik statusWriter.
func (s *statusWriter) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t := time.Now()
		sw := &statusWriter{ResponseWriter: w, code: 200}
		next.ServeHTTP(sw, r)
		if strings.HasPrefix(r.URL.Path, "/log") || r.URL.Path == "/chat/poll" || r.URL.Path == "/healthz" || r.URL.Path == "/readyz" || r.URL.Path == "/metrics" {
			return // polling, jangan banjiri log
		}
		slog.Info("req", "m", r.Method, "path", r.URL.Path, "code", sw.code, "ms", time.Since(t).Milliseconds(), "rid", reqID(r))
	})
}

// trunc: potong ke n karakter (rune, bukan byte) supaya UTF-8 tidak rusak di tengah.
func trunc(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	i := 0
	for pos := range s {
		if i == n {
			return strings.TrimSpace(s[:pos])
		}
		i++
	}
	return s
}

// router memasang semua endpoint; dipakai main dan tes integrasi.
func (app *App) router() *http.ServeMux {
	mux := http.NewServeMux()
	if env("DOCS", "1") != "0" {
		mux.HandleFunc("GET /openapi.yaml", app.openapi)
		mux.HandleFunc("GET /docs", app.swaggerUI)
	}
	mux.HandleFunc("GET /healthz", healthz)
	mux.HandleFunc("GET /readyz", app.readyz)
	mux.HandleFunc("GET /metrics", app.metrics)

	// auth (tanpa sesi). POST dari browser tetap dicek Origin/Sec-Fetch-Site dan Content-Type JSON (login CSRF).
	pub := func(h http.HandlerFunc) http.Handler { return browserGuard(h) }
	mux.Handle("POST /auth/register", pub(app.register))
	mux.Handle("POST /auth/login", pub(app.login))
	mux.Handle("POST /auth/guest", pub(app.guest))
	mux.Handle("POST /auth/logout", csrfGuard(http.HandlerFunc(app.logout))) // dipanggil lewat form HTML, body bukan JSON
	mux.Handle("POST /auth/forgot", pub(app.forgot))
	mux.Handle("POST /auth/reset", pub(app.resetPassword))
	mux.HandleFunc("GET /auth/verify", app.verifyEmail)
	mux.HandleFunc("GET /auth/invite", app.inviteInfo)
	mux.HandleFunc("GET /billing/plans", app.listPlans)
	mux.HandleFunc("POST /billing/webhook/xendit", app.xenditWebhook) // server ke server, dijaga token

	// butuh sesi
	auth := app.requireSession
	verified := app.requireVerified
	mux.Handle("GET /auth/me", auth(app.me))
	mux.Handle("POST /auth/switch-org", auth(app.switchOrg))
	mux.Handle("POST /auth/delete-account", auth(app.deleteAccount))
	mux.Handle("GET /org", auth(app.orgInfo))
	mux.Handle("POST /org/invite", auth(app.requireRole("admin", verified(app.orgInviteEmail))))
	mux.Handle("POST /org/remove-member", auth(app.requireRole("admin", app.removeMember)))
	mux.Handle("GET /org/api-keys", auth(app.requireRole("admin", app.listAPIKeys)))
	mux.Handle("POST /org/api-keys", auth(app.requireRole("admin", verified(app.createAPIKey))))
	mux.Handle("POST /org/api-keys/revoke", auth(app.requireRole("admin", app.revokeAPIKey)))
	mux.Handle("POST /auth/accept-invite", auth(app.acceptInvite))
	mux.Handle("POST /auth/resend-verify", auth(app.resendVerify))
	mux.Handle("POST /auth/change-password", auth(app.changePassword))
	mux.Handle("POST /auth/logout-all", auth(app.logoutAll))                     // cabut semua sesi (keluar semua perangkat)
	mux.Handle("GET /org/export", auth(app.requireRole("admin", app.orgExport))) // seluruh data org sebagai JSON
	mux.Handle("POST /auth/claim-guest", auth(app.claimGuest))
	mux.Handle("POST /billing/checkout", auth(verified(app.checkout)))
	mux.Handle("GET /billing/invoices", auth(app.listInvoices))
	mux.Handle("GET /org/settings", auth(app.getSettings))
	// saluran notifikasi keluar (email, Telegram, webhook) hanya untuk email terverifikasi
	mux.Handle("POST /org/settings", auth(app.requireRole("admin",
		app.requireVerifiedFields(app.putSettings, "notify_email", "telegram_chat", "webhook_url", "webhook_secret"))))

	mux.Handle("GET /market/reports", auth(app.listReports))
	mux.Handle("GET /market/report", auth(app.getReport))
	// endpoint yang membuat job dibatasi per org, bukan hanya per IP
	jobLimit := newLimiter(envInt("JOB_RATE_LIMIT_PER_MINUTE", 10), envInt("JOB_RATE_LIMIT_BURST", 5))
	analyst := func(h http.HandlerFunc) http.HandlerFunc { return app.requireRole("analyst", h) }
	mux.Handle("POST /market/run", auth(analyst(app.rateLimitOrg(jobLimit, app.runMarket))))
	mux.Handle("POST /market/compare/run", auth(analyst(app.rateLimitOrg(jobLimit, app.runCompare))))
	mux.Handle("GET /market/compare", auth(app.getCompare))
	mux.Handle("GET /market/watches", auth(app.listWatches))
	mux.Handle("POST /market/watch", auth(analyst(app.setWatch)))
	mux.Handle("POST /market/lead", auth(analyst(app.setLead)))
	mux.Handle("POST /market/detail", auth(analyst(app.rateLimitOrg(jobLimit, app.detail))))
	mux.Handle("GET /prospects/data", auth(app.prospects))
	mux.Handle("GET /watch/data", auth(app.watchData))
	// kampanye outreach (turn research into client)
	mux.Handle("GET /campaigns", auth(app.listCampaigns))
	mux.Handle("POST /campaigns", auth(analyst(app.createCampaign)))
	mux.Handle("POST /campaigns/preview", auth(app.previewCampaign))
	mux.Handle("GET /campaigns/{id}", auth(app.getCampaign))
	mux.Handle("POST /campaigns/{id}/start", auth(analyst(app.startCampaign)))
	mux.Handle("POST /campaigns/{id}/pause", auth(analyst(app.pauseCampaign)))
	mux.Handle("GET /campaigns/{id}/next", auth(app.nextRecipient))
	mux.Handle("POST /campaigns/{id}/mark", auth(analyst(app.markRecipient)))
	mux.Handle("GET /org/sender", auth(app.getSender))
	mux.Handle("POST /org/sender", auth(app.requireRole("admin", app.putSender)))
	mux.HandleFunc("GET /u/{token}", app.unsubscribe)
	mux.HandleFunc("GET /audit/{token}", app.auditPublic)
	mux.HandleFunc("GET /logo/{key}", app.logoImage)
	// peringkat publik (skor terbuka), lencana, dan penghitung tampilan: tanpa sesi
	mux.HandleFunc("GET /rank", app.rankPublic)
	mux.HandleFunc("GET /rank/pairs", app.rankPairs)
	mux.HandleFunc("POST /rank/report", app.rankReport) // laporan "data keliru" dari halaman publik, dibatasi per IP
	mux.HandleFunc("GET /badge/{industry}/{area}/{key}", app.badgeSVG)
	mux.HandleFunc("GET /stats", app.statsPublic) // angka total data terkumpul (publik, cache 60 detik)
	mux.Handle("GET /watch/alerts", auth(app.listAlerts))
	mux.Handle("POST /watch/alerts/read", auth(app.readAlerts))
	mux.Handle("GET /market/suggest", auth(app.suggest))
	mux.Handle("POST /org/webhook/test", auth(app.requireRole("admin", app.testWebhook)))
	mux.Handle("GET /log", auth(app.jobLog))
	mux.Handle("GET /log/stream", auth(app.jobLogStreamV2)) // delta dari job_logs, maksimal sseMaxPerOrg stream per org
	mux.Handle("POST /stop", auth(analyst(app.stopJob)))
	mux.Handle("GET /jobs", auth(app.listJobs))

	// fitur IG lewat job worker; wajib login dan minimal analyst (memakai kuota cek kontak)
	mux.Handle("GET /business", auth(app.igProfile))
	mux.Handle("POST /run", auth(analyst(app.rateLimitOrg(jobLimit, app.igRun))))

	// asisten (chat agent) lewat job worker kind "chat" dengan kuota chat per org (chat.go). Tamu boleh.
	mux.Handle("POST /chat/sid", auth(analyst(app.chatNewSession)))
	mux.Handle("POST /chat", auth(analyst(app.rateLimitOrg(jobLimit, app.chatSend))))
	mux.Handle("GET /chat/poll", auth(app.chatPoll))
	mux.Handle("POST /chat/stop", auth(analyst(app.chatStop)))
	mux.Handle("GET /chat/sessions", auth(app.chatSessions))
	mux.Handle("GET /chat/messages", auth(app.chatMessages))
	mux.Handle("POST /chat/sessions/delete", auth(analyst(app.chatDeleteSession)))
	mux.Handle("GET /chat/suggestions", auth(analyst(app.chatSuggestions)))

	return mux
}
