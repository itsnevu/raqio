package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

// redeem: panggilan server-ke-server (tanpa cookie) dengan rahasia bersama.
func redeem(t *testing.T, e *testEnv, secret string, body map[string]string) (int, map[string]any) {
	t.Helper()
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", e.srv.URL+"/auth/sso/redeem", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if secret != "" {
		req.Header.Set("Authorization", "Bearer "+secret)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	out := map[string]any{}
	json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func productsOf(j map[string]any) []string {
	out := []string{}
	if arr, ok := j["products"].([]any); ok {
		for _, p := range arr {
			out = append(out, p.(string))
		}
	}
	return out
}

// Satu akun Raqio, tetapi produk per org: daftar terbuka = Competitor Scraping; kode undangan menentukan produk;
// fitur scraping ditolak untuk org tanpa produk itu; tiket SSO WA-Suite hanya untuk akun terverifikasi yang memegang
// WA-Suite, sekali pakai, dan hanya bisa ditukar dengan rahasia server.
func TestProductsAndSSOTicket(t *testing.T) {
	e := setupIntegration(t)
	ctx := context.Background()

	// org lama / daftar terbuka: Competitor Scraping saja
	a := e.client()
	code, j := a.post("/auth/register", map[string]string{"email": "riset@x.id", "password": "rahasia123", "name": "Riset"})
	a.must(200, code, j)
	code, j = a.get("/auth/me")
	a.must(200, code, j)
	if p := productsOf(j); len(p) != 1 || p[0] != "scraping" {
		t.Fatalf("daftar terbuka harus dapat scraping saja, dapat %v", p)
	}
	code, j = a.get("/market/reports")
	a.must(200, code, j)

	// kode undangan khusus WA-Suite
	t.Setenv("INVITE_ONLY", "1")
	raw := newInviteCode()
	if _, err := e.app.db.Exec(ctx, `INSERT INTO invite_codes (code_hash, hint, max_uses, products) VALUES ($1,'tes',1,'{wasuite}')`, inviteCodeHash(raw)); err != nil {
		t.Fatal(err)
	}
	b := e.client()
	code, j = b.post("/auth/register", map[string]string{"email": "cs@x.id", "password": "rahasia123", "name": "CS", "code": raw})
	b.must(200, code, j)
	code, j = b.get("/auth/me")
	b.must(200, code, j)
	if p := productsOf(j); len(p) != 1 || p[0] != "wasuite" {
		t.Fatalf("kode wasuite harus memberi wasuite saja, dapat %v", p)
	}
	code, j = b.get("/market/reports")
	if code != 403 || j["code"] != "product_required" {
		t.Fatalf("org tanpa scraping tidak boleh membuka fitur riset: %d %v", code, j)
	}
	code, j = b.post("/chat/sid", map[string]string{})
	if code != 403 || j["code"] != "product_required" {
		t.Fatalf("asisten riset juga butuh produk scraping: %d %v", code, j)
	}

	// tiket: email belum terverifikasi ditolak
	code, j = b.post("/auth/sso/ticket", map[string]string{"product": "wasuite"})
	if code != 403 || j["code"] != "verify_required" {
		t.Fatalf("email belum terverifikasi harus ditolak: %d %v", code, j)
	}
	e.app.db.Exec(ctx, `UPDATE users SET email_verified_at=now() WHERE email IN ('cs@x.id','riset@x.id')`)
	// akun tanpa WA-Suite tidak dapat tiket
	code, j = a.post("/auth/sso/ticket", map[string]string{"product": "wasuite"})
	if code != 403 || j["code"] != "product_required" {
		t.Fatalf("akun tanpa wasuite tidak boleh dapat tiket: %d %v", code, j)
	}
	code, j = b.post("/auth/sso/ticket", map[string]string{"product": "wasuite"})
	b.must(200, code, j)
	ticket, _ := j["ticket"].(string)
	if len(ticket) < 32 {
		t.Fatalf("tiket terlalu pendek: %q", ticket)
	}

	// penukaran: mati tanpa SSO_SECRET, rahasia salah ditolak, produk lain ditolak
	if code, _ := redeem(t, e, "apa-saja", map[string]string{"ticket": ticket, "product": "wasuite"}); code != 404 {
		t.Fatalf("tanpa SSO_SECRET penukaran harus mati (404), dapat %d", code)
	}
	t.Setenv("SSO_SECRET", "rahasia-sso-tes-yang-panjang")
	if code, _ := redeem(t, e, "salah", map[string]string{"ticket": ticket, "product": "wasuite"}); code != 401 {
		t.Fatalf("rahasia salah harus 401, dapat %d", code)
	}
	if code, j := redeem(t, e, "rahasia-sso-tes-yang-panjang", map[string]string{"ticket": ticket, "product": "scraping"}); code != 401 || j["code"] != "ticket_invalid" {
		t.Fatalf("tiket wasuite tidak boleh ditukar untuk produk lain: %d %v", code, j)
	}
	code, j = redeem(t, e, "rahasia-sso-tes-yang-panjang", map[string]string{"ticket": ticket, "product": "wasuite"})
	if code != 200 || j["email"] != "cs@x.id" || j["verified"] != true || j["guest"] != false {
		t.Fatalf("penukaran sah harus mengembalikan profil: %d %v", code, j)
	}
	if p := productsOf(j); len(p) != 1 || p[0] != "wasuite" {
		t.Fatalf("profil tukar harus membawa produk: %v", p)
	}
	// sekali pakai
	if code, j := redeem(t, e, "rahasia-sso-tes-yang-panjang", map[string]string{"ticket": ticket, "product": "wasuite"}); code != 401 || j["code"] != "ticket_invalid" {
		t.Fatalf("tiket kedua kali harus ditolak: %d %v", code, j)
	}
	// kedaluwarsa
	old := newRawToken()
	var uid, oid string
	e.app.db.QueryRow(ctx, `SELECT u.id, m.org_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email='cs@x.id'`).Scan(&uid, &oid)
	e.app.db.Exec(ctx, `INSERT INTO sso_tickets (hash, user_id, org_id, product, expires_at) VALUES ($1,$2,$3,'wasuite',$4)`, hashToken(old), uid, oid, time.Now().Add(-time.Second))
	if code, _ := redeem(t, e, "rahasia-sso-tes-yang-panjang", map[string]string{"ticket": old, "product": "wasuite"}); code != 401 {
		t.Fatalf("tiket kedaluwarsa harus ditolak, dapat %d", code)
	}
	// produk dicabut di antara terbit dan tukar
	code, j = b.post("/auth/sso/ticket", map[string]string{"product": "wasuite"})
	b.must(200, code, j)
	fresh, _ := j["ticket"].(string)
	e.app.db.Exec(ctx, `DELETE FROM org_products WHERE org_id=$1 AND product='wasuite'`, oid)
	if code, j := redeem(t, e, "rahasia-sso-tes-yang-panjang", map[string]string{"ticket": fresh, "product": "wasuite"}); code != 403 || j["code"] != "product_required" {
		t.Fatalf("produk yang dicabut harus menolak penukaran: %d %v", code, j)
	}
}

func TestParseProducts(t *testing.T) {
	if p := parseProducts("scraping, wasuite,scraping"); len(p) != 2 || p[0] != "scraping" || p[1] != "wasuite" {
		t.Fatalf("parseProducts: %v", p)
	}
	if parseProducts("scraping,crm") != nil {
		t.Fatal("produk tak dikenal harus ditolak")
	}
}
