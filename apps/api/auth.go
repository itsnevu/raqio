package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

const cookieName = "raqio_session"
const sessionDays = 7

type Session struct {
	ID       string
	UserID   string
	OrgID    string
	Email    string
	Role     string
	Plan     string
	Guest    bool // org tamu (plan 'guest'): dibatasi di beberapa handler
	Verified bool // email_verified_at terisi; tamu dianggap terverifikasi
}

type ctxKey int

const sessKey ctxKey = 1

func sess(r *http.Request) *Session { s, _ := r.Context().Value(sessKey).(*Session); return s }

// isAPIKey: sesi berasal dari Authorization: Bearer rq_..., bukan cookie.
func (s *Session) isAPIKey() bool { return strings.HasPrefix(s.ID, "key:") }

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
	err := a.db.QueryRow(ctx, `SELECT s.user_id, s.org_id, u.email, m.role, o.plan, u.email_verified_at IS NOT NULL FROM sessions s
		JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
		JOIN memberships m ON m.user_id = s.user_id AND m.org_id = s.org_id
		JOIN orgs o ON o.id = s.org_id
		WHERE s.id = $1 AND s.expires_at > now()`, sid).Scan(&s.UserID, &s.OrgID, &s.Email, &s.Role, &s.Plan, &s.Verified)
	if err != nil {
		return nil, false
	}
	s.Guest = s.Plan == "guest"
	return s, true
}

// requireSession: wajib cookie valid atau API key. Request tulis bersesi cookie dicek CSRF (Sec-Fetch-Site,
// Origin/Referer) dan wajib Content-Type JSON lewat browserGuard.
func (a *App) requireSession(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var s *Session
		if bearer := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "); bearer != "" && bearer != r.Header.Get("Authorization") {
			// integrasi lewat API key: tanpa cookie, tanpa cek CSRF (bukan browser)
			ks, ok := a.sessionFromAPIKey(r.Context(), strings.TrimSpace(bearer))
			if !ok {
				errJSON(w, 401, "API key tidak valid atau sudah dicabut.")
				return
			}
			s = ks
		} else {
			c, err := r.Cookie(cookieName)
			if err != nil {
				errJSON(w, 401, "Belum login.")
				return
			}
			cs, ok := a.loadSession(r.Context(), c.Value)
			if !ok {
				a.setCookie(w, "", -1)
				errJSON(w, 401, "Sesi habis, login lagi.")
				return
			}
			s = cs
		}
		r = r.WithContext(context.WithValue(r.Context(), sessKey, s))
		if r.Method == http.MethodGet || r.Method == http.MethodHead {
			next.ServeHTTP(w, r)
			return
		}
		h := http.Handler(next)
		if !s.isAPIKey() {
			h = browserGuard(next)
		}
		// semua request tulis yang bersesi masuk audit_log
		sw := &statusWriter{ResponseWriter: w, code: 200}
		h.ServeHTTP(sw, r)
		a.audit(r, &s.OrgID, &s.UserID, r.Method+" "+r.URL.Path, "", sw.code)
	})
}

// ---------- rem percobaan login ----------

// Kunci per pasangan email+IP: penyerang dari IP lain tidak bisa mengunci akun korban. Backoff progresif:
// 5 gagal = 1 menit, 10 = 15 menit, 20 = 1 jam. Dipakai juga untuk kunci lain ("fg:"+ip untuk lupa password).

func loginKey(email, ip string) string { return "li:" + email + "|" + ip }

func (a *App) locked(ctx context.Context, key string) bool {
	var until *time.Time
	a.db.QueryRow(ctx, `SELECT locked_until FROM login_attempts WHERE key=$1`, key).Scan(&until)
	return until != nil && until.After(time.Now())
}

func (a *App) noteFail(ctx context.Context, key string) {
	a.db.Exec(ctx, `INSERT INTO login_attempts (key, fails, locked_until) VALUES ($1, 1, NULL)
		ON CONFLICT (key) DO UPDATE SET fails = login_attempts.fails + 1,
		locked_until = CASE
			WHEN login_attempts.fails + 1 >= 20 THEN now() + interval '1 hour'
			WHEN login_attempts.fails + 1 >= 10 THEN now() + interval '15 minutes'
			WHEN login_attempts.fails + 1 >= 5 THEN now() + interval '1 minute'
			ELSE NULL END`, key)
}

