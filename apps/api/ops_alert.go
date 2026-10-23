// ops_alert.go: alarm operasional ke pengelola, tanpa Sentry.
//
// Dikirim ke OPS_TELEGRAM_CHAT (memakai TELEGRAM_BOT_TOKEN yang sama dengan notifikasi org) dan/atau OPS_WEBHOOK_URL
// (POST JSON event "ops.alert" bertanda tangan HMAC OPS_WEBHOOK_SECRET lewat deliverOnce, anti SSRF seperti webhook
// org). Pemicu: panic tertangkap (recoverPanic), respons 5xx >= OPS_5XX_THRESHOLD dalam 5 menit (countRequests),
// job gagal final >= 5 dalam 10 menit (schedulerRound), outbox webhook menyerah (processOutbox), readyz gagal
// 3 kali berturut-turut. Jenis alarm yang sama paling banyak sekali per 10 menit. Tanpa env: hanya slog.Warn.
// Pesan tidak pernah memuat rahasia (redactString).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	opsThrottle  = 10 * time.Minute
	ops5xxWindow = 5 * time.Minute
)

type opsAlerter struct {
	mu       sync.Mutex
	last     map[string]time.Time // jenis alarm -> terakhir dikirim
	throttle time.Duration
	now      func() time.Time
	winStart time.Time // jendela 5xx berjalan
	winN     int
}

func newOpsAlerter() *opsAlerter {
	return &opsAlerter{last: map[string]time.Time{}, throttle: opsThrottle, now: time.Now}
}

// configured: ada saluran ops yang diisi.
func (o *opsAlerter) configured() bool {
	return env("OPS_TELEGRAM_CHAT", "") != "" || env("OPS_WEBHOOK_URL", "") != ""
}

// allow: true kalau jenis alarm ini belum dikirim dalam masa throttle, sekaligus mencatat waktunya.
func (o *opsAlerter) allow(kind string) bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	t := o.now()
	if last, ok := o.last[kind]; ok && t.Sub(last) < o.throttle {
		return false
	}
	o.last[kind] = t
	return true
}

func (o *opsAlerter) threshold5xx() int { return envInt("OPS_5XX_THRESHOLD", 20) }

// note5xx: catat satu respons 5xx; true tepat saat jumlah dalam jendela 5 menit mencapai ambang (sekali per jendela).
func (o *opsAlerter) note5xx() bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	t := o.now()
	if o.winStart.IsZero() || t.Sub(o.winStart) >= ops5xxWindow {
		o.winStart, o.winN = t, 0
	}
	o.winN++
	return o.winN == o.threshold5xx()
}

// opsAlert: selalu dicatat di log; dikirim ke saluran ops kalau dikonfigurasi dan tidak kena throttle.
// Pengiriman di goroutine supaya handler dan loop tidak menunggu jaringan.
func (a *App) opsAlert(kind, title, detail string) {
	title, detail = redactString(title), redactString(detail)
	slog.Warn("ops alert", "kind", kind, "title", title, "detail", trunc(detail, 300))
	if a.ops == nil || !a.ops.configured() || !a.ops.allow(kind) {
		return
	}
	go a.deliverOpsAlert(kind, title, detail)
}

// deliverOpsAlert: kirim sinkron ke Telegram ops dan webhook ops. Dipisah dari opsAlert supaya bisa diuji.
func (a *App) deliverOpsAlert(kind, title, detail string) {
	if chat := env("OPS_TELEGRAM_CHAT", ""); chat != "" {
		a.telegram(chat, "<b>Raqio ops: "+htmlEsc(title)+"</b>\n<pre>"+htmlEsc(trunc(detail, 1500))+"</pre>")
	}
	target := env("OPS_WEBHOOK_URL", "")
	if target == "" {
		return
	}
	host, _ := os.Hostname()
	payload := map[string]any{"event": "ops.alert", "at": time.Now().UTC().Format(time.RFC3339),
		"data": map[string]any{"kind": kind, "title": title, "detail": detail, "host": host, "env": env("APP_ENV", "dev")}}
	body, err := json.Marshal(payload)
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	if err := deliverOnce(ctx, safeHTTPClient(10*time.Second), target, env("OPS_WEBHOOK_SECRET", ""), "ops.alert", body); err != nil {
		slog.Warn("ops webhook gagal", "kind", kind, "err", redactErr(err))
	}
}

// checkFailedJobs: alarm kalau job gagal final >= 5 dalam 10 menit terakhir. Dipanggil schedulerRound
// (di bawah advisory lock, jadi hanya satu replika yang mengalarmkan).
func (a *App) checkFailedJobs(ctx context.Context) {
	rows, err := a.db.Query(ctx, `SELECT kind, count(*) FROM jobs WHERE status='failed' AND finished_at > now() - interval '10 minutes' GROUP BY kind ORDER BY kind`)
	if err != nil {
		logDB("opsFailedJobs", "count failed jobs", err)
		return
	}
	defer rows.Close()
	total := 0
	var parts []string
	for rows.Next() {
		var kind string
		var n int
		if rows.Scan(&kind, &n) == nil {
			total += n
			parts = append(parts, fmt.Sprintf("%s: %d", kind, n))
		}
	}
	if total >= 5 {
		a.opsAlert("jobs_failed", fmt.Sprintf("%d job gagal dalam 10 menit", total), strings.Join(parts, ", "))
	}
}
