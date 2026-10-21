package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// Paket berbayar. Harga rupiah per 30 hari. Pembayaran lewat Xendit Invoice (transfer bank, e-wallet, QRIS, kartu).
// Tanpa XENDIT_SECRET_KEY: mode manual, user diberi instruksi menghubungi pengelola dan pengelola set paket lewat DB.

type Plan struct {
	Name  string `json:"name"`
	Price int64  `json:"price"`
	Limits
}

func plans() []Plan {
	return []Plan{
		{"free", 0, planLimits("free")},
		{"pro", 149000, planLimits("pro")},
		{"team", 499000, planLimits("team")},
	}
}

func planPrice(name string) (int64, bool) {
	for _, p := range plans() {
		if p.Name == name && p.Price > 0 {
			return p.Price, true
		}
	}
	return 0, false
}

func (a *App) listPlans(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"plans": plans(), "provider": a.billingProvider()})
}

func (a *App) billingProvider() string {
	if env("XENDIT_SECRET_KEY", "") != "" {
		return "xendit"
	}
	return "manual"
}

func (a *App) checkout(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if s.Role != "owner" {
		errJSON(w, 403, "Hanya owner yang bisa upgrade paket.")
		return
	}
	var in struct{ Plan string }
	readJSON(r, &in)
	price, ok := planPrice(in.Plan)
	if !ok {
		errJSON(w, 400, "Paket tidak dikenal.")
		return
	}
	ctx := r.Context()
	if a.billingProvider() == "manual" {
		var id int64
		a.db.QueryRow(ctx, `INSERT INTO invoices (org_id, provider, plan, amount, status) VALUES ($1,'manual',$2,$3,'pending') RETURNING id`, s.OrgID, in.Plan, price).Scan(&id)
		writeJSON(w, 200, map[string]any{"ok": true, "provider": "manual", "invoice": id,
			"message": fmt.Sprintf("Pembayaran otomatis belum aktif. Transfer Rp%d lalu kirim bukti ke pengelola dengan nomor tagihan #%d. Paket diaktifkan manual.", price, id)})
		return
	}
	ext := fmt.Sprintf("raqio-%s-%d", s.OrgID[:8], time.Now().Unix())
	var invID int64
	a.db.QueryRow(ctx, `INSERT INTO invoices (org_id, provider, external_id, plan, amount, status) VALUES ($1,'xendit',$2,$3,$4,'pending') RETURNING id`,
		s.OrgID, ext, in.Plan, price).Scan(&invID)
	body, _ := json.Marshal(map[string]any{
		"external_id": ext, "amount": price, "payer_email": s.Email,
		"description":          fmt.Sprintf("Raqio paket %s, 30 hari", in.Plan),
		"success_redirect_url": a.appURL("/settings?paid=1"),
		"failure_redirect_url": a.appURL("/settings?paid=0"),
		"currency":             "IDR", "invoice_duration": 86400,
	})
	req, _ := http.NewRequestWithContext(ctx, "POST", "https://api.xendit.co/v2/invoices", bytes.NewReader(body))
	req.SetBasicAuth(env("XENDIT_SECRET_KEY", ""), "")
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		errJSON(w, 502, "Gateway pembayaran tidak bisa dihubungi.")
		return
	}
	defer resp.Body.Close()
	var out struct {
		ID         string `json:"id"`
		InvoiceURL string `json:"invoice_url"`
		Message    string `json:"message"`
	}
	json.NewDecoder(resp.Body).Decode(&out)
	if resp.StatusCode >= 300 || out.InvoiceURL == "" {
		slog.Error("xendit", "status", resp.StatusCode, "msg", out.Message)
		a.db.Exec(ctx, `UPDATE invoices SET status='failed' WHERE id=$1`, invID)
		errJSON(w, 502, "Gagal membuat tagihan: "+out.Message)
		return
	}
	a.db.Exec(ctx, `UPDATE invoices SET url=$2, external_id=$3 WHERE id=$1`, invID, out.InvoiceURL, ext)
	writeJSON(w, 200, map[string]any{"ok": true, "provider": "xendit", "url": out.InvoiceURL})
}

// xenditWebhook: Xendit memanggil ini saat invoice dibayar. Dicek lewat header x-callback-token.
func (a *App) xenditWebhook(w http.ResponseWriter, r *http.Request) {
	if tok := env("XENDIT_CALLBACK_TOKEN", ""); tok == "" || r.Header.Get("x-callback-token") != tok {
		errJSON(w, 401, "token salah")
		return
	}
	var in struct {
		ExternalID string `json:"external_id"`
		Status     string `json:"status"`
		PaidAmount int64  `json:"paid_amount"`
	}
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "bad json")
		return
	}
	ctx := r.Context()
	switch in.Status {
	case "PAID", "SETTLED":
		a.activateInvoice(ctx, in.ExternalID, in.PaidAmount)
	case "EXPIRED":
		a.db.Exec(ctx, `UPDATE invoices SET status='expired' WHERE external_id=$1 AND status='pending'`, in.ExternalID)
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) activateInvoice(ctx context.Context, externalID string, paid int64) {
	var id, org, plan string
	var amount int64
	err := a.db.QueryRow(ctx, `SELECT id, org_id, plan, amount FROM invoices WHERE external_id=$1 AND status='pending'`, externalID).Scan(&id, &org, &plan, &amount)
	if err != nil || paid < amount {
		return
	}
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)
	tx.Exec(ctx, `UPDATE invoices SET status='paid', paid_at=now() WHERE id=$1`, id)
	// perpanjang dari plan_until kalau masih aktif, kalau tidak dari sekarang
	tx.Exec(ctx, `UPDATE orgs SET plan=$2, plan_until = GREATEST(coalesce(plan_until, now()), now()) + interval '30 days' WHERE id=$1`, org, plan)
	tx.Commit(ctx)
	slog.Info("paket aktif", "org", org, "plan", plan)
}

// expirePlans: turunkan ke free kalau masa paket habis. Dipanggil scheduler.
func (a *App) expirePlans(ctx context.Context) {
	a.db.Exec(ctx, `UPDATE orgs SET plan='free', plan_until=NULL WHERE plan<>'free' AND plan_until IS NOT NULL AND plan_until < now()`)
}

func (a *App) listInvoices(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	rows, _ := a.db.Query(r.Context(), `SELECT id, provider, plan, amount, status, coalesce(url,''), created_at FROM invoices WHERE org_id=$1 ORDER BY id DESC LIMIT 20`, s.OrgID)
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var prov, plan, status, url string
		var amount int64
		var t time.Time
		rows.Scan(&id, &prov, &plan, &amount, &status, &url, &t)
		out = append(out, map[string]any{"id": id, "provider": prov, "plan": plan, "amount": amount, "status": status, "url": url, "created": t.UTC().Format(time.RFC3339)})
	}
	var until *time.Time
	a.db.QueryRow(r.Context(), `SELECT plan_until FROM orgs WHERE id=$1`, s.OrgID).Scan(&until)
	writeJSON(w, 200, map[string]any{"invoices": out, "plan": s.Plan, "plan_until": until})
}
