// rbac.go: peran bertingkat dan API key (bearer). Stream log job (SSE) ada di jobs.go (jobLogStreamV2).
package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ---------- peran ----------

// roleRank: makin besar makin berkuasa. 'member' lama disamakan dengan analyst.
var roleRank = map[string]int{"viewer": 0, "member": 1, "analyst": 1, "admin": 2, "owner": 3}

func roleAtLeast(role, min string) bool { return roleRank[role] >= roleRank[min] }

func validRole(r string) bool { return r == "viewer" || r == "analyst" || r == "admin" }

// requireRole: dipasang di dalam requireSession. viewer hanya boleh membaca.
func (a *App) requireRole(min string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s := sess(r)
		if s == nil {
			errJSON(w, 401, "Belum login.")
			return
		}
		if !roleAtLeast(s.Role, min) {
			errJSON(w, 403, "Peran "+s.Role+" tidak boleh melakukan ini (butuh minimal "+min+").")
			return
		}
		next(w, r)
	}
}

// ---------- API key ----------

const apiKeyPrefix = "rq_"

// sessionFromAPIKey: Authorization: Bearer rq_... menjadi Session tanpa cookie. Key yang dicabut, pembuatnya
// sudah dihapus, atau pembuatnya bukan anggota org itu lagi tidak berlaku. Peran efektif = yang lebih rendah
// antara peran key dan peran pembuat saat ini (pembuat yang diturunkan tidak bisa memakai key lamanya).
func (a *App) sessionFromAPIKey(ctx context.Context, raw string) (*Session, bool) {
	if !strings.HasPrefix(raw, apiKeyPrefix) || len(raw) < 20 {
		return nil, false
	}
	s := &Session{}
	var id int64
	var memberRole string
	var lastUsed *time.Time
	err := a.db.QueryRow(ctx, `SELECT k.id, k.org_id, k.role, k.label, k.created_by, o.plan, m.role,
			u.email_verified_at IS NOT NULL, k.last_used_at
		FROM api_keys k
		JOIN orgs o ON o.id=k.org_id
		JOIN users u ON u.id=k.created_by AND u.deleted_at IS NULL
		JOIN memberships m ON m.user_id=k.created_by AND m.org_id=k.org_id
		WHERE k.hash=$1 AND k.revoked_at IS NULL`, hashToken(raw)).
		Scan(&id, &s.OrgID, &s.Role, &s.Email, &s.UserID, &s.Plan, &memberRole, &s.Verified, &lastUsed)
	if err != nil {
		return nil, false
	}
	if roleRank[memberRole] < roleRank[s.Role] {
		s.Role = memberRole
	}
	s.ID = fmt.Sprintf("key:%d", id)
	s.Email = "apikey:" + s.Email
	s.Guest = s.Plan == "guest"
	// last_used_at hanya ditulis kalau sudah lebih dari 1 menit, sinkron, supaya pool tidak diserbu goroutine
	if lastUsed == nil || time.Since(*lastUsed) > time.Minute {
		a.db.Exec(ctx, `UPDATE api_keys SET last_used_at=now() WHERE id=$1`, id)
	}
	return s, true
}

func (a *App) listAPIKeys(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	rows, err := a.db.Query(r.Context(), `SELECT id, label, prefix, role, created_at, last_used_at, revoked_at FROM api_keys WHERE org_id=$1 ORDER BY id DESC`, s.OrgID)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var label, prefix, role string
		var created time.Time
		var used, revoked *time.Time
		if rows.Scan(&id, &label, &prefix, &role, &created, &used, &revoked) == nil {
			out = append(out, map[string]any{"id": id, "label": label, "prefix": prefix, "role": role, "created_at": created, "last_used_at": used, "revoked_at": revoked})
		}
	}
	writeJSON(w, 200, map[string]any{"keys": out})
}

func (a *App) createAPIKey(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if s.isAPIKey() {
		errJSON(w, 403, "API key tidak boleh membuat API key baru. Masuk lewat browser.")
		return
	}
	if s.Guest {
		errJSON(w, 403, "Akun tamu tidak bisa membuat API key. Simpan akun dulu.")
		return
	}
	var in struct{ Label, Role string }
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	label := trunc(in.Label, 60)
	if label == "" {
		label = "default"
	}
	role := in.Role
	if role == "" {
		role = "analyst"
	}
	if !validRole(role) || !roleAtLeast(s.Role, role) {
		errJSON(w, 400, "Peran key tidak valid atau lebih tinggi dari peran kamu.")
		return
	}
	var n int
	a.db.QueryRow(r.Context(), `SELECT count(*) FROM api_keys WHERE org_id=$1 AND revoked_at IS NULL`, s.OrgID).Scan(&n)
	if n >= 20 {
		errJSON(w, 400, "Maksimal 20 API key aktif per org. Cabut yang tidak dipakai.")
		return
	}
	raw := apiKeyPrefix + newRawToken()
	var id int64
	err := a.db.QueryRow(r.Context(), `INSERT INTO api_keys (org_id, created_by, label, prefix, hash, role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		s.OrgID, s.UserID, label, raw[:11], hashToken(raw), role).Scan(&id)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	// raw hanya dikirim sekali, tidak bisa dilihat lagi
	writeJSON(w, 200, map[string]any{"ok": true, "id": id, "key": raw, "prefix": raw[:11], "role": role})
}

func (a *App) revokeAPIKey(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct{ ID int64 }
	if err := readJSON(r, &in); err != nil {
		errJSON(w, 400, "Request tidak valid.")
		return
	}
	ct, err := a.db.Exec(r.Context(), `UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND org_id=$2 AND revoked_at IS NULL`, in.ID, s.OrgID)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": ct.RowsAffected() > 0})
}
