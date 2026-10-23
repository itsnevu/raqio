package main

import (
	"context"
	"testing"
)

func TestIntegrationGuest(t *testing.T) {
	e := setupIntegration(t)
	g := e.client()
	code, j := g.post("/auth/guest", map[string]string{})
	g.must(200, code, j)
	if j["guest"] != true {
		t.Fatalf("balasan tamu: %v", j)
	}
	code, j = g.get("/auth/me")
	g.must(200, code, j)
	if j["plan"] != "guest" || j["role"] != "owner" || j["verified"] != true {
		t.Fatalf("me tamu: %v", j)
	}
	// tamu boleh riset (kuota 2), tidak boleh upgrade paket
	code, j = g.post("/market/lead", map[string]any{"key": "k", "name": "n", "status": "baru"})
	g.must(200, code, j)
	code, j = g.post("/billing/checkout", map[string]string{"plan": "pro"})
	g.must(403, code, j)

	// klaim jadi akun betulan: email tamu ditolak, email asli diterima, org tetap
	code, j = g.get("/auth/me")
	orgBefore, _ := j["org_id"].(string)
	code, j = g.post("/auth/claim-guest", map[string]string{"email": "x@guest.raqio.local", "password": "rahasia123"})
	g.must(400, code, j)
	code, j = g.post("/auth/claim-guest", map[string]string{"email": "asli@x.id", "password": "rahasia123", "org": "Tim Asli"})
	g.must(200, code, j)
	code, j = g.get("/auth/me")
	g.must(200, code, j)
	if j["plan"] != "free" || j["email"] != "asli@x.id" || j["org_id"] != orgBefore || j["verified"] != false {
		t.Fatalf("setelah klaim: %v", j)
	}
	// bukan tamu lagi, klaim kedua ditolak
	code, j = g.post("/auth/claim-guest", map[string]string{"email": "lain@x.id", "password": "rahasia123"})
	g.must(400, code, j)

	// org tamu yang kedaluwarsa dibersihkan, yang sudah diklaim tidak
	h := e.client()
	code, j = h.post("/auth/guest", map[string]string{})
	h.must(200, code, j)
	ctx := context.Background()
	e.app.db.Exec(ctx, `UPDATE orgs SET created_at = now() - interval '2 days' WHERE plan='guest'`)
	e.app.purgeGuests(ctx)
	var nGuestOrgs, nGuestUsers, nClaimed int
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM orgs WHERE plan='guest'`).Scan(&nGuestOrgs)
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM users WHERE email LIKE '%@guest.raqio.local'`).Scan(&nGuestUsers)
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM orgs WHERE name='Tim Asli'`).Scan(&nClaimed)
	if nGuestOrgs != 0 || nGuestUsers != 0 || nClaimed != 1 {
		t.Fatalf("purge: org tamu %d, user tamu %d, org diklaim %d", nGuestOrgs, nGuestUsers, nClaimed)
	}
	code, _ = h.get("/auth/me")
	if code != 401 {
		t.Fatalf("sesi tamu yang dihapus harus 401, dapat %d", code)
	}
}
