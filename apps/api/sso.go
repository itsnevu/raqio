package main

// SSO antar-produk dengan tiket sekali pakai (pola authorization code). Cookie sesi Raqio tidak pernah dibagikan
// ke host lain; yang dibawa browser hanya tiket acak berumur 60 detik yang ditukar server-ke-server.
//
//  1. POST /auth/sso/ticket {product}       (bersesi; dipanggil server aplikasi scraping di /go/<produk>)
//     → hanya untuk akun non-tamu, email terverifikasi, dan org yang memegang produk itu.
//  2. Browser diarahkan ke produk tujuan (mis. WA-Suite /api/sso/raqio?ticket=...).
//  3. POST /auth/sso/redeem {ticket, product} dengan header Authorization: Bearer <SSO_SECRET>
//     (server WA-Suite) → tiket ditandai terpakai secara atomik, profil dikembalikan.
//
// SSO_SECRET kosong = penukaran tiket mati (404). Rahasia dibandingkan waktu-konstan.

import (
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const ssoTicketTTL = 60 * time.Second

// penukaran dibatasi per IP: 120 per menit, ledakan 30 (server tujuan yang wajar jauh di bawah ini)
var ssoRedeemLimit = newLimiterRate(2, 30)

func (a *App) issueSSOTicket(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct{ Product string }
	if err := readJSON(r, &in); err != nil || !knownProduct(in.Product) || in.Product == productScraping {
		errJSON(w, 400, "Produk tidak valid.")
		return
	}
	if s.isAPIKey() || s.Guest {
		errCode(w, 403, "account_required", "Masuk dengan akun Raqio (bukan sesi tamu) untuk membuka produk ini.")
		return
	}
	ok, err := a.hasProduct(r.Context(), s.OrgID, in.Product)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	if !ok {
		errCode(w, 403, "product_required", "Akun ini belum memiliki "+productNames[in.Product]+".")
		return
	}
	// hak produk dicek lebih dulu: akun tanpa produk tidak perlu disuruh verifikasi email
	if !s.Verified {
		errCode(w, 403, "verify_required", "Verifikasi email akun Raqio dulu untuk membuka produk ini.")
		return
	}
	raw := newRawToken()
	ctx := r.Context()
	a.db.Exec(ctx, `DELETE FROM sso_tickets WHERE expires_at < now() - interval '1 day'`) // bersih-bersih ringan
	if _, err := a.db.Exec(ctx, `INSERT INTO sso_tickets (hash, user_id, org_id, product, expires_at) VALUES ($1,$2,$3,$4,$5)`,
		hashToken(raw), s.UserID, s.OrgID, in.Product, time.Now().Add(ssoTicketTTL)); err != nil {
		errJSON(w, 500, "db")
		return
	}
	writeJSON(w, 200, map[string]any{"ticket": raw, "expires_in": int(ssoTicketTTL.Seconds())})
}

func (a *App) redeemSSOTicket(w http.ResponseWriter, r *http.Request) {
	secret := env("SSO_SECRET", "")
	if secret == "" {
		http.NotFound(w, r)
		return
	}
	if !ssoRedeemLimit.allow(clientIP(r)) {
		errJSON(w, 429, "Terlalu banyak permintaan.")
		return
	}
	got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if subtle.ConstantTimeCompare([]byte(got), []byte(secret)) != 1 {
		errJSON(w, 401, "Rahasia SSO tidak cocok.")
		return
	}
	var in struct{ Ticket, Product string }
	if err := readJSON(r, &in); err != nil || in.Ticket == "" || !knownProduct(in.Product) {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	ctx := r.Context()
	var uid, oid string
	err := a.db.QueryRow(ctx, `UPDATE sso_tickets SET used_at=now()
		WHERE hash=$1 AND product=$2 AND used_at IS NULL AND expires_at > now() RETURNING user_id, org_id`,
		hashToken(in.Ticket), in.Product).Scan(&uid, &oid)
	if errors.Is(err, pgx.ErrNoRows) {
		errCode(w, 401, "ticket_invalid", "Tiket SSO tidak valid, sudah dipakai, atau kedaluwarsa.")
		return
	}
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	// cek ulang saat ditukar: akun dihapus, produk dicabut, atau keanggotaan hilang dalam 60 detik tetap ditolak
	var email, orgName, role, plan string
	var verified bool
	err = a.db.QueryRow(ctx, `SELECT u.email, u.email_verified_at IS NOT NULL, o.name, m.role, o.plan
		FROM users u JOIN memberships m ON m.user_id=u.id AND m.org_id=$2 JOIN orgs o ON o.id=m.org_id
		WHERE u.id=$1 AND u.deleted_at IS NULL`, uid, oid).Scan(&email, &verified, &orgName, &role, &plan)
	if err != nil {
		errCode(w, 401, "ticket_invalid", "Akun untuk tiket ini tidak lagi tersedia.")
		return
	}
	products := a.orgProducts(ctx, oid)
	has := false
	for _, p := range products {
		has = has || p == in.Product
	}
	if !has {
		errCode(w, 403, "product_required", "Akun ini belum memiliki "+productNames[in.Product]+".")
		return
	}
	writeJSON(w, 200, map[string]any{"email": email, "verified": verified, "guest": plan == "guest",
		"org_id": oid, "org_name": orgName, "role": role, "products": products})
}
