package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

const cookieName = "raqio_session"
const sessionDays = 7

type Session struct {
	ID     string
	UserID string
	OrgID  string
	Email  string
	Role   string
	Plan   string
}

type ctxKey int

const sessKey ctxKey = 1

func sess(r *http.Request) *Session { s, _ := r.Context().Value(sessKey).(*Session); return s }

// token = sid.exp.sig ; sig = HMAC(sid.exp). Next.js memverifikasi tanda tangan yang sama secara stateless.
func (a *App) sign(msg string) string {
	m := hmac.New(sha256.New, a.secret)
	m.Write([]byte(msg))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

func (a *App) makeToken(sid string, exp time.Time) string {
	body := sid + "." + strconv.FormatInt(exp.UnixMilli(), 10)
	return body + "." + a.sign(body)
}

func (a *App) parseToken(tok string) (string, bool) {
	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		return "", false
	}
	ms, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || time.UnixMilli(ms).Before(time.Now()) {
		return "", false
	}
	if !hmac.Equal([]byte(a.sign(parts[0]+"."+parts[1])), []byte(parts[2])) {
		return "", false
	}
	return parts[0], true
}

func (a *App) setCookie(w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: value, Path: "/", HttpOnly: true, Secure: a.secureCook,
		SameSite: http.SameSiteLaxMode, MaxAge: maxAge})
}

func (a *App) loadSession(ctx context.Context, tok string) (*Session, bool) {
	sid, ok := a.parseToken(tok)
	if !ok {
		return nil, false
	}
	s := &Session{ID: sid}
	err := a.db.QueryRow(ctx, `SELECT s.user_id, s.org_id, u.email, m.role, o.plan FROM sessions s
		JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
		JOIN memberships m ON m.user_id = s.user_id AND m.org_id = s.org_id
		JOIN orgs o ON o.id = s.org_id
		WHERE s.id = $1 AND s.expires_at > now()`, sid).Scan(&s.UserID, &s.OrgID, &s.Email, &s.Role, &s.Plan)
	if err != nil {
		return nil, false
	}
	return s, true
}

// requireSession: wajib cookie valid. POST juga dicek Origin/Sec-Fetch-Site sebagai pengaman CSRF.
func (a *App) requireSession(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(cookieName)
		if err != nil {
			errJSON(w, 401, "Belum login.")
			return
		}
		s, ok := a.loadSession(r.Context(), c.Value)
		if !ok {
			a.setCookie(w, "", -1)
			errJSON(w, 401, "Sesi habis, login lagi.")
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			if sfs := r.Header.Get("Sec-Fetch-Site"); sfs != "" && sfs != "same-origin" && sfs != "none" {
				errJSON(w, 403, "Permintaan lintas situs ditolak.")
				return
			}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), sessKey, s)))
	})
}

// ---------- rem percobaan login ----------

func (a *App) locked(ctx context.Context, key string) bool {
	var until *time.Time
	a.db.QueryRow(ctx, `SELECT locked_until FROM login_attempts WHERE key=$1`, key).Scan(&until)
	return until != nil && until.After(time.Now())
}

func (a *App) noteFail(ctx context.Context, key string) {
	a.db.Exec(ctx, `INSERT INTO login_attempts (key, fails, locked_until) VALUES ($1, 1, NULL)
		ON CONFLICT (key) DO UPDATE SET fails = login_attempts.fails + 1,
		locked_until = CASE WHEN login_attempts.fails + 1 >= 10 THEN now() + interval '15 minutes' ELSE NULL END`, key)
}

func clientIP(r *http.Request) string {
	if x := r.Header.Get("X-Forwarded-For"); x != "" {
		return strings.TrimSpace(strings.Split(x, ",")[0])
	}
	h := r.RemoteAddr
	if i := strings.LastIndex(h, ":"); i > 0 {
		h = h[:i]
	}
	return h
}

// ---------- handlers ----------

