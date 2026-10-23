package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

// bearer: request dengan API key, tanpa cookie.
func bearer(t *testing.T, base, method, path, key string, body any) (int, map[string]any) {
	t.Helper()
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(method, base+path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	out := map[string]any{}
	json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func TestIntegrationRBACAndAPIKey(t *testing.T) {
	e := setupIntegration(t)
	o := e.client()
	o.register("o@x.id", "O")
	e.app.db.Exec(context.Background(), `UPDATE orgs SET plan='pro' WHERE name='O'`)
	e.app.db.Exec(context.Background(), `UPDATE users SET email_verified_at=now() WHERE email='o@x.id'`) // undangan dan API key wajib email terverifikasi
	o.post("/auth/login", map[string]string{"email": "o@x.id", "password": "rahasia123"})

	// peran undangan divalidasi
	code, j := o.post("/org/invite", map[string]string{"email": "v@x.id", "role": "raja"})
	o.must(400, code, j)
	code, j = o.post("/org/invite", map[string]string{"email": "v@x.id", "role": "viewer"})
	o.must(200, code, j)
	it := e.token("invite", "v@x.id")
	v := e.client()
	code, j = v.post("/auth/register", map[string]string{"email": "v@x.id", "password": "rahasia123", "invite": it})
	v.must(200, code, j)
	code, j = v.get("/auth/me")
	v.must(200, code, j)
	if j["role"] != "viewer" {
		t.Fatalf("peran undangan tidak terpakai: %v", j["role"])
	}

	// viewer hanya baca
	code, j = v.get("/market/reports")
	v.must(200, code, j)
	code, j = v.post("/market/run", map[string]string{"industry": "kopi", "area": "kemang"})
	v.must(403, code, j)
	code, j = v.post("/market/lead", map[string]any{"key": "k", "name": "n", "status": "baru"})
	v.must(403, code, j)
	code, j = v.post("/org/invite", map[string]string{"email": "x@x.id"})
	v.must(403, code, j)
	code, j = v.get("/org/api-keys")
	v.must(403, code, j)

	// owner tidak bisa dikeluarkan viewer; owner bisa mengeluarkan viewer
	code, j = v.post("/org/remove-member", map[string]string{"email": "o@x.id"})
	v.must(403, code, j)

	// API key: dibuat owner dengan peran analyst
	code, j = o.post("/org/api-keys", map[string]string{"label": "ci", "role": "owner"})
	o.must(400, code, j)
	code, j = o.post("/org/api-keys", map[string]string{"label": "ci", "role": "analyst"})
	o.must(200, code, j)
	key, _ := j["key"].(string)
	if len(key) < 20 || key[:3] != "rq_" {
		t.Fatalf("key aneh: %q", key)
	}
	id := j["id"].(float64)

	code, j = bearer(t, e.srv.URL, "GET", "/auth/me", key, nil)
	if code != 200 || j["role"] != "analyst" {
		t.Fatalf("bearer me: %d %v", code, j)
	}
	// analyst lewat key boleh membuat lead, tidak boleh mengelola key
	code, j = bearer(t, e.srv.URL, "POST", "/market/lead", key, map[string]any{"key": "k1", "name": "n", "status": "baru"})
	if code != 200 {
		t.Fatalf("bearer lead: %d %v", code, j)
	}
	code, _ = bearer(t, e.srv.URL, "POST", "/org/api-keys", key, map[string]string{"label": "x"})
	if code != 403 {
		t.Fatalf("analyst harus 403 kelola key, dapat %d", code)
	}
	code, _ = bearer(t, e.srv.URL, "GET", "/auth/me", "rq_salah", nil)
	if code != 401 {
		t.Fatalf("key salah harus 401, dapat %d", code)
	}

	// daftar key tidak memuat raw, lalu dicabut
	code, j = o.get("/org/api-keys")
	o.must(200, code, j)
	keys := j["keys"].([]any)
	if len(keys) != 1 || keys[0].(map[string]any)["key"] != nil {
		t.Fatalf("daftar key: %v", keys)
	}
	code, j = o.post("/org/api-keys/revoke", map[string]any{"id": id})
	o.must(200, code, j)
	code, _ = bearer(t, e.srv.URL, "GET", "/auth/me", key, nil)
	if code != 401 {
		t.Fatalf("key dicabut harus 401, dapat %d", code)
	}

	// audit_log terisi untuk aksi tulis
	var n int
	e.app.db.QueryRow(context.Background(), `SELECT count(*) FROM audit_log WHERE action LIKE 'POST /org/api-keys%'`).Scan(&n)
	if n < 2 {
		t.Fatalf("audit_log kurang: %d", n)
	}
}
