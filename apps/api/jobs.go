package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"
)

// ---------- paket dan kuota ----------

type Limits struct {
	Runs    int `json:"runs"`    // riset per bulan (termasuk riset ulang pantauan)
	Details int `json:"details"` // "Cek kontak" per bulan
	Watches int `json:"watches"` // wilayah yang dipantau sekaligus
	Areas   int `json:"areas"`   // maks wilayah per perbandingan
	Members int `json:"members"` // anggota tim
}

func planLimits(plan string) Limits {
	switch plan {
	case "pro":
		return Limits{Runs: 60, Details: 600, Watches: 15, Areas: 6, Members: 3}
	case "team":
		return Limits{Runs: 300, Details: 3000, Watches: 60, Areas: 8, Members: 15}
	default: // free
		return Limits{Runs: 5, Details: 30, Watches: 1, Areas: 3, Members: 1}
	}
}

func period() string { return time.Now().UTC().Format("2006-01") }

func (a *App) usageThisMonth(ctx context.Context, org string) (map[string]int, error) {
	rows, err := a.db.Query(ctx, `SELECT kind, count FROM usage WHERE org_id=$1 AND period=$2`, org, period())
	if err != nil {
		return nil, err
	}
	out := map[string]int{"market_run": 0, "market_detail": 0}
	for rows.Next() {
		var k string
		var n int
		rows.Scan(&k, &n)
		out[k] = n
	}
	return out, nil
}

// consume menaikkan meteran kalau masih di bawah kuota; n = jumlah unit (perbandingan 3 wilayah = 3 run).
func (a *App) consume(ctx context.Context, org, plan, kind string, n int) error {
	lim := planLimits(plan)
	max := map[string]int{"market_run": lim.Runs, "market_detail": lim.Details}[kind]
	var ok bool
	err := a.db.QueryRow(ctx, `
		INSERT INTO usage (org_id, period, kind, count) VALUES ($1,$2,$3,$4)
		ON CONFLICT (org_id, period, kind) DO UPDATE SET count = usage.count + $4
		WHERE usage.count + $4 <= $5
		RETURNING true`, org, period(), kind, n, max).Scan(&ok)
	if err != nil || !ok {
		return fmt.Errorf("Kuota %s paket %s bulan ini sudah habis (%d). Upgrade paket atau tunggu bulan depan.", kindLabel(kind), plan, max)
	}
	return nil
}

func kindLabel(k string) string {
	return map[string]string{"market_run": "riset", "market_detail": "cek kontak"}[k]
}

// ---------- antrian ----------

type Job struct {
	ID       int64           `json:"id"`
	Kind     string          `json:"kind"`
	Status   string          `json:"status"`
	Params   json.RawMessage `json:"params"`
	Log      string          `json:"log"`
	Result   json.RawMessage `json:"result,omitempty"`
	Error    *string         `json:"error"`
	Created  time.Time       `json:"created_at"`
	Started  *time.Time      `json:"started_at"`
	Finished *time.Time      `json:"finished_at"`
}

func (a *App) activeJob(ctx context.Context, org string) (int64, bool) {
	var id int64
	err := a.db.QueryRow(ctx, `SELECT id FROM jobs WHERE org_id=$1 AND status IN ('queued','running') ORDER BY id LIMIT 1`, org).Scan(&id)
	return id, err == nil
}

