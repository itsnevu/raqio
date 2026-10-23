// outbox.go: pengiriman webhook lewat tabel webhook_outbox.
//
// a.webhook() hanya menyisipkan baris (cepat, di dalam transaksi pemanggil bila perlu). outboxLoop tiap 10 detik
// mengambil batch 20 dengan FOR UPDATE SKIP LOCKED (aman multi replika), mengirim satu kali per putaran lewat
// safeHTTPClient (anti SSRF), lalu menjadwalkan ulang dengan backoff 1m, 5m, 30m, 2j, 12j sampai 6 percobaan.
package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"
)

const outboxMaxAttempts = 6

// outboxBackoff: jeda sebelum percobaan ke-(i+2); percobaan pertama langsung. Harus sinkron dengan CASE di claim SQL.
var outboxBackoff = []time.Duration{time.Minute, 5 * time.Minute, 30 * time.Minute, 2 * time.Hour, 12 * time.Hour}

// webhookIn: antrekan event untuk org kalau org punya webhook_url. q boleh transaksi pemanggil.
func webhookIn(ctx context.Context, q querier, org, event string, data map[string]any) error {
	payload := map[string]any{"event": event, "org_id": org, "at": time.Now().UTC().Format(time.RFC3339), "data": data}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx, `INSERT INTO webhook_outbox (org_id, event, payload)
		SELECT $1, $2, $3::jsonb FROM org_settings WHERE org_id=$1 AND webhook_url <> ''`, org, event, body)
	return err
}

// webhook: antrekan event (tidak mengirim langsung). Dipakai notifyAlert.
func (a *App) webhook(org, event string, data map[string]any) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := webhookIn(ctx, a.db, org, event, data); err != nil {
		logDB("webhook", "insert outbox", err)
	}
}

func signBody(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

// deliverOnce: satu POST JSON bertanda tangan HMAC-SHA256 (X-Raqio-Signature). Sukses bila status < 300.
func deliverOnce(ctx context.Context, cl *http.Client, target, secret, event string, body []byte) error {
	req, err := http.NewRequestWithContext(ctx, "POST", target, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "raqio-webhook/1")
	req.Header.Set("X-Raqio-Event", event)
	req.Header.Set("X-Raqio-Signature", signBody(secret, body))
	resp, err := cl.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	return nil
}

// outboxLoop: tiap 10 detik satu putaran, hanya replika pemegang advisory lock.
func (a *App) outboxLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(10 * time.Second):
		}
		if release, ok := a.tryLock(ctx, lockOutbox); ok {
			a.processOutbox(ctx)
			release()
		}
	}
}

type outboxRow struct {
	id       int64
	org      string
	event    string
	payload  []byte
	attempts int
}

// claimOutbox: ambil batch yang jatuh tempo, naikkan attempts dan jadwalkan ulang di saat yang sama. Kalau proses mati
// di tengah pengiriman, baris tetap dicoba lagi sesuai backoff; tidak ada yang hilang dan tidak ada yang dikirim ganda
// oleh replika lain selagi jeda belum lewat.
func (a *App) claimOutbox(ctx context.Context, limit int) ([]outboxRow, error) {
	rows, err := a.db.Query(ctx, `UPDATE webhook_outbox o SET attempts = o.attempts + 1,
		next_at = now() + CASE o.attempts WHEN 0 THEN interval '1 minute' WHEN 1 THEN interval '5 minutes'
		                                  WHEN 2 THEN interval '30 minutes' WHEN 3 THEN interval '2 hours' ELSE interval '12 hours' END
		WHERE o.id IN (SELECT id FROM webhook_outbox WHERE delivered_at IS NULL AND next_at <= now() AND attempts < $1
		               ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED)
		RETURNING o.id, o.org_id, o.event, o.payload, o.attempts`, outboxMaxAttempts, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []outboxRow
	for rows.Next() {
		var r outboxRow
		if err := rows.Scan(&r.id, &r.org, &r.event, &r.payload, &r.attempts); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// processOutbox: satu putaran pengiriman. Mengembalikan jumlah terkirim dan gagal. Dipanggil juga oleh tes.
func (a *App) processOutbox(ctx context.Context) (delivered, failed int) {
	batch, err := a.claimOutbox(ctx, 20)
	if err != nil {
		logDB("outbox", "claim", err)
		return 0, 0
	}
	if len(batch) == 0 {
		return 0, 0
	}
	cl := safeHTTPClient(10 * time.Second)
	cfgs := map[string]notifyCfg{}
	for _, r := range batch {
		cfg, ok := cfgs[r.org]
		if !ok {
			cfg = a.notifyCfgOf(ctx, r.org)
			cfgs[r.org] = cfg
		}
		if cfg.WebhookURL == "" {
			a.execLog(ctx, `UPDATE webhook_outbox SET delivered_at=now(), last_error='dilewati: webhook_url kosong' WHERE id=$1`, r.id)
			continue
		}
		dctx, cancel := context.WithTimeout(ctx, 12*time.Second)
		err := deliverOnce(dctx, cl, cfg.WebhookURL, cfg.WebhookSecret, r.event, r.payload)
		cancel()
		if err == nil {
			a.execLog(ctx, `UPDATE webhook_outbox SET delivered_at=now(), last_error=NULL WHERE id=$1`, r.id)
			delivered++
			continue
		}
		failed++
		msg := redactErr(err)
		a.execLog(ctx, `UPDATE webhook_outbox SET last_error=$2 WHERE id=$1`, r.id, trunc(msg, 300))
		if r.attempts >= outboxMaxAttempts {
			slog.Warn("webhook menyerah", "org", r.org, "event", r.event, "attempts", r.attempts, "err", msg)
			a.opsAlert("outbox_giveup", "Webhook org menyerah setelah "+strconv.Itoa(r.attempts)+" percobaan",
				"org "+r.org+" event "+r.event+"\n"+trunc(msg, 200))
		} else {
			slog.Warn("webhook gagal, dicoba lagi", "org", r.org, "event", r.event, "attempt", r.attempts, "err", msg)
		}
	}
	return delivered, failed
}
