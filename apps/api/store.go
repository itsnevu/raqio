// store.go: helper akses DB yang tidak diam saat gagal, format error dengan kode, batas anggota, penjaga SSE.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// querier dipenuhi *pgxpool.Pool, *pgxpool.Conn, dan pgx.Tx: fungsi kuota/antrian bisa dipakai di dalam transaksi.
type querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// errNoRows: alias pgx.ErrNoRows supaya file lain tidak perlu mengimpor pgx hanya untuk ini.
var errNoRows = pgx.ErrNoRows

// shortSQL memadatkan SQL untuk log: satu baris, maksimal 120 karakter.
func shortSQL(sql string) string {
	s := strings.Join(strings.Fields(sql), " ")
	if len(s) > 120 {
		s = s[:120] + "…"
	}
	return s
}

// logDB mencatat error DB beserta SQL ringkas. Tidak pernah mencatat argumen (bisa berisi data pribadi).
func logDB(op, sql string, err error) {
	slog.Error("db", "op", op, "sql", shortSQL(sql), "err", err)
}

// exec menjalankan statement tulis. Kalau gagal: log dengan slog dan balas 500 "Gagal menyimpan, coba lagi", return false.
// Handler cukup `if !a.exec(...) { return }`.
func (a *App) exec(ctx context.Context, w http.ResponseWriter, sql string, args ...any) bool {
	if _, err := a.db.Exec(ctx, sql, args...); err != nil {
		logDB("exec", sql, err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return false
	}
	return true
}

// execLog: seperti exec tapi untuk loop latar belakang (tanpa ResponseWriter). Mengembalikan jumlah baris.
func (a *App) execLog(ctx context.Context, sql string, args ...any) int64 {
	ct, err := a.db.Exec(ctx, sql, args...)
	if err != nil {
		logDB("exec", sql, err)
		return 0
	}
	return ct.RowsAffected()
}

// query membungkus a.db.Query: kalau gagal, log dan balas 500 lalu return nil. Pemanggil wajib rows.Close().
func (a *App) query(ctx context.Context, w http.ResponseWriter, sql string, args ...any) pgx.Rows {
	rows, err := a.db.Query(ctx, sql, args...)
	if err != nil {
		logDB("query", sql, err)
		errCode(w, 500, "db_error", "Gagal membaca data, coba lagi")
		return nil
	}
	return rows
}

// errCode: seperti errJSON tapi dengan field code (snake_case) supaya klien bisa bercabang tanpa membaca kalimat.
func errCode(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": msg, "code": code})
}

// uniqueViolationOn: true bila err adalah pelanggaran unique index/constraint bernama name (kosong = apa pun).
func uniqueViolationOn(err error, name string) bool {
	var pe *pgconn.PgError
	if !errors.As(err, &pe) || pe.Code != "23505" {
		return false
	}
	return name == "" || pe.ConstraintName == name
}

// memberLimitReached: anggota aktif + undangan yang belum dipakai dan belum kedaluwarsa sudah mencapai batas paket.
// Dipakai orgInviteEmail, acceptInvite, dan register lewat undangan (account.go/auth.go).
func (a *App) memberLimitReached(ctx context.Context, org, plan string) bool {
	var n int
	err := a.db.QueryRow(ctx, `SELECT (SELECT count(*) FROM memberships WHERE org_id=$1)
		+ (SELECT count(*) FROM tokens WHERE org_id=$1 AND kind='invite' AND used_at IS NULL AND expires_at > now())`, org).Scan(&n)
	if err != nil {
		logDB("memberLimit", "count memberships+invites", err)
		return true // gagal menghitung: lebih aman menolak
	}
	return n >= planLimits(plan).Members
}

// ---------- penjaga jumlah stream SSE per org ----------

const sseMaxPerOrg = 3

type sseGuard struct {
	mu     sync.Mutex
	active map[string]int
}

var sseStreams = &sseGuard{active: map[string]int{}}

// acquire: ambil satu slot stream untuk org; false kalau sudah sseMaxPerOrg.
func (g *sseGuard) acquire(org string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.active[org] >= sseMaxPerOrg {
		return false
	}
	g.active[org]++
	return true
}

func (g *sseGuard) release(org string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.active[org] <= 1 {
		delete(g.active, org)
		return
	}
	g.active[org]--
}

func (g *sseGuard) count(org string) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.active[org]
}
