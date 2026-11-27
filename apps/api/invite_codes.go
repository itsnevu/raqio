package main

// Akses lewat undangan (sementara, selama akses awal Raqio).
//
// INVITE_ONLY (bawaan "1"): login dengan email yang belum terdaftar dibalas 403 invite_only dan emailnya dicatat
// di access_requests (supaya yang penasaran bisa dihitung); pendaftaran baru wajib kode undangan atau undangan tim;
// mode tamu ditutup. INVITE_ONLY=0 mengembalikan perilaku lama (daftar bebas, tamu sesuai ALLOW_GUEST).
//
// Kode dibuat lewat CLI di binary yang sama:
//
//	go run . invites create -n 5 -uses 1 -days 30 -label "beta"
//	go run . invites list | stats | disable <KODE>

import (
	"context"
	"crypto/rand"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"net/mail"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const msgInviteOnly = "Akun Raqio saat ini hanya lewat undangan. Minta admin akun Raqio Anda untuk mengundang Anda, atau masukkan kode undangan."
const msgInviteCodeInvalid = "Kode undangan tidak valid, kedaluwarsa, atau sudah habis dipakai."

func inviteOnly() bool { return env("INVITE_ONLY", "1") == "1" }

// Alfabet Crockford base32 (tanpa I, L, O, U): 12 karakter = 60 bit, aman dari tebakan dengan batas laju per IP.
const inviteAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const inviteLen = 12

// newInviteCode: RAQIO-XXXX-XXXX-XXXX. 256 habis dibagi 32, jadi b%32 tidak bias.
func newInviteCode() string {
	b := make([]byte, inviteLen)
	rand.Read(b)
	var sb strings.Builder
	sb.WriteString("RAQIO")
	for i, v := range b {
		if i%4 == 0 {
			sb.WriteByte('-')
		}
		sb.WriteByte(inviteAlphabet[int(v)%len(inviteAlphabet)])
	}
	return sb.String()
}

// normalizeInviteCode menerima huruf kecil, spasi, tanda hubung, dan awalan RAQIO opsional.
// Mengembalikan 12 karakter inti, atau "" bila bentuknya bukan kode undangan.
func normalizeInviteCode(raw string) string {
	var sb strings.Builder
	for _, r := range strings.ToUpper(raw) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			sb.WriteRune(r)
		}
	}
	s := strings.TrimPrefix(sb.String(), "RAQIO")
	if len(s) != inviteLen {
		return ""
	}
	for _, r := range s {
		if !strings.ContainsRune(inviteAlphabet, r) {
			return ""
		}
	}
	return s
}

// inviteCodeHash: hash yang disimpan di invite_codes.code_hash, "" bila kode tidak berbentuk benar.
func inviteCodeHash(raw string) string {
	n := normalizeInviteCode(raw)
	if n == "" {
		return ""
	}
	return hashToken("invite-code:" + n)
}

const inviteCodeUsable = `uses < max_uses AND disabled_at IS NULL AND (expires_at IS NULL OR expires_at > now())`

// noteAccessRequest mencatat email yang mencoba masuk/daftar tanpa undangan. Paling banyak satu baris per
// email+sumber per jam, jadi percobaan berulang tidak membengkakkan tabel. Gagal mencatat tidak menggagalkan request.
func (a *App) noteAccessRequest(ctx context.Context, email, source string) {
	if len(email) > 200 {
		return
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return
	}
	if _, err := a.db.Exec(ctx, `INSERT INTO access_requests (email, source)
		SELECT $1, $2 WHERE NOT EXISTS (
			SELECT 1 FROM access_requests WHERE email=$1 AND source=$2 AND created_at > now() - interval '1 hour')`,
		email, source); err != nil {
		slog.Warn("access_requests", "err", err)
	}
}

// GET /auth/access: kebijakan akses untuk halaman login (tampilkan tombol kode undangan atau tombol tamu).
func (a *App) accessConfig(w http.ResponseWriter, r *http.Request) {
	only := inviteOnly()
	writeJSON(w, 200, map[string]any{
		"invite_only": only,
		"guest":       !only && env("ALLOW_GUEST", "1") == "1",
		"register":    env("ALLOW_REGISTER", "1") == "1",
	})
}