// dummyHash: dibandingkan saat email tidak terdaftar supaya waktu respons sama dengan email yang ada
// (bcrypt cost 12 tetap dijalankan). Dibuat sekali saat pertama dipakai.
var (
	dummyHash     []byte
	dummyHashOnce sync.Once
)

func dummyBcrypt() []byte {
	dummyHashOnce.Do(func() {
		dummyHash, _ = bcrypt.GenerateFromPassword([]byte("raqio-dummy-password"), 12)
	})
	return dummyHash
}

// ---------- IP klien di balik proxy ----------

// trustedProxies: TRUSTED_PROXIES (CIDR, dipisah koma). Default jaringan lokal dan privat (Caddy, compose).
var (
	proxyMu     sync.Mutex
	proxyRaw    string
	proxyParsed []*net.IPNet
)

const defaultTrustedProxies = "127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"

func trustedProxies() []*net.IPNet {
	raw := env("TRUSTED_PROXIES", defaultTrustedProxies)
	proxyMu.Lock()
	defer proxyMu.Unlock()
	if raw == proxyRaw && proxyParsed != nil {
		return proxyParsed
	}
	var out []*net.IPNet
	for _, c := range strings.Split(raw, ",") {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if !strings.Contains(c, "/") {
			if strings.Contains(c, ":") {
				c += "/128"
			} else {
				c += "/32"
			}
		}
		if _, n, err := net.ParseCIDR(c); err == nil {
			out = append(out, n)
		} else {
			slog.Warn("TRUSTED_PROXIES tidak valid, diabaikan", "entri", c)
		}
	}
	proxyRaw, proxyParsed = raw, out
	return out
}

