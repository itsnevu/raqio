package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
	"time"
)

// ---------- kirim email ----------
// Tanpa SMTP_HOST, email tidak dikirim tapi isinya dicatat di log (mode dev).

type Mailer struct {
	host, port, user, pass, from string
}

func newMailer() *Mailer {
	return &Mailer{host: env("SMTP_HOST", ""), port: env("SMTP_PORT", "587"), user: env("SMTP_USER", ""),
		pass: env("SMTP_PASS", ""), from: env("SMTP_FROM", "Raqio <no-reply@raqio.local>")}
}

func (m *Mailer) Send(to, subject, body string) error {
	if m.host == "" {
		slog.Info("email (dev, tidak dikirim)", "to", to, "subject", subject, "body", body)
		return nil
	}
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s", m.from, to, subject, body)
	var auth smtp.Auth
	if m.user != "" {
		auth = smtp.PlainAuth("", m.user, m.pass, m.host)
	}
	from := m.from
	if i := strings.Index(from, "<"); i >= 0 {
		from = strings.Trim(from[i:], "<>")
	}
	err := smtp.SendMail(m.host+":"+m.port, auth, from, []string{to}, []byte(msg))
	if err != nil {
		slog.Error("email gagal", "to", to, "err", err)
	}
	return err
}

// ---------- token sekali pakai ----------

func newRawToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func hashToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

func (a *App) issueToken(ctx context.Context, kind, email string, userID, orgID *string, ttl time.Duration) (string, error) {
	raw := newRawToken()
	// satu token aktif per (email, kind): yang lama dibatalkan
	a.db.Exec(ctx, `UPDATE tokens SET used_at=now() WHERE email=$1 AND kind=$2 AND used_at IS NULL`, email, kind)
	_, err := a.db.Exec(ctx, `INSERT INTO tokens (hash, kind, email, user_id, org_id, expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
		hashToken(raw), kind, email, userID, orgID, time.Now().Add(ttl))
	return raw, err
}

type tokenRow struct {
	Email  string
	UserID *string
	OrgID  *string
}

// consumeToken memvalidasi dan menandai token terpakai dalam satu langkah.
func (a *App) consumeToken(ctx context.Context, kind, raw string) (*tokenRow, bool) {
	if raw == "" {
		return nil, false
	}
	t := &tokenRow{}
	err := a.db.QueryRow(ctx, `UPDATE tokens SET used_at=now() WHERE hash=$1 AND kind=$2 AND used_at IS NULL AND expires_at > now()
		RETURNING email, user_id, org_id`, hashToken(raw), kind).Scan(&t.Email, &t.UserID, &t.OrgID)
	if err != nil {
		return nil, false
	}
	return t, true
}

func (a *App) peekToken(ctx context.Context, kind, raw string) (*tokenRow, bool) {
	t := &tokenRow{}
	err := a.db.QueryRow(ctx, `SELECT email, user_id, org_id FROM tokens WHERE hash=$1 AND kind=$2 AND used_at IS NULL AND expires_at > now()`,
		hashToken(raw), kind).Scan(&t.Email, &t.UserID, &t.OrgID)
	return t, err == nil
}

func (a *App) appURL(path string) string {
	return strings.TrimRight(env("APP_URL", "http://localhost:3000"), "/") + path
}

func (a *App) sendVerify(ctx context.Context, email, userID string) {
	raw, err := a.issueToken(ctx, "verify", email, &userID, nil, 48*time.Hour)
	if err != nil {
		return
	}
	a.mail.Send(email, "Verifikasi email Raqio",
		"Halo,\n\nKlik tautan ini untuk memverifikasi email kamu (berlaku 48 jam):\n"+a.appURL("/auth/verify?token="+raw)+
			"\n\nKalau kamu tidak mendaftar di Raqio, abaikan email ini.")
}
