package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
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
	if s.Guest {
		errJSON(w, 403, "Daftar dulu (simpan akun tamu) sebelum upgrade paket.")
		return
	}
	var in struct{ Plan string }
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	price, ok := planPrice(in.Plan)
	if !ok {
		errJSON(w, 400, "Paket tidak dikenal.")
		return
	}
	ctx := r.Context()
	if a.billingProvider() == "manual" {
		var id int64
		if err := a.db.QueryRow(ctx, `INSERT INTO invoices (org_id, provider, plan, amount, status) VALUES ($1,'manual',$2,$3,'pending') RETURNING id`, s.OrgID, in.Plan, price).Scan(&id); err != nil {
			slog.Error("invoice manual", "err", err)
			errJSON(w, 500, "db")
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "provider": "manual", "invoice": id,
			"message": fmt.Sprintf("Pembayaran otomatis belum aktif. Transfer Rp%d lalu kirim bukti ke pengelola dengan nomor tagihan #%d. Paket diaktifkan manual.", price, id)})
		return
	}
	// external_id acak: dua checkout di detik yang sama tidak bentrok, dan id tidak bisa ditebak
	rb := make([]byte, 8)
	rand.Read(rb)
	ext := fmt.Sprintf("raqio-%s-%s", s.OrgID[:8], hex.EncodeToString(rb))
	var invID int64
	if err := a.db.QueryRow(ctx, `INSERT INTO invoices (org_id, provider, external_id, plan, amount, status) VALUES ($1,'xendit',$2,$3,$4,'pending') RETURNING id`,
		s.OrgID, ext, in.Plan, price).Scan(&invID); err != nil {
		slog.Error("invoice xendit", "err", err)
		errJSON(w, 500, "db")
		return
	}
	body, _ := json.Marshal(map[string]any{
		"external_id": ext, "amount": price, "payer_email": s.Email,
		"description":          fmt.Sprintf("Raqio paket %s, 30 hari", in.Plan),
		"success_redirect_url": a.appURL("/settings?paid=1"),
		"failure_redirect_url": a.appURL("/settings?paid=0"),
		"currency":             "IDR", "invoice_duration": 86400,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.xendit.co/v2/invoices", bytes.NewReader(body))
	if err != nil {
		errJSON(w, 500, "request")
		return
	}
	req.SetBasicAuth(env("XENDIT_SECRET_KEY", ""), "")
	req.Header.Set("Content-Type", "application/json")
	cl := &http.Client{Timeout: 15 * time.Second}
	resp, err := cl.Do(req)
	if err != nil {
		slog.Error("xendit", "err", redactErr(err))
		a.db.Exec(ctx, `UPDATE invoices SET status='failed' WHERE id=$1`, invID)
		errJSON(w, 502, "Gateway pembayaran tidak bisa dihubungi.")
		return
	}
	defer resp.Body.Close()
	var out struct {
		ID         string `json:"id"`
		InvoiceURL string `json:"invoice_url"`
		Message    string `json:"message"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, resp.Body, 1<<20)).Decode(&out); err != nil {
		slog.Error("xendit decode", "err", err)
	}
	if resp.StatusCode >= 300 || out.InvoiceURL == "" {
		slog.Error("xendit", "status", resp.StatusCode, "msg", out.Message)
		a.db.Exec(ctx, `UPDATE invoices SET status='failed' WHERE id=$1`, invID)
		errJSON(w, 502, "Gagal membuat tagihan di gateway pembayaran.")
		return
	}
	if _, err := a.db.Exec(ctx, `UPDATE invoices SET url=$2 WHERE id=$1`, invID, out.InvoiceURL); err != nil {
		slog.Error("invoice url", "err", err)
	}
	writeJSON(w, 200, map[string]any{"ok": true, "provider": "xendit", "url": out.InvoiceURL})
}

// xenditWebhook: Xendit memanggil ini saat invoice dibayar. Dicek lewat header x-callback-token (constant-time).
func (a *App) xenditWebhook(w http.ResponseWriter, r *http.Request) {
	tok := env("XENDIT_CALLBACK_TOKEN", "")
	if tok == "" || subtle.ConstantTimeCompare([]byte(r.Header.Get("x-callback-token")), []byte(tok)) != 1 {
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
		if err := a.activateInvoice(ctx, in.ExternalID, in.PaidAmount); err != nil {
			slog.Error("aktivasi invoice", "external_id", in.ExternalID, "err", err)
			errJSON(w, 500, "db")
			return
		}
	case "EXPIRED":
		if _, err := a.db.Exec(ctx, `UPDATE invoices SET status='expired' WHERE external_id=$1 AND status='pending'`, in.ExternalID); err != nil {
			errJSON(w, 500, "db")
			return
		}
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// activateInvoice: idempoten. Hanya invoice yang masih 'pending' dan dibayar penuh yang mengaktifkan paket;
// callback ganda tidak memperpanjang dua kali. Satu transaksi: tanda bayar + perpanjang paket.
func (a *App) activateInvoice(ctx context.Context, externalID string, paid int64) error {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var org, plan string
	var amount int64
	err = tx.QueryRow(ctx, `UPDATE invoices SET status='paid', paid_at=now()
		WHERE external_id=$1 AND status='pending' AND amount <= $2
		RETURNING org_id, plan, amount`, externalID, paid).Scan(&org, &plan, &amount)
	if err != nil {
		// tidak ada invoice pending yang cocok (sudah diproses, kedaluwarsa, atau bayar kurang): bukan error
		slog.Info("invoice tidak diaktifkan", "external_id", externalID, "paid", paid)
		return nil
	}
	// perpanjang dari plan_until kalau masih aktif, kalau tidak dari sekarang; penanda peringatan di-reset
	if _, err := tx.Exec(ctx, `UPDATE orgs SET plan=$2, plan_until = GREATEST(coalesce(plan_until, now()), now()) + interval '30 days', expiry_warned_at=NULL WHERE id=$1`, org, plan); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	slog.Info("paket aktif", "org", org, "plan", plan, "amount", amount)
	return nil
}

// expirePlans: turunkan ke free kalau masa paket habis, lalu beri tahu org lewat salurannya (tidak lagi diam-diam).
// Dipanggil scheduler.
func (a *App) expirePlans(ctx context.Context) {
	rows, err := a.db.Query(ctx, `WITH habis AS (
			SELECT id, plan FROM orgs WHERE plan NOT IN ('free','guest') AND plan_until IS NOT NULL AND plan_until < now() FOR UPDATE SKIP LOCKED)
		UPDATE orgs o SET plan='free', plan_until=NULL, expiry_warned_at=NULL FROM habis WHERE o.id=habis.id RETURNING habis.id, habis.plan`)
	if err != nil {
		slog.Warn("expire plans", "err", err)
		return
	}
	type row struct{ org, plan string }
	var list []row
	for rows.Next() {
		var x row
		if rows.Scan(&x.org, &x.plan) == nil {
			list = append(list, x)
		}
	}
	rows.Close()
	for _, x := range list {
		link := a.appURL("/settings")
		body := fmt.Sprintf("Masa paket %s sudah berakhir, akun kembali ke paket Free (kuota lebih kecil).\nPerpanjang kapan saja: %s", x.plan, link)
		a.notifyOrgChannels(ctx, x.org, a.notifyCfgOf(ctx, x.org), "Raqio: paket "+x.plan+" berakhir",
			body, "<b>Raqio</b>\nPaket "+htmlEsc(x.plan)+" berakhir, akun kembali ke Free.\n"+link)
		slog.Info("paket berakhir", "org", x.org, "plan", x.plan)
	}
}

// warnExpiringPlans: peringatan H-3 sebelum masa paket habis, sekali per periode. Penanda expiry_warned_at
// relatif terhadap plan_until (dan di-reset saat perpanjangan), jadi periode berikutnya otomatis diperingatkan
// lagi. Dipanggil scheduler.
func (a *App) warnExpiringPlans(ctx context.Context) {
	rows, err := a.db.Query(ctx, `UPDATE orgs SET expiry_warned_at=now()
		WHERE plan NOT IN ('free','guest') AND plan_until IS NOT NULL
		  AND plan_until BETWEEN now() AND now() + interval '3 days'
		  AND (expiry_warned_at IS NULL OR expiry_warned_at < plan_until - interval '29 days')
		RETURNING id, plan, plan_until`)
	if err != nil {
		slog.Warn("warn expiring plans", "err", err)
		return
	}
	type row struct {
		org, plan string
		until     time.Time
	}
	var list []row
	for rows.Next() {
		var x row
		if rows.Scan(&x.org, &x.plan, &x.until) == nil {
			list = append(list, x)
		}
	}
	rows.Close()
	for _, x := range list {
		days := int(time.Until(x.until).Hours()/24) + 1
		link := a.appURL("/settings")
		body := fmt.Sprintf("Paket %s berakhir %s (%d hari lagi). Setelah itu akun kembali ke Free dengan kuota lebih kecil.\nPerpanjang: %s",
			x.plan, x.until.Format("2 Jan 2006"), days, link)
		a.notifyOrgChannels(ctx, x.org, a.notifyCfgOf(ctx, x.org), fmt.Sprintf("Raqio: paket %s berakhir %d hari lagi", x.plan, days),
			body, "<b>Raqio</b>\nPaket "+htmlEsc(x.plan)+" berakhir "+fmt.Sprint(days)+" hari lagi.\n"+link)
	}
}

func (a *App) listInvoices(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	rows, err := a.db.Query(r.Context(), `SELECT id, provider, plan, amount, status, coalesce(url,''), created_at FROM invoices WHERE org_id=$1 ORDER BY id DESC LIMIT 20`, s.OrgID)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var prov, plan, status, url string
		var amount int64
		var t time.Time
		if rows.Scan(&id, &prov, &plan, &amount, &status, &url, &t) == nil {
			out = append(out, map[string]any{"id": id, "provider": prov, "plan": plan, "amount": amount, "status": status, "url": url, "created": t.UTC().Format(time.RFC3339)})
		}
	}
	var until *time.Time
	a.db.QueryRow(r.Context(), `SELECT plan_until FROM orgs WHERE id=$1`, s.OrgID).Scan(&until)
	writeJSON(w, 200, map[string]any{"invoices": out, "plan": s.Plan, "plan_until": until})
}
