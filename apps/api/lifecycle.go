// lifecycle.go: email "laporan siap / riset gagal" untuk job yang selesai saat pengguna sudah meninggalkan
// halaman, dan ekspor seluruh data org (hak portabilitas data). Peringatan masa paket ada di billing.go.
package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// notifyFinishedJobs: kirim kabar lewat saluran org untuk job riset yang selesai dalam 1 jam terakhir,
// sekali per job (jobs.notified). Job lebih tua dari 1 jam ditandai lewat tanpa dikirim supaya downtime
// atau migrasi tidak memicu banjir email. Job pantauan dan riset-ulang peringkat dilewati: pantauan punya
// alur alert sendiri, riset peringkat milik operator.
func (a *App) notifyFinishedJobs(ctx context.Context) {
	a.execLog(ctx, `UPDATE jobs SET notified=true WHERE notified=false AND status IN ('done','failed','cancelled')
		AND (finished_at IS NULL OR finished_at < now() - interval '1 hour')`)
	rows, err := a.db.Query(ctx, `SELECT id, org_id, kind, status, params, coalesce(error,'') FROM jobs
		WHERE notified=false AND status IN ('done','failed') AND kind IN ('market_run','market_compare')
		  AND finished_at >= now() - interval '1 hour' ORDER BY id LIMIT 50`)
	if err != nil {
		logDB("notifyJobs", "select jobs", err)
		return
	}
	type row struct {
		id          int64
		org, kind   string
		status, err string
		params      []byte
	}
	var list []row
	for rows.Next() {
		var x row
		if rows.Scan(&x.id, &x.org, &x.kind, &x.status, &x.params, &x.err) == nil {
			list = append(list, x)
		}
	}
	rows.Close()
	for _, x := range list {
		a.execLog(ctx, `UPDATE jobs SET notified=true WHERE id=$1`, x.id)
		var p struct {
			Industry, Area string
			Areas          []string
			Watch          bool `json:"watch"`
			RankRefresh    bool `json:"rank_refresh"`
		}
		if json.Unmarshal(x.params, &p) != nil || p.Watch || p.RankRefresh {
			continue
		}
		label := p.Industry
		if p.Area != "" {
			label += " · " + p.Area
		} else if len(p.Areas) > 0 {
			label += " · " + strings.Join(p.Areas, ", ")
		}
		link := a.appURL("/market")
		if x.status == "done" && x.kind == "market_run" {
			var rid int64
			if a.db.QueryRow(ctx, `SELECT id FROM reports WHERE job_id=$1 ORDER BY id LIMIT 1`, x.id).Scan(&rid) == nil {
				link = a.appURL("/market?id=" + strconv.FormatInt(rid, 10))
			}
		}
		cfg := a.notifyCfgOf(ctx, x.org)
		if x.status == "done" {
			a.notifyOrgChannels(ctx, x.org, cfg, "Raqio: laporan siap, "+label,
				"Riset "+label+" selesai. Buka laporannya: "+link,
				"<b>Raqio</b>\nLaporan siap: "+htmlEsc(label)+"\n"+link)
		} else {
			reason := x.err
			if reason == "" {
				reason = "tidak ada keterangan dari worker"
			}
			a.notifyOrgChannels(ctx, x.org, cfg, "Raqio: riset gagal, "+label,
				"Riset "+label+" gagal: "+reason+"\nKuota dikembalikan otomatis. Coba lagi: "+link,
				"<b>Raqio</b>\nRiset gagal: "+htmlEsc(label)+"\n"+htmlEsc(reason))
		}
	}
}