func (a *App) newSession(ctx context.Context, w http.ResponseWriter, userID, orgID string) error {
	b := make([]byte, 24)
	rand.Read(b)
	sid := hex.EncodeToString(b)
	exp := time.Now().Add(sessionDays * 24 * time.Hour)
	if _, err := a.db.Exec(ctx, `INSERT INTO sessions (id, user_id, org_id, expires_at) VALUES ($1,$2,$3,$4)`, sid, userID, orgID, exp); err != nil {
		return err
	}
	a.setCookie(w, a.makeToken(sid, exp), sessionDays*86400)
	return nil
}

func (a *App) register(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password, Name, Org, Invite string }
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	email := strings.ToLower(trunc(in.Email, 200))
	if _, err := mail.ParseAddress(email); err != nil {
		errJSON(w, 400, "Email tidak valid.")
		return
	}
	if len(in.Password) < 8 {
		errJSON(w, 400, "Password minimal 8 karakter.")
		return
	}
	if env("ALLOW_REGISTER", "1") != "1" {
		errJSON(w, 403, "Pendaftaran ditutup.")
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(in.Password), 12)
	orgName := trunc(in.Org, 80)
	if orgName == "" {
		orgName = trunc(in.Name, 80)
		if orgName == "" {
			orgName = email
		}
	}
	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	defer tx.Rollback(ctx)
	var uid, oid string
	if err := tx.QueryRow(ctx, `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`, email, string(hash), trunc(in.Name, 80)).Scan(&uid); err != nil {
		errJSON(w, 409, "Email sudah terdaftar.")
		return
	}
	var inv *tokenRow
	if in.Invite != "" {
		if t, ok := a.peekToken(ctx, "invite", in.Invite); ok && t.OrgID != nil && strings.EqualFold(t.Email, email) {
			inv = t
		}
	}
	if inv != nil { // daftar lewat undangan: langsung jadi anggota org pengundang, tanpa org pribadi
		oid = *inv.OrgID
		tx.Exec(ctx, `INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,'member')`, oid, uid)
		tx.Exec(ctx, `UPDATE users SET email_verified_at=now() WHERE id=$1`, uid) // email terbukti lewat tautan undangan
		tx.Exec(ctx, `UPDATE tokens SET used_at=now() WHERE hash=$1`, hashToken(in.Invite))
		tx.QueryRow(ctx, `SELECT name FROM orgs WHERE id=$1`, oid).Scan(&orgName)
	} else {
		tx.QueryRow(ctx, `INSERT INTO orgs (name) VALUES ($1) RETURNING id`, orgName).Scan(&oid)
		tx.Exec(ctx, `INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,'owner')`, oid, uid)
		tx.Exec(ctx, `INSERT INTO org_settings (org_id) VALUES ($1)`, oid)
	}
	if err := tx.Commit(ctx); err != nil {
		errJSON(w, 500, "db")
		return
	}
	if inv == nil {
		a.sendVerify(ctx, email, uid)
	}
	if err := a.newSession(ctx, w, uid, oid); err != nil {
		errJSON(w, 500, "sesi")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "org": orgName})
}