func (a *App) enqueue(ctx context.Context, org string, user *string, kind string, params any, priority int) (int64, error) {
	p, _ := json.Marshal(params)
	var id int64
	err := a.db.QueryRow(ctx, `INSERT INTO jobs (org_id, user_id, kind, params, priority) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		org, user, kind, p, priority).Scan(&id)
	return id, err
}

func (a *App) getJob(ctx context.Context, org string, id int64) (*Job, error) {
	j := &Job{}
	err := a.db.QueryRow(ctx, `SELECT id, kind, status, params, log, result, error, created_at, started_at, finished_at FROM jobs WHERE org_id=$1 AND id=$2`, org, id).
		Scan(&j.ID, &j.Kind, &j.Status, &j.Params, &j.Log, &j.Result, &j.Error, &j.Created, &j.Started, &j.Finished)
	return j, err
}

// waitJob menunggu job selesai (untuk endpoint yang frontend-nya menunggu sinkron, mis. Cek kontak).
func (a *App) waitJob(ctx context.Context, org string, id int64, max time.Duration) (*Job, error) {
	deadline := time.Now().Add(max)
	for {
		j, err := a.getJob(ctx, org, id)
		if err != nil {
			return nil, err
		}
		if j.Status == "done" || j.Status == "failed" || j.Status == "cancelled" {
			return j, nil
		}
		if time.Now().After(deadline) {
			return j, fmt.Errorf("timeout")
		}
		select {
		case <-ctx.Done():
			return j, ctx.Err()
		case <-time.After(700 * time.Millisecond):
		}
	}
}

// scheduler: riset ulang wilayah yang dipantau, satu job per org per putaran, prioritas rendah.
// Juga menangani job 'running' yang worker-nya mati (heartbeat > 10 menit): antrikan ulang selama attempts < max_attempts, sisanya failed.
func (a *App) scheduler(ctx context.Context) {
	for {
		time.Sleep(5 * time.Minute)
		a.expirePlans(ctx)
		a.db.Exec(ctx, `UPDATE jobs SET status='queued', error='worker tidak merespons', run_after=now()
			WHERE status='running' AND heartbeat_at < now() - interval '10 minutes' AND attempts < max_attempts`)
		a.db.Exec(ctx, `UPDATE jobs SET status='failed', error='worker tidak merespons', finished_at=now()
			WHERE status='running' AND heartbeat_at < now() - interval '10 minutes'`)
		rows, err := a.db.Query(ctx, `
			SELECT w.org_id, w.industry, w.area, o.plan FROM watches w JOIN orgs o ON o.id=w.org_id
			WHERE (w.last_run IS NULL OR w.last_run < now() - (w.every_days || ' days')::interval)
			  AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.org_id=w.org_id AND j.status IN ('queued','running'))
			ORDER BY w.last_run NULLS FIRST`)
		if err != nil {
			continue
		}
		seen := map[string]bool{}
		type row struct{ org, ind, area, plan string }
		var todo []row
		for rows.Next() {
			var r row
			rows.Scan(&r.org, &r.ind, &r.area, &r.plan)
			if !seen[r.org] {
				seen[r.org] = true
				todo = append(todo, r)
			}
		}
		rows.Close()
		for _, r := range todo {
			if err := a.consume(ctx, r.org, r.plan, "market_run", 1); err != nil {
				continue // kuota habis: lewati bulan ini
			}
			// tandai dulu supaya tidak dijadwalkan ulang kalau job gagal
			a.db.Exec(ctx, `UPDATE watches SET last_run=now() WHERE org_id=$1 AND lower(industry)=lower($2) AND lower(area)=lower($3)`, r.org, r.ind, r.area)
			if _, err := a.enqueue(ctx, r.org, nil, "market_run", map[string]any{"industry": r.ind, "area": r.area, "watch": true}, 10); err == nil {
				slog.Info("pantau: riset ulang dijadwalkan", "org", r.org, "industry", r.ind, "area", r.area)
			}
		}
	}
}

// retentionLoop: hapus laporan dan job lama (UU PDP: batasi penyimpanan data kontak bisnis).
func (a *App) retentionLoop(ctx context.Context) {
	for {
		days := int(a.retention.Hours() / 24)
		a.db.Exec(ctx, `DELETE FROM reports WHERE created_at < now() - ($1 || ' days')::interval`, fmt.Sprint(days))
		a.db.Exec(ctx, `DELETE FROM jobs WHERE finished_at < now() - interval '30 days'`)
		a.db.Exec(ctx, `DELETE FROM sessions WHERE expires_at < now()`)
		time.Sleep(6 * time.Hour)
	}
}