// cek kode dibatasi per IP: 30 percobaan per jam, ledakan 10
var inviteCheckLimit = newLimiterRate(30.0/3600, 10)

// POST /auth/invite-code {code}: cek kode masih bisa dipakai, tanpa memakainya. Kode baru terpakai saat daftar.
func (a *App) checkInviteCode(w http.ResponseWriter, r *http.Request) {
	var in struct{ Code string }
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	if !inviteCheckLimit.allow(clientIP(r)) {
		errJSON(w, 429, "Terlalu banyak percobaan kode. Coba lagi nanti.")
		return
	}
	ok := false
	if h := inviteCodeHash(in.Code); h != "" {
		if err := a.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM invite_codes WHERE code_hash=$1 AND `+inviteCodeUsable+`)`, h).Scan(&ok); err != nil {
			errJSON(w, 500, "db")
			return
		}
	}
	if !ok {
		errCode(w, 404, "invite_code_invalid", msgInviteCodeInvalid)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "code": "RAQIO-" + formatInviteCore(normalizeInviteCode(in.Code))})
}

func formatInviteCore(n string) string {
	if len(n) != inviteLen {
		return n
	}
	return n[0:4] + "-" + n[4:8] + "-" + n[8:12]
}

var errInviteCodeUsed = errors.New("kode undangan tidak bisa dipakai")

// redeemInviteCode memakai satu jatah kode di dalam transaksi pendaftaran. Kode habis/kedaluwarsa/dimatikan →
// errInviteCodeUsed (transaksi di-rollback pemanggil, jatah tidak berkurang).
func redeemInviteCode(ctx context.Context, tx pgx.Tx, codeHash, userID string) error {
	tag, err := tx.Exec(ctx, `UPDATE invite_codes SET uses=uses+1 WHERE code_hash=$1 AND `+inviteCodeUsable, codeHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errInviteCodeUsed
	}
	_, err = tx.Exec(ctx, `INSERT INTO invite_code_redemptions (code_hash, user_id) VALUES ($1,$2)`, codeHash, userID)
	return err
}

// ---------- CLI admin ----------

const devDSN = "postgres://raqio:raqio@127.0.0.1:5433/raqio?sslmode=disable"

// invitesCLI: subperintah "invites". Tidak butuh AUTH_SECRET; cukup DATABASE_URL.
func invitesCLI(args []string) int {
	usage := func() int {
		fmt.Fprintln(os.Stderr, `pakai:
  invites create [-n 5] [-uses 1] [-days 30] [-label teks]   buat kode baru (kode hanya tampil sekali)
  invites list                                              daftar kode: hint, label, terpakai, kedaluwarsa
  invites stats                                             jumlah email yang mencoba masuk tanpa undangan
  invites disable KODE                                      matikan kode`)
		return 2
	}
	if len(args) == 0 {
		return usage()
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, env("DATABASE_URL", devDSN))
	if err != nil {
		fmt.Fprintln(os.Stderr, "db:", err)
		return 1
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "db ping:", err)
		return 1
	}
	if err := migrate(ctx, pool); err != nil {
		fmt.Fprintln(os.Stderr, "migrate:", err)
		return 1
	}
	out := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
	defer out.Flush()

	switch args[0] {
	case "create":
		fs := flag.NewFlagSet("create", flag.ContinueOnError)
		n := fs.Int("n", 5, "jumlah kode")
		uses := fs.Int("uses", 1, "berapa akun per kode")
		days := fs.Int("days", 30, "masa berlaku dalam hari (0 = tanpa batas)")
		label := fs.String("label", "", "catatan, mis. nama penerima atau kanal")
		if err := fs.Parse(args[1:]); err != nil || *n < 1 || *n > 500 || *uses < 1 || *days < 0 {
			return usage()
		}
		var exp *time.Time
		if *days > 0 {
			t := time.Now().Add(time.Duration(*days) * 24 * time.Hour)
			exp = &t
		}
		fmt.Fprintln(out, "KODE\tPEMAKAIAN\tBERLAKU SAMPAI\tLABEL")
		for i := 0; i < *n; i++ {
			code := newInviteCode()
			core := normalizeInviteCode(code)
			if _, err := pool.Exec(ctx, `INSERT INTO invite_codes (code_hash, hint, label, max_uses, expires_at) VALUES ($1,$2,$3,$4,$5)`,
				inviteCodeHash(code), core[len(core)-4:], trunc(*label, 80), *uses, exp); err != nil {
				fmt.Fprintln(os.Stderr, "simpan kode:", err)
				return 1
			}
			until := "tanpa batas"
			if exp != nil {
				until = exp.Format("2006-01-02")
			}
			fmt.Fprintf(out, "%s\t%d akun\t%s\t%s\n", code, *uses, until, *label)
		}
	case "list":
		rows, err := pool.Query(ctx, `SELECT hint, label, uses, max_uses, expires_at, disabled_at, created_at FROM invite_codes ORDER BY created_at`)
		if err != nil {
			fmt.Fprintln(os.Stderr, "db:", err)
			return 1
		}
		defer rows.Close()
		fmt.Fprintln(out, "HINT\tLABEL\tTERPAKAI\tBERLAKU SAMPAI\tSTATUS\tDIBUAT")
		for rows.Next() {
			var hint, label string
			var used, max int
			var exp, dis *time.Time
			var created time.Time
			if err := rows.Scan(&hint, &label, &used, &max, &exp, &dis, &created); err != nil {
				fmt.Fprintln(os.Stderr, "db:", err)
				return 1
			}
			until, status := "tanpa batas", "aktif"
			if exp != nil {
				until = exp.Format("2006-01-02")
				if exp.Before(time.Now()) {
					status = "kedaluwarsa"
				}
			}
			if used >= max {
				status = "habis"
			}
			if dis != nil {
				status = "dimatikan"
			}
			fmt.Fprintf(out, "…%s\t%s\t%d/%d\t%s\t%s\t%s\n", hint, label, used, max, until, status, created.Format("2006-01-02"))
		}
	case "stats":
		var people, attempts, week int
		if err := pool.QueryRow(ctx, `SELECT count(DISTINCT email), count(*), count(DISTINCT email) FILTER (WHERE created_at > now() - interval '7 days') FROM access_requests`).Scan(&people, &attempts, &week); err != nil {
			fmt.Fprintln(os.Stderr, "db:", err)
			return 1
		}
		var redeemed int
		pool.QueryRow(ctx, `SELECT count(*) FROM invite_code_redemptions`).Scan(&redeemed)
		fmt.Fprintf(out, "Email penasaran (unik)\t%d\nEmail penasaran 7 hari terakhir\t%d\nCatatan percobaan (maks 1/jam/email/sumber)\t%d\nAkun dibuat lewat kode undangan\t%d\n\n", people, week, attempts, redeemed)
		rows, err := pool.Query(ctx, `SELECT email, max(created_at), count(*), string_agg(DISTINCT source, ',') FROM access_requests GROUP BY email ORDER BY max(created_at) DESC LIMIT 25`)
		if err != nil {
			fmt.Fprintln(os.Stderr, "db:", err)
			return 1
		}
		defer rows.Close()
		fmt.Fprintln(out, "EMAIL\tTERAKHIR\tPERCOBAAN\tSUMBER")
		for rows.Next() {
			var email, src string
			var last time.Time
			var c int
			if err := rows.Scan(&email, &last, &c, &src); err != nil {
				fmt.Fprintln(os.Stderr, "db:", err)
				return 1
			}
			fmt.Fprintf(out, "%s\t%s\t%d\t%s\n", email, last.Format("2006-01-02 15:04"), c, src)
		}
	case "disable":
		if len(args) != 2 || inviteCodeHash(args[1]) == "" {
			return usage()
		}
		tag, err := pool.Exec(ctx, `UPDATE invite_codes SET disabled_at=now() WHERE code_hash=$1 AND disabled_at IS NULL`, inviteCodeHash(args[1]))
		if err != nil {
			fmt.Fprintln(os.Stderr, "db:", err)
			return 1
		}
		fmt.Fprintf(out, "dimatikan: %d kode\n", tag.RowsAffected())
	default:
		return usage()
	}
	return 0
}
