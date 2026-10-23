package main

import (
	"context"
	"embed"
	"fmt"
	"log/slog"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// Id advisory lock Postgres. Semua loop latar belakang dan migrasi memakai id unik supaya aman dijalankan
// oleh lebih dari satu replika API: hanya satu yang memegang lock, yang lain melewati putaran itu.
const (
	lockMigrate   = 7211
	lockScheduler = 7212
	lockRetention = 7213
	lockAlert     = 7214
	lockOutbox    = 7215
)

// migrate menjalankan file migrations/*.sql yang belum tercatat, berurutan sesuai nama.
// Seluruh proses di bawah pg_advisory_lock pada satu koneksi yang sama, jadi dua replika yang start
// bersamaan tidak menjalankan migrasi yang sama dua kali.
func migrate(ctx context.Context, pool *pgxpool.Pool) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, lockMigrate); err != nil {
		return err
	}
	defer conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, lockMigrate)

	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	for _, name := range names {
		var done bool
		if err := conn.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)`, name).Scan(&done); err != nil {
			return err
		}
		if done {
			continue
		}
		sqlb, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		tx, err := conn.Begin(ctx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, string(sqlb)); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("migrasi %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name); err != nil {
			tx.Rollback(ctx)
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		slog.Info("migrasi diterapkan", "name", name)
	}
	return nil
}

// tryLock mengambil pg_try_advisory_lock(id) pada satu koneksi pool. Kalau false, replika lain sedang
// memegangnya dan pemanggil harus melewati putaran ini. release wajib dipanggil bila ok.
func (a *App) tryLock(ctx context.Context, id int64) (release func(), ok bool) {
	conn, err := a.db.Acquire(ctx)
	if err != nil {
		return nil, false
	}
	var got bool
	if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, id).Scan(&got); err != nil || !got {
		conn.Release()
		return nil, false
	}
	return func() {
		conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, id)
		conn.Release()
	}, true
}
