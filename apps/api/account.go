package main

import (
	"log/slog"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// ---------- verifikasi email ----------

// verifyEmail: tautan dari surel. Pada verifikasi pertama, sesi lain dan semua API key user dicabut: kalau ada
// yang mendaftar lebih dulu dengan email ini (pre-account takeover), akses mereka putus di sini.
func (a *App) verifyEmail(w http.ResponseWriter, r *http.Request) {
	t, ok := a.consumeToken(r.Context(), "verify", r.URL.Query().Get("token"))
	if !ok || t.UserID == nil {
		http.Redirect(w, r, "/login?msg=verify-gagal", http.StatusSeeOther)
		return
	}
	ctx := r.Context()
	ct, err := a.db.Exec(ctx, `UPDATE users SET email_verified_at=now() WHERE id=$1 AND email_verified_at IS NULL`, *t.UserID)
	if err != nil {
		http.Redirect(w, r, "/login?msg=verify-gagal", http.StatusSeeOther)
		return
	}
	if ct.RowsAffected() > 0 { // verifikasi pertama
		current := ""
		if c, err := r.Cookie(cookieName); err == nil {
			if sid, ok := a.parseToken(c.Value); ok {
				current = sid
			}
		}
		a.db.Exec(ctx, `DELETE FROM sessions WHERE user_id=$1 AND id<>$2`, *t.UserID, current)
		a.revokeUserAPIKeys(ctx, *t.UserID)
	}
	http.Redirect(w, r, "/market?msg=verified", http.StatusSeeOther)
}

func (a *App) resendVerify(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if s.Verified || s.Guest {
		writeJSON(w, 200, map[string]any{"ok": true, "already": true})
		return
	}
	a.sendVerify(r.Context(), s.Email, s.UserID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------- lupa password ----------
// Selalu menjawab sukses supaya tidak membocorkan email mana yang terdaftar.

func (a *App) forgot(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email string }
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	email := strings.ToLower(trunc(in.Email, 200))
	ctx := r.Context()
	if a.locked(ctx, "fg:"+clientIP(r)) {
		errJSON(w, 429, "Terlalu banyak permintaan. Coba lagi nanti.")
		return
	}
	a.noteFail(ctx, "fg:"+clientIP(r))
	var uid string
	if err := a.db.QueryRow(ctx, `SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL`, email).Scan(&uid); err == nil {
		if raw, err := a.issueToken(ctx, "reset", email, &uid, nil, time.Hour); err == nil {
			a.mail.Send(email, "Atur ulang password Raqio",
				"Halo,\n\nKlik tautan ini untuk membuat password baru (berlaku 1 jam):\n"+a.appURL("/reset?token="+raw)+
					"\n\nKalau bukan kamu yang meminta, abaikan email ini. Password lama tetap berlaku.")
		}
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// resetPassword: semua sesi dan API key user dicabut; email dianggap terverifikasi (tautan datang lewat surel).
func (a *App) resetPassword(w http.ResponseWriter, r *http.Request) {
	var in struct{ Token, Password string }
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
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
	t, ok := a.consumeToken(r.Context(), "reset", in.Token)
	if !ok || t.UserID == nil {
		errJSON(w, 400, "Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru.")
		return
	}
	ctx := r.Context()
	ct, err := a.db.Exec(ctx, `UPDATE users SET password_hash=$2, email_verified_at=coalesce(email_verified_at, now()) WHERE id=$1 AND deleted_at IS NULL`, *t.UserID, hash)
	if err != nil || ct.RowsAffected() == 0 {
		slog.Error("reset password", "err", err)
		errJSON(w, 500, "db")
		return
	}
	a.db.Exec(ctx, `DELETE FROM sessions WHERE user_id=$1`, *t.UserID) // semua sesi lama keluar
	a.revokeUserAPIKeys(ctx, *t.UserID)
	a.db.Exec(ctx, `DELETE FROM login_attempts WHERE key LIKE $1`, "li:"+strings.ToLower(t.Email)+"|%")
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) changePassword(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if s.isAPIKey() {
		errJSON(w, 403, "Ganti password hanya lewat sesi login.")
		return
	}
	var in struct{ Old, New string }
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	if msg := passwordProblem(in.New); msg != "" {
		errJSON(w, 400, msg)
		return
	}
	var hash string
	a.db.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id=$1`, s.UserID).Scan(&hash)
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Old)) != nil {
		errJSON(w, 401, "Password lama salah.")
		return
	}
	nh, err := hashPassword(in.New)
	if err != nil {
		errJSON(w, 500, "hash")
		return
	}
	ct, err := a.db.Exec(r.Context(), `UPDATE users SET password_hash=$2 WHERE id=$1`, s.UserID, nh)
	if err != nil || ct.RowsAffected() == 0 {
		slog.Error("ganti password", "err", err)
		errJSON(w, 500, "db")
		return
	}
	a.db.Exec(r.Context(), `DELETE FROM sessions WHERE user_id=$1 AND id<>$2`, s.UserID, s.ID)
	a.revokeUserAPIKeys(r.Context(), s.UserID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------- undangan tim lewat email ----------

func (a *App) orgInviteEmail(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if s.isAPIKey() {
		errJSON(w, 403, "API key tidak boleh mengundang anggota.")
		return
	}
	if !roleAtLeast(s.Role, "admin") {
		errJSON(w, 403, "Hanya admin atau owner yang bisa mengundang.")
		return
	}
	var in struct{ Email, Role string }
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	email := strings.ToLower(trunc(in.Email, 200))
	if addr, err := mail.ParseAddress(email); err != nil || addr.Address != email {
		errJSON(w, 400, "Email tidak valid.")
		return
	}
	role := in.Role
	if role == "" {
		role = "analyst"
	}
	if !validRole(role) || !roleAtLeast(s.Role, role) {
		errJSON(w, 400, "Peran undangan tidak valid: pilih viewer, analyst, atau admin, dan tidak lebih tinggi dari peranmu.")
		return
	}
	ctx := r.Context()
	// anggota + undangan pending (undangan ke email ini sendiri tidak dihitung: akan diganti)
	var n int
	if err := a.db.QueryRow(ctx, `SELECT (SELECT count(*) FROM memberships WHERE org_id=$1) +
		(SELECT count(*) FROM tokens WHERE kind='invite' AND org_id=$1 AND used_at IS NULL AND expires_at > now() AND email<>$2)`,
		s.OrgID, email).Scan(&n); err != nil {
		errJSON(w, 500, "db")
		return
	}
	if n >= planLimits(s.Plan).Members {
		errJSON(w, 402, "Jumlah anggota paket "+s.Plan+" sudah maksimal (termasuk undangan yang belum diterima).")
		return
	}
	var orgName string
	a.db.QueryRow(ctx, `SELECT name FROM orgs WHERE id=$1`, s.OrgID).Scan(&orgName)
	raw, err := a.issueToken(ctx, "invite", email, nil, &s.OrgID, 7*24*time.Hour)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	if _, err := a.db.Exec(ctx, `UPDATE tokens SET role=$1 WHERE hash=$2`, role, hashToken(raw)); err != nil {
		errJSON(w, 500, "db")
		return
	}
	a.mail.Send(email, headerSafe(s.Email)+" mengundang kamu ke "+headerSafe(orgName)+" di Raqio",
		"Halo,\n\n"+s.Email+" mengundang kamu bergabung ke tim \""+orgName+"\" di Raqio.\n"+
			"Klik tautan ini (berlaku 7 hari):\n"+a.appURL("/register?invite="+raw)+
			"\n\nKalau sudah punya akun dengan email ini, masuk dulu lalu buka tautannya.")
	writeJSON(w, 200, map[string]any{"ok": true})
}

// inviteInfo: dipakai halaman daftar untuk menampilkan nama tim dan mengunci email.
func (a *App) inviteInfo(w http.ResponseWriter, r *http.Request) {
	t, ok := a.peekToken(r.Context(), "invite", r.URL.Query().Get("token"))
	if !ok || t.OrgID == nil {
		errJSON(w, 404, "Undangan tidak valid atau kedaluwarsa.")
		return
	}
	var name string
	a.db.QueryRow(r.Context(), `SELECT name FROM orgs WHERE id=$1`, *t.OrgID).Scan(&name)
	writeJSON(w, 200, map[string]any{"email": t.Email, "org": name})
}

// acceptInvite: user yang sudah login (email cocok) bergabung ke org pengundang. Token dipakai dan batas anggota
// dicek dalam satu transaksi: dua klik bersamaan tidak bisa memakai token yang sama atau melewati batas paket.
func (a *App) acceptInvite(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if s.isAPIKey() {
		errJSON(w, 403, "Hanya lewat sesi login.")
		return
	}
	var in struct{ Token string }
	if err := readJSON(r, &in); err != nil || in.Token == "" {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	defer tx.Rollback(ctx)
	t := &tokenRow{}
	if err := tx.QueryRow(ctx, `UPDATE tokens SET used_at=now() WHERE hash=$1 AND kind='invite' AND used_at IS NULL AND expires_at > now()
		RETURNING email, user_id, org_id, role`, hashToken(in.Token)).Scan(&t.Email, &t.UserID, &t.OrgID, &t.Role); err != nil ||
		t.OrgID == nil || !strings.EqualFold(t.Email, s.Email) {
		errJSON(w, 400, "Undangan tidak valid untuk akun ini.")
		return
	}
	var plan string
	var n int
	if err := tx.QueryRow(ctx, `SELECT o.plan,
		(SELECT count(*) FROM memberships WHERE org_id=o.id) +
		(SELECT count(*) FROM tokens WHERE kind='invite' AND org_id=o.id AND used_at IS NULL AND expires_at > now())
		FROM orgs o WHERE o.id=$1 FOR UPDATE`, *t.OrgID).Scan(&plan, &n); err != nil {
		errJSON(w, 500, "db")
		return
	}
	var already bool
	tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM memberships WHERE org_id=$1 AND user_id=$2)`, *t.OrgID, s.UserID).Scan(&already)
	if !already && n >= planLimits(plan).Members {
		errJSON(w, 402, "Jumlah anggota tim itu sudah maksimal untuk paketnya.")
		return
	}
	role := t.Role
	if !validRole(role) {
		role = "analyst"
	}
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, []any{*t.OrgID, s.UserID, role}},
		{`UPDATE sessions SET org_id=$1 WHERE id=$2`, []any{*t.OrgID, s.ID}},
	} {
		if _, err := tx.Exec(ctx, q.sql, q.args...); err != nil {
			slog.Error("terima undangan", "err", err)
			errJSON(w, 500, "db")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		errJSON(w, 500, "db")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "org_id": *t.OrgID})
}

func (a *App) removeMember(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if !roleAtLeast(s.Role, "admin") {
		errJSON(w, 403, "Hanya admin atau owner.")
		return
	}
	var in struct{ Email string }
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if strings.EqualFold(email, s.Email) {
		errJSON(w, 400, "Tidak bisa mengeluarkan diri sendiri.")
		return
	}
	ctx := r.Context()
	var targetID, targetRole string
	a.db.QueryRow(ctx, `SELECT u.id, m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND u.email=$2`, s.OrgID, email).Scan(&targetID, &targetRole)
	if targetRole == "" {
		errJSON(w, 404, "Bukan anggota org ini.")
		return
	}
	if roleRank[targetRole] >= roleRank[s.Role] {
		errJSON(w, 403, "Tidak bisa mengeluarkan anggota dengan peran setara atau lebih tinggi.")
		return
	}
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`DELETE FROM memberships WHERE org_id=$1 AND user_id=$2`, []any{s.OrgID, targetID}},
		{`DELETE FROM sessions WHERE org_id=$1 AND user_id=$2`, []any{s.OrgID, targetID}},
		// API key org ini yang dibuat anggota itu ikut mati
		{`UPDATE api_keys SET revoked_at=now() WHERE org_id=$1 AND created_by=$2 AND revoked_at IS NULL`, []any{s.OrgID, targetID}},
	} {
		if _, err := a.db.Exec(ctx, q.sql, q.args...); err != nil {
			slog.Error("keluarkan anggota", "err", err)
			errJSON(w, 500, "db")
			return
		}
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
