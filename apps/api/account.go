package main

import (
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// ---------- verifikasi email ----------

func (a *App) verifyEmail(w http.ResponseWriter, r *http.Request) {
	t, ok := a.consumeToken(r.Context(), "verify", r.URL.Query().Get("token"))
	if !ok || t.UserID == nil {
		http.Redirect(w, r, "/login?msg=verify-gagal", http.StatusSeeOther)
		return
	}
	a.db.Exec(r.Context(), `UPDATE users SET email_verified_at=coalesce(email_verified_at, now()) WHERE id=$1`, *t.UserID)
	http.Redirect(w, r, "/market?msg=verified", http.StatusSeeOther)
}

func (a *App) resendVerify(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var verified *time.Time
	a.db.QueryRow(r.Context(), `SELECT email_verified_at FROM users WHERE id=$1`, s.UserID).Scan(&verified)
	if verified != nil {
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
	readJSON(r, &in)
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

func (a *App) resetPassword(w http.ResponseWriter, r *http.Request) {
	var in struct{ Token, Password string }
	readJSON(r, &in)
	if len(in.Password) < 8 {
		errJSON(w, 400, "Password minimal 8 karakter.")
		return
	}
	t, ok := a.consumeToken(r.Context(), "reset", in.Token)
	if !ok || t.UserID == nil {
		errJSON(w, 400, "Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru.")
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(in.Password), 12)
	ctx := r.Context()
	a.db.Exec(ctx, `UPDATE users SET password_hash=$2, email_verified_at=coalesce(email_verified_at, now()) WHERE id=$1`, *t.UserID, string(hash))
	a.db.Exec(ctx, `DELETE FROM sessions WHERE user_id=$1`, *t.UserID) // semua sesi lama keluar
	a.db.Exec(ctx, `DELETE FROM login_attempts WHERE key=$1`, "em:"+t.Email)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) changePassword(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct{ Old, New string }
	readJSON(r, &in)
	if len(in.New) < 8 {
		errJSON(w, 400, "Password baru minimal 8 karakter.")
		return
	}
	var hash string
	a.db.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id=$1`, s.UserID).Scan(&hash)
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Old)) != nil {
		errJSON(w, 401, "Password lama salah.")
		return
	}
	nh, _ := bcrypt.GenerateFromPassword([]byte(in.New), 12)
	a.db.Exec(r.Context(), `UPDATE users SET password_hash=$2 WHERE id=$1`, s.UserID, string(nh))
	a.db.Exec(r.Context(), `DELETE FROM sessions WHERE user_id=$1 AND id<>$2`, s.UserID, s.ID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------- undangan tim lewat email ----------

func (a *App) orgInviteEmail(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if s.Role != "owner" {
		errJSON(w, 403, "Hanya owner yang bisa mengundang.")
		return
	}
	var in struct{ Email string }
	readJSON(r, &in)
	email := strings.ToLower(trunc(in.Email, 200))
	if !strings.Contains(email, "@") {
		errJSON(w, 400, "Email tidak valid.")
		return
	}
	ctx := r.Context()
	var n int
	a.db.QueryRow(ctx, `SELECT count(*) FROM memberships WHERE org_id=$1`, s.OrgID).Scan(&n)
	if n >= planLimits(s.Plan).Members {
		errJSON(w, 402, "Jumlah anggota paket "+s.Plan+" sudah maksimal.")
		return
	}
	var orgName string
	a.db.QueryRow(ctx, `SELECT name FROM orgs WHERE id=$1`, s.OrgID).Scan(&orgName)
	raw, err := a.issueToken(ctx, "invite", email, nil, &s.OrgID, 7*24*time.Hour)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	a.mail.Send(email, s.Email+" mengundang kamu ke "+orgName+" di Raqio",
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

// acceptInvite: user yang sudah login (email cocok) bergabung ke org pengundang.
func (a *App) acceptInvite(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct{ Token string }
	readJSON(r, &in)
	t, ok := a.peekToken(r.Context(), "invite", in.Token)
	if !ok || t.OrgID == nil || !strings.EqualFold(t.Email, s.Email) {
		errJSON(w, 400, "Undangan tidak valid untuk akun ini.")
		return
	}
	a.consumeToken(r.Context(), "invite", in.Token)
	a.db.Exec(r.Context(), `INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING`, *t.OrgID, s.UserID)
	a.db.Exec(r.Context(), `UPDATE sessions SET org_id=$1 WHERE id=$2`, *t.OrgID, s.ID)
	writeJSON(w, 200, map[string]any{"ok": true, "org_id": *t.OrgID})
}

func (a *App) removeMember(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if s.Role != "owner" {
		errJSON(w, 403, "Hanya owner.")
		return
	}
	var in struct{ Email string }
	readJSON(r, &in)
	if strings.EqualFold(in.Email, s.Email) {
		errJSON(w, 400, "Owner tidak bisa mengeluarkan diri sendiri.")
		return
	}
	ctx := r.Context()
	a.db.Exec(ctx, `DELETE FROM memberships WHERE org_id=$1 AND user_id=(SELECT id FROM users WHERE email=$2)`, s.OrgID, strings.ToLower(in.Email))
	a.db.Exec(ctx, `DELETE FROM sessions WHERE org_id=$1 AND user_id=(SELECT id FROM users WHERE email=$2)`, s.OrgID, strings.ToLower(in.Email))
	writeJSON(w, 200, map[string]any{"ok": true})
}