// GET /org/export (admin): seluruh data org sebagai satu berkas JSON — profil org, anggota, pengaturan
// (rahasia disamarkan), pantauan, prospek, pemakaian kuota, faktur, dan semua laporan lengkap.
func (a *App) orgExport(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	ctx := r.Context()
	out := map[string]any{"exported_at": time.Now().UTC().Format(time.RFC3339), "org_id": s.OrgID}

	var name, plan string
	var until *time.Time
	if err := a.db.QueryRow(ctx, `SELECT name, plan, plan_until FROM orgs WHERE id=$1`, s.OrgID).Scan(&name, &plan, &until); err != nil {
		logDB("export", "select org", err)
		errCode(w, 500, "db_error", "Gagal membaca data, coba lagi")
		return
	}
	out["org"] = map[string]any{"name": name, "plan": plan, "plan_until": until}

	collect := func(key, q string, scan func(rows interface{ Scan(...any) error }) (map[string]any, bool)) bool {
		rows, err := a.db.Query(ctx, q, s.OrgID)
		if err != nil {
			logDB("export", key, err)
			errCode(w, 500, "db_error", "Gagal membaca data, coba lagi")
			return false
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			if m, ok := scan(rows); ok {
				items = append(items, m)
			}
		}
		out[key] = items
		return true
	}

	if !collect("members", `SELECT u.email, m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 ORDER BY u.email`,
		func(rows interface{ Scan(...any) error }) (map[string]any, bool) {
			var email, role string
			if rows.Scan(&email, &role) != nil {
				return nil, false
			}
			return map[string]any{"email": email, "role": role}, true
		}) {
		return
	}
	if !collect("watches", `SELECT industry, area, every_days, last_run FROM watches WHERE org_id=$1 ORDER BY created_at`,
		func(rows interface{ Scan(...any) error }) (map[string]any, bool) {
			var ind, area string
			var every int
			var last *time.Time
			if rows.Scan(&ind, &area, &every, &last) != nil {
				return nil, false
			}
			return map[string]any{"industry": ind, "area": area, "every_days": every, "last_run": last}, true
		}) {
		return
	}
	if !collect("leads", `SELECT key, coalesce(name,''), status, note, coalesce(to_char(remind,'YYYY-MM-DD'),''), coalesce(assignee::text,''), coalesce(features,'null'::jsonb), updated_at FROM leads WHERE org_id=$1 ORDER BY updated_at`,
		func(rows interface{ Scan(...any) error }) (map[string]any, bool) {
			var key, nm, st, note, remind, assignee string
			var feat []byte
			var up time.Time
			if rows.Scan(&key, &nm, &st, &note, &remind, &assignee, &feat, &up) != nil {
				return nil, false
			}
			return map[string]any{"key": key, "name": nm, "status": st, "note": note, "remind": remind,
				"assignee": assignee, "features": json.RawMessage(feat), "updated_at": up}, true
		}) {
		return
	}
	if !collect("usage", `SELECT period, kind, count FROM usage WHERE org_id=$1 ORDER BY period, kind`,
		func(rows interface{ Scan(...any) error }) (map[string]any, bool) {
			var per, kind string
			var n int
			if rows.Scan(&per, &kind, &n) != nil {
				return nil, false
			}
			return map[string]any{"period": per, "kind": kind, "count": n}, true
		}) {
		return
	}
	if !collect("invoices", `SELECT id, provider, plan, amount, status, created_at FROM invoices WHERE org_id=$1 ORDER BY id`,
		func(rows interface{ Scan(...any) error }) (map[string]any, bool) {
			var id, amount int64
			var prov, plan, st string
			var t time.Time
			if rows.Scan(&id, &prov, &plan, &amount, &st, &t) != nil {
				return nil, false
			}
			return map[string]any{"id": id, "provider": prov, "plan": plan, "amount": amount, "status": st, "created_at": t}, true
		}) {
		return
	}
	if !collect("reports", `SELECT id, industry, area, created_at, report FROM reports WHERE org_id=$1 ORDER BY id`,
		func(rows interface{ Scan(...any) error }) (map[string]any, bool) {
			var id int64
			var ind, area string
			var t time.Time
			var raw []byte
			if rows.Scan(&id, &ind, &area, &t, &raw) != nil {
				return nil, false
			}
			return map[string]any{"id": id, "industry": ind, "area": area, "created_at": t, "report": json.RawMessage(raw)}, true
		}) {
		return
	}
	// pengaturan: rahasia webhook disamarkan seperti di GET /org/settings
	cfg := a.notifyCfgOf(ctx, s.OrgID)
	masked := ""
	if cfg.WebhookSecret != "" {
		masked = "••••" + cfg.WebhookSecret[max(0, len(cfg.WebhookSecret)-4):]
	}
	out["settings"] = map[string]any{"notify_email": cfg.Email, "telegram_chat": cfg.Telegram, "webhook_url": cfg.WebhookURL, "webhook_secret_masked": masked}

	a.audit(r, &s.OrgID, &s.UserID, "org_export", "", 200)
	w.Header().Set("Content-Disposition", `attachment; filename="raqio-export-`+time.Now().UTC().Format("2006-01-02")+`.json"`)
	writeJSON(w, 200, out)
}