func isTrustedProxy(ip net.IP) bool {
	if ip == nil {
		return false
	}
	for _, n := range trustedProxies() {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

func hostOnly(addr string) string {
	if h, _, err := net.SplitHostPort(addr); err == nil {
		return h
	}
	return strings.Trim(addr, "[]")
}

// clientIP: alamat klien untuk rate limit, lockout, dan audit. X-Forwarded-For hanya dipercaya kalau koneksi
// datang dari proxy tepercaya, dan dibaca dari KANAN melewati proxy tepercaya: entri paling kiri bisa ditulis
// bebas oleh klien. Nilai yang bukan IP valid diabaikan.
func clientIP(r *http.Request) string {
	remote := hostOnly(r.RemoteAddr)
	rip := net.ParseIP(remote)
	if rip == nil || !isTrustedProxy(rip) {
		return remote
	}
	xff := r.Header.Get("X-Forwarded-For")
	if xff == "" {
		return remote
	}
	parts := strings.Split(xff, ",")
	for i := len(parts) - 1; i >= 0; i-- {
		h := hostOnly(strings.TrimSpace(parts[i]))
		ip := net.ParseIP(h)
		if ip == nil {
			return remote // rantai rusak: jangan percaya apa pun di kirinya
		}
		if !isTrustedProxy(ip) {
			return ip.String()
		}
	}
	// semua entri proxy tepercaya: klien adalah proxy paling kiri
	if ip := net.ParseIP(hostOnly(strings.TrimSpace(parts[0]))); ip != nil {
		return ip.String()
	}
	return remote
}

// ---------- password ----------

const bcryptMaxBytes = 72

// passwordProblem: pesan untuk password yang tidak diterima, "" kalau boleh. bcrypt diam-diam memotong
// di 72 byte, jadi yang lebih panjang ditolak alih-alih dipotong.
func passwordProblem(pw string) string {
	if len(pw) < 8 {
		return "Password minimal 8 karakter."
	}
	if len(pw) > bcryptMaxBytes {
		return "Password maksimal 72 byte."
	}
	return ""
}

func hashPassword(pw string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(pw), 12)
	if err != nil {
		slog.Error("bcrypt", "err", err)
		return "", err
	}
	return string(h), nil
}

// revokeUserAPIKeys: cabut semua API key yang dibuat user (saat dikeluarkan dari org, reset/ganti password,
// verifikasi pertama, hapus akun). Key milik org tetapi dibuat pengguna lain tidak disentuh.
func (a *App) revokeUserAPIKeys(ctx context.Context, userID string) {
	if _, err := a.db.Exec(ctx, `UPDATE api_keys SET revoked_at=now() WHERE created_by=$1 AND revoked_at IS NULL`, userID); err != nil {
		slog.Warn("cabut api key", "err", err)
	}
}

func isUniqueViolation(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
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
	if r, ok := ctx.Value(reqCtxKey{}).(*http.Request); ok {
		a.audit(r, &orgID, &userID, "login", "", 200)
	}
	return nil
}

// reqCtxKey menyimpan *http.Request di ctx supaya newSession bisa mencatat audit tanpa mengubah tanda tangannya.
type reqCtxKey struct{}

func withReq(r *http.Request) context.Context { return context.WithValue(r.Context(), reqCtxKey{}, r) }

// notifyExistingAccount: email sudah terdaftar. Dibalas 200 {existing:true} supaya status tidak membocorkan
// email mana yang terdaftar; pemilik email diberi tahu lewat surel.
func (a *App) notifyExistingAccount(w http.ResponseWriter, email string) {
	a.mail.Send(email, "Akun Raqio sudah ada",
		"Halo,\n\nSeseorang mencoba mendaftar di Raqio dengan email ini, padahal akunnya sudah ada.\n"+
			"Kalau itu kamu, masuk seperti biasa atau pakai \"Lupa password\" di "+a.appURL("/forgot")+
			"\n\nKalau bukan kamu, abaikan email ini. Tidak ada yang berubah di akunmu.")
	writeJSON(w, 200, map[string]any{"ok": true, "existing": true})
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
	if msg := passwordProblem(in.Password); msg != "" {
		errJSON(w, 400, msg)
		return
	}
	if env("ALLOW_REGISTER", "1") != "1" {
		errJSON(w, 403, "Pendaftaran ditutup.")
		return
	}
	hash, err := hashPassword(in.Password)
	if err != nil {
		errJSON(w, 500, "hash")
		return
	}
	orgName := trunc(in.Org, 80)
	if orgName == "" {
		orgName = trunc(in.Name, 80)
		if orgName == "" {
			orgName = email
		}
	}
	ctx := r.Context()
	var inv *tokenRow
	if in.Invite != "" {
		if t, ok := a.peekToken(ctx, "invite", in.Invite); ok && t.OrgID != nil && strings.EqualFold(t.Email, email) {
			inv = t
		}
	}
	tx, err := a.db.Begin(ctx)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	defer tx.Rollback(ctx)
	var uid, oid string
	if err := tx.QueryRow(ctx, `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`, email, hash, trunc(in.Name, 80)).Scan(&uid); err != nil {
		if isUniqueViolation(err) {
			tx.Rollback(ctx)
			a.notifyExistingAccount(w, email)
			return
		}
		slog.Error("register", "err", err)
		errJSON(w, 500, "db")
		return
	}
	if inv != nil { // daftar lewat undangan: langsung jadi anggota org pengundang, tanpa org pribadi
		oid = *inv.OrgID
		role := inv.Role
		if !validRole(role) {
			role = "analyst"
		}
		// batas anggota paket dicek di dalam transaksi: anggota + undangan pending lain
		var plan string
		var n int
		if err := tx.QueryRow(ctx, `SELECT o.plan,
			(SELECT count(*) FROM memberships WHERE org_id=o.id) +
			(SELECT count(*) FROM tokens WHERE kind='invite' AND org_id=o.id AND used_at IS NULL AND expires_at > now() AND hash<>$2)
			FROM orgs o WHERE o.id=$1`, oid, hashToken(in.Invite)).Scan(&plan, &n); err != nil {
			errJSON(w, 500, "db")
			return
		}
		if n >= planLimits(plan).Members {
			errJSON(w, 402, "Jumlah anggota tim pengundang sudah maksimal untuk paketnya.")
			return
		}
		for _, q := range []struct {
			sql  string
			args []any
		}{
			{`INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,$3)`, []any{oid, uid, role}},
			{`UPDATE users SET email_verified_at=now() WHERE id=$1`, []any{uid}}, // email terbukti lewat tautan undangan
			{`UPDATE tokens SET used_at=now() WHERE hash=$1 AND used_at IS NULL`, []any{hashToken(in.Invite)}},
		} {
			if _, err := tx.Exec(ctx, q.sql, q.args...); err != nil {
				slog.Error("register undangan", "err", err)
				errJSON(w, 500, "db")
				return
			}
		}
		if err := tx.QueryRow(ctx, `SELECT name FROM orgs WHERE id=$1`, oid).Scan(&orgName); err != nil {
			errJSON(w, 500, "db")
			return
		}
	} else {
		if err := tx.QueryRow(ctx, `INSERT INTO orgs (name) VALUES ($1) RETURNING id`, orgName).Scan(&oid); err != nil {
			slog.Error("register org", "err", err)
			errJSON(w, 500, "db")
			return
		}
		for _, q := range []struct {
			sql  string
			args []any
		}{
			{`INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,'owner')`, []any{oid, uid}},
			{`INSERT INTO org_settings (org_id) VALUES ($1)`, []any{oid}},
		} {
			if _, err := tx.Exec(ctx, q.sql, q.args...); err != nil {
				slog.Error("register org", "err", err)
				errJSON(w, 500, "db")
				return
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		errJSON(w, 500, "db")
		return
	}
	if inv == nil {
		a.sendVerify(ctx, email, uid)
	}
	if err := a.newSession(withReq(r), w, uid, oid); err != nil {
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
	key := loginKey(email, clientIP(r))
	if a.locked(ctx, key) {
		errJSON(w, 429, "Terlalu banyak percobaan. Coba lagi nanti.")
		return
	}
	var uid, hash string
	err := a.db.QueryRow(ctx, `SELECT id, password_hash FROM users WHERE email=$1 AND deleted_at IS NULL`, email).Scan(&uid, &hash)
	cmp := []byte(hash)
	if err != nil {
		cmp = dummyBcrypt() // tetap jalankan bcrypt supaya waktu respons tidak membocorkan email terdaftar
	}
	if bcrypt.CompareHashAndPassword(cmp, []byte(in.Password)) != nil || err != nil {
		a.noteFail(ctx, key)
		errJSON(w, 401, "Email atau password salah.")
		return
	}
	a.db.Exec(ctx, `DELETE FROM login_attempts WHERE key=$1`, key)
	var oid string
	if err := a.db.QueryRow(ctx, `SELECT org_id FROM memberships WHERE user_id=$1 ORDER BY role='owner' DESC LIMIT 1`, uid).Scan(&oid); err != nil {
		errJSON(w, 500, "akun tidak punya org")
		return
	}
	if err := a.newSession(withReq(r), w, uid, oid); err != nil {
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

// logoutAll: cabut SEMUA sesi user ini (termasuk yang sekarang) lalu hapus cookie — "keluar dari semua
// perangkat" tanpa harus ganti password. Ganti password (account.go) sudah mencabut sesi lain otomatis.
func (a *App) logoutAll(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if s.isAPIKey() {
		errJSON(w, 403, "Hanya lewat sesi login.")
		return
	}
	if _, err := a.db.Exec(r.Context(), `DELETE FROM sessions WHERE user_id=$1`, s.UserID); err != nil {
		logDB("logoutAll", "delete sessions", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	a.audit(r, &s.OrgID, &s.UserID, "logout_all", "", 200)
	a.setCookie(w, "", -1)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) me(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	rows, err := a.db.Query(r.Context(), `SELECT o.id, o.name, m.role FROM memberships m JOIN orgs o ON o.id=m.org_id WHERE m.user_id=$1 ORDER BY o.name`, s.UserID)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	defer rows.Close()
	type org struct {
		ID, Name, Role string
	}
	orgs := []org{}
	for rows.Next() {
		var o org
		if rows.Scan(&o.ID, &o.Name, &o.Role) == nil {
			orgs = append(orgs, o)
		}
	}
	var planUntil *time.Time
	a.db.QueryRow(r.Context(), `SELECT plan_until FROM orgs WHERE id=$1`, s.OrgID).Scan(&planUntil)
	writeJSON(w, 200, map[string]any{"email": s.Email, "org_id": s.OrgID, "role": s.Role, "plan": s.Plan, "orgs": orgs,
		"limits": planLimits(s.Plan), "verified": s.Verified || s.Guest, "guest": s.Guest, "plan_until": planUntil})
}

func (a *App) switchOrg(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if s.isAPIKey() {
		errJSON(w, 403, "API key terikat satu org.")
		return
	}
	var in struct {
		OrgID string `json:"org_id"`
	}
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	var ok bool
	if err := a.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM memberships WHERE user_id=$1 AND org_id=$2::uuid)`, s.UserID, in.OrgID).Scan(&ok); err != nil || !ok {
		errJSON(w, 403, "Bukan anggota org itu.")
		return
	}
	if _, err := a.db.Exec(r.Context(), `UPDATE sessions SET org_id=$1 WHERE id=$2`, in.OrgID, s.ID); err != nil {
		errJSON(w, 500, "db")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) orgInfo(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var name string
	a.db.QueryRow(r.Context(), `SELECT name FROM orgs WHERE id=$1`, s.OrgID).Scan(&name)
	rows, err := a.db.Query(r.Context(), `SELECT u.id, u.email, m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND u.deleted_at IS NULL ORDER BY u.email`, s.OrgID)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	defer rows.Close()
	members := []map[string]string{}
	for rows.Next() {
		var id, e, ro string
		if rows.Scan(&id, &e, &ro) == nil {
			members = append(members, map[string]string{"user_id": id, "email": e, "role": ro})
		}
	}
	usage, _ := a.usageThisMonth(r.Context(), s.OrgID)
	writeJSON(w, 200, map[string]any{"name": name, "plan": s.Plan, "members": members, "usage": usage, "limits": planLimits(s.Plan)})
}

// deleteAccount: hapus user; org yang hanya dia anggotanya ikut terhapus beserta semua datanya (UU PDP: hak hapus).
// Kalau dia owner satu-satunya di org yang masih punya anggota lain: 409, kecuali {force:true} yang memindahkan
// owner ke admin tertua (atau anggota tertua). IP di audit_log miliknya dianonimkan, API key-nya dicabut.
func (a *App) deleteAccount(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if s.isAPIKey() {
		errJSON(w, 403, "Hapus akun hanya lewat sesi login.")
		return
	}
	var in struct {
		Password string
		Force    bool
	}
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	var hash string
	a.db.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id=$1`, s.UserID).Scan(&hash)
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		errJSON(w, 401, "Password salah.")
		return
	}
	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	defer tx.Rollback(ctx)
	// org tempat dia owner satu-satunya tetapi ada anggota lain
	rows, err := tx.Query(ctx, `SELECT m.org_id FROM memberships m WHERE m.user_id=$1 AND m.role='owner'
		AND EXISTS (SELECT 1 FROM memberships x WHERE x.org_id=m.org_id AND x.user_id<>$1)
		AND NOT EXISTS (SELECT 1 FROM memberships y WHERE y.org_id=m.org_id AND y.user_id<>$1 AND y.role='owner')
		FOR UPDATE`, s.UserID)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	var orphan []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			orphan = append(orphan, id)
		}
	}
	rows.Close()
	if len(orphan) > 0 && !in.Force {
		errJSON(w, 409, "Kamu owner satu-satunya di tim yang masih punya anggota lain. Transfer owner dulu, atau kirim force:true untuk mengalihkan ke admin/anggota tertua.")
		return
	}
	for _, oid := range orphan {
		var heir string
		if err := tx.QueryRow(ctx, `SELECT m.user_id FROM memberships m JOIN users u ON u.id=m.user_id
			WHERE m.org_id=$1 AND m.user_id<>$2 AND u.deleted_at IS NULL
			ORDER BY (m.role='admin') DESC, u.created_at ASC LIMIT 1`, oid, s.UserID).Scan(&heir); err != nil {
			errJSON(w, 500, "db")
			return
		}
		if _, err := tx.Exec(ctx, `UPDATE memberships SET role='owner' WHERE org_id=$1 AND user_id=$2`, oid, heir); err != nil {
			errJSON(w, 500, "db")
			return
		}
	}
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`UPDATE api_keys SET revoked_at=now() WHERE created_by=$1 AND revoked_at IS NULL`, []any{s.UserID}},
		{`UPDATE audit_log SET ip='' WHERE user_id=$1`, []any{s.UserID}},
		{`DELETE FROM orgs WHERE id IN (SELECT org_id FROM memberships WHERE user_id=$1 AND org_id NOT IN (SELECT org_id FROM memberships WHERE user_id<>$1))`, []any{s.UserID}},
		{`DELETE FROM users WHERE id=$1`, []any{s.UserID}},
	} {
		if _, err := tx.Exec(ctx, q.sql, q.args...); err != nil {
			slog.Error("hapus akun", "err", err)
			errJSON(w, 500, "db")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		errJSON(w, 500, "db")
		return
	}
	a.setCookie(w, "", -1)
	writeJSON(w, 200, map[string]any{"ok": true})
}

var _ = pgx.ErrNoRows
