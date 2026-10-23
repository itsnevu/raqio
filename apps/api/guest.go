// guest.go: mode tamu. Coba aplikasi tanpa daftar: org sementara dengan kuota kecil, dihapus otomatis
// setelah GUEST_TTL (default 24 jam). Tamu bisa "klaim" akunnya dengan email dan password supaya data tetap.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const guestDomain = "guest.raqio.local"

// guestLimit: token bucket 5 per jam per IP (burst 5): lima akun tamu langsung, lalu satu tiap 12 menit.
// Ditambah batas global GUEST_MAX_PER_HOUR (default 200) untuk seluruh instance supaya mode tamu tidak bisa
// dipakai membanjiri antrian worker dari banyak IP.
var guestLimit = newLimiterRate(5.0/3600, 5)
var guestGlobal = newHourCounter()

func guestMaxPerHour() int { return envInt("GUEST_MAX_PER_HOUR", 200) }

func (a *App) guestTTL() time.Duration {
	if d, err := time.ParseDuration(env("GUEST_TTL", "")); err == nil && d > 0 {
		return d
	}
	return 24 * time.Hour
}

// POST /auth/guest: buat user + org tamu lalu langsung bersesi.
func (a *App) guest(w http.ResponseWriter, r *http.Request) {
	if env("ALLOW_GUEST", "1") != "1" {
		errJSON(w, 403, "Mode tamu dimatikan.")
		return
	}
	if !guestLimit.allow(clientIP(r)) {
		errJSON(w, 429, "Terlalu banyak akun tamu dari jaringan ini, coba lagi nanti atau daftar.")
		return
	}
	if !guestGlobal.take(guestMaxPerHour()) {
		errJSON(w, 429, "Mode tamu sedang penuh, coba lagi nanti atau daftar.")
		return
	}
	b := make([]byte, 6)
	rand.Read(b)
	tag := hex.EncodeToString(b)
	email := "tamu-" + tag + "@" + guestDomain
	hash, err := bcrypt.GenerateFromPassword([]byte(newRawToken()), 10) // tidak pernah dipakai login, hanya pengisi
	if err != nil {
		errJSON(w, 500, "hash")
		return
	}

	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	defer tx.Rollback(ctx)
	var uid, oid string
	if err := tx.QueryRow(ctx, `INSERT INTO users (email, password_hash, name, email_verified_at) VALUES ($1,$2,'Tamu',now()) RETURNING id`, email, string(hash)).Scan(&uid); err != nil {
		errJSON(w, 500, "db")
		return
	}
	if err := tx.QueryRow(ctx, `INSERT INTO orgs (name, plan) VALUES ($1,'guest') RETURNING id`, "Tamu "+tag[:4]).Scan(&oid); err != nil {
		errJSON(w, 500, "db")
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,'owner')`, oid, uid); err != nil {
		errJSON(w, 500, "db")
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO org_settings (org_id) VALUES ($1)`, oid); err != nil {
		errJSON(w, 500, "db")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		errJSON(w, 500, "db")
		return
	}
	if err := a.newSession(withReq(r), w, uid, oid); err != nil {
		errJSON(w, 500, "sesi")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "guest": true, "expires_in_hours": int(a.guestTTL().Hours()), "limits": planLimits("guest")})
}

// POST /auth/claim-guest {email, password, org}: tamu jadi akun betulan. Data org tetap, paket jadi free,
// email harus diverifikasi seperti pendaftaran biasa.
func (a *App) claimGuest(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if s.Plan != "guest" || !strings.HasSuffix(s.Email, "@"+guestDomain) {
		errJSON(w, 400, "Akun ini bukan akun tamu.")
		return
	}
	var in struct{ Email, Password, Name, Org string }
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	email := strings.ToLower(trunc(in.Email, 200))
	if _, err := mail.ParseAddress(email); err != nil || strings.HasSuffix(email, "@"+guestDomain) {
		errJSON(w, 400, "Email tidak valid.")
		return
	}
	if msg := passwordProblem(in.Password); msg != "" {
		errJSON(w, 400, msg)
		return
	}
	hash, err := hashPassword(in.Password)
	if err != nil {
		errJSON(w, 500, "hash")
		return
	}
	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE users SET email=$1, password_hash=$2, name=$3, email_verified_at=NULL WHERE id=$4`,
		email, hash, trunc(in.Name, 80), s.UserID); err != nil {
		if isUniqueViolation(err) {
			// email sudah terdaftar: jangan bocorkan lewat status, beri tahu pemilik email lewat surel
			tx.Rollback(ctx)
			a.notifyExistingAccount(w, email)
			return
		}
		errJSON(w, 500, "db")
		return
	}
	orgName := trunc(in.Org, 80)
	if orgName == "" {
		orgName = email
	}
	if _, err := tx.Exec(ctx, `UPDATE orgs SET plan='free', name=$1 WHERE id=$2`, orgName, s.OrgID); err != nil {
		errJSON(w, 500, "db")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		errJSON(w, 500, "db")
		return
	}
	a.sendVerify(ctx, email, s.UserID)
	a.audit(r, &s.OrgID, &s.UserID, "claim-guest", email, 200)
	writeJSON(w, 200, map[string]any{"ok": true, "org": orgName})
}

// purgeGuests: hapus org tamu yang lewat TTL beserta user tamunya. Dipanggil dari retentionLoop.
func (a *App) purgeGuests(ctx context.Context) {
	ct, err := a.db.Exec(ctx, `DELETE FROM orgs WHERE plan='guest' AND created_at < now() - make_interval(secs => $1)`, a.guestTTL().Seconds())
	if err != nil {
		slog.Warn("purge guest", "err", err)
		return
	}
	// user tamu yang org-nya sudah hilang (membership ikut terhapus karena cascade)
	a.db.Exec(ctx, `DELETE FROM users WHERE email LIKE '%@'||$1 AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=users.id)`, guestDomain)
	if n := ct.RowsAffected(); n > 0 {
		slog.Info("org tamu dihapus", "n", n)
	}
}