func (a *App) login(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password string }
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	ctx := r.Context()
	email := strings.ToLower(trunc(in.Email, 200))
	ip := clientIP(r)
	if a.locked(ctx, "ip:"+ip) || a.locked(ctx, "em:"+email) {
		errJSON(w, 429, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.")
		return
	}
	var uid, hash string
	err := a.db.QueryRow(ctx, `SELECT id, password_hash FROM users WHERE email=$1 AND deleted_at IS NULL`, email).Scan(&uid, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		a.noteFail(ctx, "ip:"+ip)
		a.noteFail(ctx, "em:"+email)
		errJSON(w, 401, "Email atau password salah.")
		return
	}
	a.db.Exec(ctx, `DELETE FROM login_attempts WHERE key = ANY($1)`, []string{"ip:" + ip, "em:" + email})
	var oid string
	if err := a.db.QueryRow(ctx, `SELECT org_id FROM memberships WHERE user_id=$1 ORDER BY role='owner' DESC LIMIT 1`, uid).Scan(&oid); err != nil {
		errJSON(w, 500, "akun tidak punya org")
		return
	}
	if err := a.newSession(ctx, w, uid, oid); err != nil {
		errJSON(w, 500, "sesi")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		if sid, ok := a.parseToken(c.Value); ok {
			a.db.Exec(r.Context(), `DELETE FROM sessions WHERE id=$1`, sid)
		}
	}
	a.setCookie(w, "", -1)
	if strings.Contains(r.Header.Get("Accept"), "text/html") {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) me(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	rows, _ := a.db.Query(r.Context(), `SELECT o.id, o.name, m.role FROM memberships m JOIN orgs o ON o.id=m.org_id WHERE m.user_id=$1 ORDER BY o.name`, s.UserID)
	type org struct {
		ID, Name, Role string
	}
	orgs := []org{}
	for rows.Next() {
		var o org
		rows.Scan(&o.ID, &o.Name, &o.Role)
		orgs = append(orgs, o)
	}
	var verified *time.Time
	a.db.QueryRow(r.Context(), `SELECT email_verified_at FROM users WHERE id=$1`, s.UserID).Scan(&verified)
	writeJSON(w, 200, map[string]any{"email": s.Email, "org_id": s.OrgID, "role": s.Role, "plan": s.Plan, "orgs": orgs, "limits": planLimits(s.Plan), "verified": verified != nil})
}

func (a *App) switchOrg(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		OrgID string `json:"org_id"`
	}
	readJSON(r, &in)
	var ok bool
	a.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM memberships WHERE user_id=$1 AND org_id=$2)`, s.UserID, in.OrgID).Scan(&ok)
	if !ok {
		errJSON(w, 403, "Bukan anggota org itu.")
		return
	}
	a.db.Exec(r.Context(), `UPDATE sessions SET org_id=$1 WHERE id=$2`, in.OrgID, s.ID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) orgInfo(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var name string
	a.db.QueryRow(r.Context(), `SELECT name FROM orgs WHERE id=$1`, s.OrgID).Scan(&name)
	rows, _ := a.db.Query(r.Context(), `SELECT u.email, m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND u.deleted_at IS NULL ORDER BY u.email`, s.OrgID)
	members := []map[string]string{}
	for rows.Next() {
		var e, ro string
		rows.Scan(&e, &ro)
		members = append(members, map[string]string{"email": e, "role": ro})
	}
	usage, _ := a.usageThisMonth(r.Context(), s.OrgID)
	writeJSON(w, 200, map[string]any{"name": name, "plan": s.Plan, "members": members, "usage": usage, "limits": planLimits(s.Plan)})
}

// deleteAccount: hapus user; org yang hanya dia anggotanya ikut terhapus beserta semua datanya (UU PDP: hak hapus).
func (a *App) deleteAccount(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct{ Password string }
	readJSON(r, &in)
	var hash string
	a.db.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id=$1`, s.UserID).Scan(&hash)
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		errJSON(w, 401, "Password salah.")
		return
	}
	ctx := r.Context()
	tx, _ := a.db.Begin(ctx)
	defer tx.Rollback(ctx)
	tx.Exec(ctx, `DELETE FROM orgs WHERE id IN (SELECT org_id FROM memberships WHERE user_id=$1 AND org_id NOT IN (SELECT org_id FROM memberships WHERE user_id<>$1))`, s.UserID)
	tx.Exec(ctx, `DELETE FROM users WHERE id=$1`, s.UserID)
	if err := tx.Commit(ctx); err != nil {
		errJSON(w, 500, "db")
		return
	}
	a.setCookie(w, "", -1)
	writeJSON(w, 200, map[string]any{"ok": true})
}

var _ = pgx.ErrNoRows
