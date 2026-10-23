package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"os"
	"strings"
	"time"
)

// ---------- kirim email ----------
// Tanpa SMTP_HOST, email tidak dikirim; yang dicatat di log hanya penerima dan subjek (isi memuat token
// reset/verifikasi/undangan, jadi tidak pernah dicatat). MAIL_LOG_BODY=1 mencatat isi, hanya di luar produksi.

type Mailer struct {
	host, port, user, pass, from string
}

func newMailer() *Mailer {
	return &Mailer{host: env("SMTP_HOST", ""), port: env("SMTP_PORT", "587"), user: env("SMTP_USER", ""),
		pass: env("SMTP_PASS", ""), from: env("SMTP_FROM", "Raqio <no-reply@raqio.local>")}
}

func isProduction() bool { return os.Getenv("APP_ENV") == "production" }

// headerSafe: buang CR, LF, dan karakter kontrol lain supaya nilai tidak bisa menyisipkan header baru.
func headerSafe(s string) string {
	return strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, s)
}

// encodeSubject: Q-encoding (RFC 2047) supaya subjek non-ASCII aman dan tidak bisa menyisipkan header.
func encodeSubject(s string) string { return mime.QEncoding.Encode("utf-8", headerSafe(s)) }

// parseRecipient: alamat tujuan wajib valid menurut RFC 5322; hanya bagian alamatnya yang dipakai.
func parseRecipient(to string) (string, error) {
	addr, err := mail.ParseAddress(headerSafe(strings.TrimSpace(to)))
	if err != nil {
		return "", errors.New("alamat email tidak valid")
	}
	if strings.ContainsAny(addr.Address, "<>\\\"") {
		return "", errors.New("alamat email tidak valid")
	}
	return addr.Address, nil
}

func (m *Mailer) Send(to, subject, body string) error {
	rcpt, err := parseRecipient(to)
	if err != nil {
		slog.Warn("email ditolak", "to", headerSafe(to), "err", err)
		return err
	}
	subj := encodeSubject(subject)
	if m.host == "" {
		args := []any{"to", rcpt, "subject", headerSafe(subject), "catatan", "token diredaksi, isi tidak dicatat"}
		if os.Getenv("MAIL_LOG_BODY") == "1" && !isProduction() {
			args = append(args, "body", body)
		}
		slog.Info("email (dev, tidak dikirim)", args...)
		return nil
	}
	from := headerSafe(m.from)
	fromAddr := from
	if a, err := mail.ParseAddress(from); err == nil {
		fromAddr = a.Address
	}
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s",
		from, rcpt, subj, body)
	var auth smtp.Auth
	if m.user != "" {
		auth = smtp.PlainAuth("", m.user, m.pass, m.host)
	}
	err = sendMailTimeout(m.host+":"+m.port, m.host, auth, fromAddr, rcpt, []byte(msg), 30*time.Second)
	if err != nil {
		slog.Error("email gagal", "to", rcpt, "err", err)
	}
	return err
}

// sendMailTimeout: seperti smtp.SendMail tetapi dengan batas waktu koneksi dan seluruh sesi, supaya handler
// (register, forgot, invite) tidak menggantung kalau server SMTP lambat.
func sendMailTimeout(addr, host string, auth smtp.Auth, from, to string, msg []byte, timeout time.Duration) error {
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(timeout))
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer c.Close()
	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: host}); err != nil {
			return err
		}
	}
	if auth != nil {
		if ok, _ := c.Extension("AUTH"); ok {
			if err := c.Auth(auth); err != nil {
				return err
			}
		}
	}
	if err := c.Mail(from); err != nil {
		return err
	}
	if err := c.Rcpt(to); err != nil {
		return err
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return c.Quit()
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
	// satu token aktif per (email, kind): yang lama dibatalkan. Untuk undangan hanya di org yang sama,
	// supaya org lain tidak bisa membatalkan undangan org ini.
	if orgID != nil {
		a.db.Exec(ctx, `UPDATE tokens SET used_at=now() WHERE email=$1 AND kind=$2 AND used_at IS NULL AND org_id=$3`, email, kind, *orgID)
	} else {
		a.db.Exec(ctx, `UPDATE tokens SET used_at=now() WHERE email=$1 AND kind=$2 AND used_at IS NULL AND org_id IS NULL`, email, kind)
	}
	_, err := a.db.Exec(ctx, `INSERT INTO tokens (hash, kind, email, user_id, org_id, expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
		hashToken(raw), kind, email, userID, orgID, time.Now().Add(ttl))
	return raw, err
}

type tokenRow struct {
	Email  string
	UserID *string
	OrgID  *string
	Role   string
}

// consumeToken memvalidasi dan menandai token terpakai dalam satu langkah.
func (a *App) consumeToken(ctx context.Context, kind, raw string) (*tokenRow, bool) {
	if raw == "" {
		return nil, false
	}
	t := &tokenRow{}
	err := a.db.QueryRow(ctx, `UPDATE tokens SET used_at=now() WHERE hash=$1 AND kind=$2 AND used_at IS NULL AND expires_at > now()
		RETURNING email, user_id, org_id, role`, hashToken(raw), kind).Scan(&t.Email, &t.UserID, &t.OrgID, &t.Role)
	if err != nil {
		return nil, false
	}
	return t, true
}

func (a *App) peekToken(ctx context.Context, kind, raw string) (*tokenRow, bool) {
	t := &tokenRow{}
	err := a.db.QueryRow(ctx, `SELECT email, user_id, org_id, role FROM tokens WHERE hash=$1 AND kind=$2 AND used_at IS NULL AND expires_at > now()`,
		hashToken(raw), kind).Scan(&t.Email, &t.UserID, &t.OrgID, &t.Role)
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
