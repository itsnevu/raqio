package main

// Tes integrasi: API sungguhan + Postgres sungguhan (database raqio_test, dibuat ulang tiap run).
// Lewat kalau Postgres tidak bisa dihubungi. Atur dengan TEST_DATABASE_URL (default: port 5433 lokal).
//   go test ./... -run Integration -v

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type testEnv struct {
	t   *testing.T
	app *App
	srv *httptest.Server
}

func setupIntegration(t *testing.T) *testEnv {
	t.Helper()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		base = "postgres://raqio:raqio@127.0.0.1:5433/raqio?sslmode=disable"
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, base)
	if err != nil {
		t.Skip("postgres tidak tersedia:", err)
	}
	if err := admin.Ping(ctx); err != nil {
		t.Skip("postgres tidak tersedia:", err)
	}
	admin.Exec(ctx, `DROP DATABASE IF EXISTS raqio_test WITH (FORCE)`)
	if _, err := admin.Exec(ctx, `CREATE DATABASE raqio_test`); err != nil {
		t.Fatal(err)
	}
	admin.Close()

	u, _ := url.Parse(base)
	u.Path = "/raqio_test"
	pool, err := pgxpool.New(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	if err := migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	legacy, _ := url.Parse("http://127.0.0.1:1") // tidak ada; legacy tidak diuji di sini
	app := &App{db: pool, secret: []byte("secret-tes-yang-cukup-panjang"), mail: &Mailer{}, retention: 24 * time.Hour}
	app.legacy = httputil.NewSingleHostReverseProxy(legacy)
	srv := httptest.NewServer(app.router())
	t.Cleanup(func() { srv.Close(); pool.Close() })
	return &testEnv{t: t, app: app, srv: srv}
}

// client: satu "browser" dengan cookie jar sendiri.
type client struct {
	t  *testing.T
	c  *http.Client
	ur string
}

func (e *testEnv) client() *client {
	jar, _ := cookiejar.New(nil)
	return &client{t: e.t, c: &http.Client{Jar: jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, ur: e.srv.URL}
}

func (c *client) do(method, path string, body any) (int, map[string]any) {
	c.t.Helper()
	var rd *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req, _ := http.NewRequest(method, c.ur+path, rd)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := c.c.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	var raw any
	json.NewDecoder(resp.Body).Decode(&raw)
	if m, ok := raw.(map[string]any); ok {
		out = m
	} else {
		out = map[string]any{"_list": raw}
	}
	return resp.StatusCode, out
}

func (c *client) post(path string, body any) (int, map[string]any) { return c.do("POST", path, body) }
func (c *client) get(path string) (int, map[string]any)            { return c.do("GET", path, nil) }

func (c *client) must(code int, got int, j map[string]any) {
	c.t.Helper()
	if got != code {
		c.t.Fatalf("harap %d dapat %d: %v", code, got, j)
	}
}

func (c *client) register(email, org string) {
	c.t.Helper()
	code, j := c.post("/auth/register", map[string]string{"email": email, "password": "rahasia123", "name": "T", "org": org})
	c.must(200, code, j)
}

func list(j map[string]any) []any { l, _ := j["_list"].([]any); return l }

// ---------- auth ----------

func TestIntegrationAuth(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()

	code, j := a.get("/auth/me")
	a.must(401, code, j)

	a.register("a@x.id", "Org A")
	code, j = a.get("/auth/me")
	a.must(200, code, j)
	if j["email"] != "a@x.id" || j["role"] != "owner" || j["plan"] != "free" || j["verified"] != false {
		t.Fatalf("me salah: %v", j)
	}

	code, j = a.post("/auth/register", map[string]string{"email": "a@x.id", "password": "rahasia123"})
	a.must(409, code, j)
	code, j = a.post("/auth/register", map[string]string{"email": "b@x.id", "password": "pendek"})
	a.must(400, code, j)
	code, j = a.post("/auth/register", map[string]string{"email": "bukan-email", "password": "rahasia123"})
	a.must(400, code, j)

	code, j = a.post("/auth/logout", nil)
	a.must(200, code, j)
	code, j = a.get("/auth/me")
	a.must(401, code, j)

	code, j = a.post("/auth/login", map[string]string{"email": "a@x.id", "password": "salah"})
	a.must(401, code, j)
	code, j = a.post("/auth/login", map[string]string{"email": "a@x.id", "password": "rahasia123"})
	a.must(200, code, j)
	code, _ = a.get("/auth/me")
	a.must(200, code, nil)
}

func TestIntegrationLoginLockout(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("lock@x.id", "L")
	a.post("/auth/logout", nil)
	for i := 0; i < 10; i++ {
		a.post("/auth/login", map[string]string{"email": "lock@x.id", "password": "salah"})
	}
	code, j := a.post("/auth/login", map[string]string{"email": "lock@x.id", "password": "rahasia123"})
	a.must(429, code, j)
}

func TestIntegrationTokenTamper(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("t@x.id", "T")
	u, _ := url.Parse(e.srv.URL)
	for _, ck := range a.c.Jar.Cookies(u) {
		if ck.Name == cookieName {
			parts := strings.Split(ck.Value, ".")
			parts[1] = fmt.Sprint(time.Now().Add(365 * 24 * time.Hour).UnixMilli()) // perpanjang exp tanpa tanda tangan
			a.c.Jar.SetCookies(u, []*http.Cookie{{Name: cookieName, Value: strings.Join(parts, ".")}})
		}
	}
	code, j := a.get("/auth/me")
	a.must(401, code, j)
}

// ---------- tenancy ----------

func TestIntegrationTenancy(t *testing.T) {
	e := setupIntegration(t)
	a, b := e.client(), e.client()
	a.register("a@x.id", "Org A")
	b.register("b@x.id", "Org B")

	code, j := a.post("/market/lead", map[string]any{"key": "p1", "name": "Toko", "status": "dihubungi", "note": "rahasia A"})
	a.must(200, code, j)
	code, j = a.post("/org/settings", map[string]any{"offer": "jasa A", "goals": map[string]string{"kopi|kemang": "rival"}})
	a.must(200, code, j)

	// laporan org A disuntik langsung (worker tidak dijalankan di tes)
	var orgA string
	e.app.db.QueryRow(context.Background(), `SELECT id FROM orgs WHERE name='Org A'`).Scan(&orgA)
	rep := map[string]any{"industry": "kopi", "area": "kemang", "created": "2026-01-01T00:00:00Z",
		"summary": map[string]any{"businesses": 2, "top3_share": 50}, "digital": map[string]any{"sampled": 1},
		"all": []any{
			map[string]any{"place_id": "p1", "name": "Toko", "rating": 4.8, "reviews": 50.0, "lead_score": 70.0, "_detailed": true, "phone": "0812"},
			map[string]any{"place_id": "p2", "name": "Lain", "rating": 4.0, "reviews": 10.0, "lead_score": 10.0},
		}}
	raw, _ := json.Marshal(rep)
	var rid int64
	e.app.db.QueryRow(context.Background(), `INSERT INTO reports (org_id, industry, area, report) VALUES ($1,'kopi','kemang',$2) RETURNING id`, orgA, raw).Scan(&rid)

	// A melihat semuanya
	code, j = a.get("/market/reports")
	a.must(200, code, j)
	if len(list(j)) != 1 {
		t.Fatalf("A harus punya 1 laporan: %v", j)
	}
	code, j = a.get(fmt.Sprintf("/market/report?id=%d", rid))
	a.must(200, code, j)
	all := j["all"].([]any)
	if all[0].(map[string]any)["lead"].(map[string]any)["note"] != "rahasia A" {
		t.Fatalf("lead tidak tergabung: %v", all[0])
	}
	code, j = a.get("/prospects/data")
	a.must(200, code, j)
	items := j["items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["name"] != "Toko" { // p2 skor 10 < 40 dan tanpa lead
		t.Fatalf("prospek A salah: %v", items)
	}
	code, j = a.get("/watch/data")
	a.must(200, code, j)
	if len(list(j)) != 1 {
		t.Fatalf("watch A: %v", j)
	}
	code, j = a.get("/org/settings")
	a.must(200, code, j)
	if j["offer"] != "jasa A" {
		t.Fatalf("settings A: %v", j)
	}

	// B tidak melihat apa pun milik A
	code, j = b.get("/market/reports")
	b.must(200, code, j)
	if len(list(j)) != 0 {
		t.Fatalf("B bocor laporan A: %v", j)
	}
	code, j = b.get(fmt.Sprintf("/market/report?id=%d", rid))
	b.must(404, code, j)
	code, j = b.get("/prospects/data")
	if len(j["items"].([]any)) != 0 {
		t.Fatalf("B bocor prospek A")
	}
	code, j = b.get("/org/settings")
	if j["offer"] != "" {
		t.Fatalf("B bocor settings A: %v", j)
	}
	code, j = b.post("/market/detail", map[string]any{"report_id": rid, "key": "p1"})
	b.must(400, code, j) // laporan bukan miliknya
}

// ---------- kuota dan job ----------

func TestIntegrationQuotaAndJobs(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("q@x.id", "Q")

	code, j := a.post("/market/run", map[string]string{"industry": "", "area": "x"})
	a.must(400, code, j)
	code, j = a.post("/market/run", map[string]string{"industry": "kopi", "area": "kemang"})
	a.must(200, code, j)
	code, j = a.post("/market/run", map[string]string{"industry": "kopi", "area": "tebet"})
	a.must(409, code, j) // masih ada job antre
	code, j = a.get("/log")
	a.must(200, code, j)
	if j["running"] != true || !strings.Contains(j["log"].(string), "Menunggu") {
		t.Fatalf("log: %v", j)
	}
	code, j = a.post("/stop", nil)
	a.must(200, code, j)
	code, j = a.get("/log")
	if j["running"] != false || j["stopped"] != true {
		t.Fatalf("stop: %v", j)
	}

	// free: 5 riset per bulan, 1 sudah terpakai; perbandingan 3 wilayah = 3
	code, j = a.post("/market/compare/run", map[string]any{"industry": "kopi", "areas": []string{"a", "b", "c"}})
	a.must(200, code, j)
	a.post("/stop", nil)
	code, j = a.post("/market/run", map[string]string{"industry": "kopi", "area": "d"})
	a.must(200, code, j) // ke-5
	a.post("/stop", nil)
	code, j = a.post("/market/run", map[string]string{"industry": "kopi", "area": "e"})
	a.must(402, code, j) // kuota habis
	code, j = a.get("/org")
	if j["usage"].(map[string]any)["market_run"].(float64) != 5 {
		t.Fatalf("usage: %v", j["usage"])
	}

	// pantau: free maks 1
	code, j = a.post("/market/watch", map[string]any{"industry": "kopi", "area": "a", "on": true})
	a.must(200, code, j)
	code, j = a.post("/market/watch", map[string]any{"industry": "kopi", "area": "b", "on": true})
	a.must(402, code, j)
	code, j = a.post("/market/watch", map[string]any{"industry": "kopi", "area": "a", "on": false})
	a.must(200, code, j)
	code, j = a.get("/market/watches")
	if len(list(j)) != 0 {
		t.Fatalf("watch tidak terhapus: %v", j)
	}

	// job antre terlihat oleh worker: simulasikan klaim seperti worker.py
	var id int64
	err := e.app.db.QueryRow(context.Background(), `UPDATE jobs SET status='running' WHERE id=(SELECT id FROM jobs WHERE status='queued' ORDER BY priority,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id`).Scan(&id)
	if err == nil {
		t.Fatalf("semua job sudah dibatalkan, tidak boleh ada yang queued (dapat %d)", id)
	}
}

// ---------- lead ----------

func TestIntegrationLeadValidation(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("l@x.id", "L")
	code, j := a.post("/market/lead", map[string]any{"key": "k", "status": "ngawur"})
	a.must(400, code, j)
	code, j = a.post("/market/lead", map[string]any{"key": "k", "status": "baru", "remind": "besok"})
	a.must(400, code, j)
	code, j = a.post("/market/lead", map[string]any{"key": "k", "name": "N", "status": "baru", "note": "catat", "remind": "2026-12-01"})
	a.must(200, code, j)
	// status berubah, note/remind dipertahankan kalau tidak dikirim
	code, j = a.post("/market/lead", map[string]any{"key": "k", "name": "N", "status": "deal"})
	a.must(200, code, j)
	var status, note, remind string
	e.app.db.QueryRow(context.Background(), `SELECT status, note, to_char(remind,'YYYY-MM-DD') FROM leads WHERE key='k'`).Scan(&status, &note, &remind)
	if status != "deal" || note != "catat" || remind != "2026-12-01" {
		t.Fatalf("lead: %s %s %s", status, note, remind)
	}
}

// ---------- email: verifikasi, reset, undangan ----------

func (e *testEnv) token(kind, email string) string {
	// tes tidak bisa membaca email; ambil token mentah dengan menerbitkan ulang lewat fungsi yang sama
	var uid *string
	var oid *string
	e.app.db.QueryRow(context.Background(), `SELECT user_id, org_id FROM tokens WHERE kind=$1 AND email=$2 ORDER BY created_at DESC LIMIT 1`, kind, email).Scan(&uid, &oid)
	raw, _ := e.app.issueToken(context.Background(), kind, email, uid, oid, time.Hour)
	return raw
}

func TestIntegrationVerifyResetInvite(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("v@x.id", "V")

	// verifikasi
	tok := e.token("verify", "v@x.id")
	resp, _ := a.c.Get(e.srv.URL + "/auth/verify?token=" + tok)
	if resp.StatusCode != 303 || !strings.Contains(resp.Header.Get("Location"), "verified") {
		t.Fatalf("verify: %d %s", resp.StatusCode, resp.Header.Get("Location"))
	}
	_, j := a.get("/auth/me")
	if j["verified"] != true {
		t.Fatal("belum verified")
	}
	resp, _ = a.c.Get(e.srv.URL + "/auth/verify?token=" + tok) // sekali pakai
	if !strings.Contains(resp.Header.Get("Location"), "gagal") {
		t.Fatal("token verify bisa dipakai dua kali")
	}

	// reset password
	code, j := a.post("/auth/forgot", map[string]string{"email": "tidak-ada@x.id"})
	a.must(200, code, j) // tidak membocorkan
	a.post("/auth/forgot", map[string]string{"email": "v@x.id"})
	rt := e.token("reset", "v@x.id")
	code, j = a.post("/auth/reset", map[string]string{"token": rt, "password": "pendek"})
	a.must(400, code, j)
	code, j = a.post("/auth/reset", map[string]string{"token": rt, "password": "passwordbaru1"})
	a.must(200, code, j)
	code, j = a.get("/auth/me")
	a.must(401, code, j) // sesi lama dicabut
	code, j = a.post("/auth/login", map[string]string{"email": "v@x.id", "password": "rahasia123"})
	a.must(401, code, j)
	code, j = a.post("/auth/login", map[string]string{"email": "v@x.id", "password": "passwordbaru1"})
	a.must(200, code, j)

	// undangan: free maks 1 anggota
	code, j = a.post("/org/invite", map[string]string{"email": "w@x.id"})
	a.must(402, code, j)
	e.app.db.Exec(context.Background(), `UPDATE orgs SET plan='pro' WHERE name='V'`)
	a.post("/auth/login", map[string]string{"email": "v@x.id", "password": "passwordbaru1"}) // sesi baru membaca plan baru
	code, j = a.post("/org/invite", map[string]string{"email": "w@x.id"})
	a.must(200, code, j)
	it := e.token("invite", "w@x.id")
	code, j = a.get("/auth/invite?token=" + it)
	a.must(200, code, j)
	if j["org"] != "V" || j["email"] != "w@x.id" {
		t.Fatalf("info undangan: %v", j)
	}
	// email lain tidak boleh memakai undangan ini
	z := e.client()
	code, j = z.post("/auth/register", map[string]string{"email": "z@x.id", "password": "rahasia123", "invite": it})
	z.must(200, code, j)
	_, j = z.get("/auth/me")
	if len(j["orgs"].([]any)) != 1 || j["orgs"].([]any)[0].(map[string]any)["Name"] == "V" {
		t.Fatalf("z tidak boleh masuk V: %v", j["orgs"])
	}
	// email yang benar masuk V tanpa org pribadi, langsung verified
	w := e.client()
	code, j = w.post("/auth/register", map[string]string{"email": "w@x.id", "password": "rahasia123", "invite": it})
	w.must(200, code, j)
	_, j = w.get("/auth/me")
	orgs := j["orgs"].([]any)
	if len(orgs) != 1 || orgs[0].(map[string]any)["Name"] != "V" || j["role"] != "member" || j["verified"] != true {
		t.Fatalf("w: %v", j)
	}
	// member tidak boleh mengundang atau checkout; owner bisa mengeluarkan
	code, j = w.post("/org/invite", map[string]string{"email": "x@x.id"})
	w.must(403, code, j)
	code, j = w.post("/billing/checkout", map[string]string{"plan": "team"})
	w.must(403, code, j)
	code, j = a.post("/org/remove-member", map[string]string{"email": "w@x.id"})
	a.must(200, code, j)
	code, j = w.get("/auth/me")
	w.must(401, code, j) // sesi w di org V dicabut
}

// ---------- tagihan ----------

func TestIntegrationBilling(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("bill@x.id", "Bill")

	code, j := a.get("/billing/plans")
	a.must(200, code, j)
	if j["provider"] != "manual" {
		t.Fatalf("provider: %v", j)
	}
	code, j = a.post("/billing/checkout", map[string]string{"plan": "ultra"})
	a.must(400, code, j)
	code, j = a.post("/billing/checkout", map[string]string{"plan": "pro"})
	a.must(200, code, j)
	code, j = a.get("/billing/invoices")
	inv := j["invoices"].([]any)
	if len(inv) != 1 || inv[0].(map[string]any)["status"] != "pending" {
		t.Fatalf("invoices: %v", inv)
	}

	// webhook: token wajib
	t.Setenv("XENDIT_CALLBACK_TOKEN", "cb-tes")
	req, _ := http.NewRequest("POST", e.srv.URL+"/billing/webhook/xendit", strings.NewReader(`{"external_id":"ext-1","status":"PAID","paid_amount":149000}`))
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != 401 {
		t.Fatalf("webhook tanpa token: %d", resp.StatusCode)
	}
	// invoice xendit pending disuntik lalu dibayar lewat webhook
	var orgID string
	e.app.db.QueryRow(context.Background(), `SELECT id FROM orgs WHERE name='Bill'`).Scan(&orgID)
	e.app.db.Exec(context.Background(), `INSERT INTO invoices (org_id, provider, external_id, plan, amount) VALUES ($1,'xendit','ext-1','pro',149000)`, orgID)
	req, _ = http.NewRequest("POST", e.srv.URL+"/billing/webhook/xendit", strings.NewReader(`{"external_id":"ext-1","status":"PAID","paid_amount":100}`))
	req.Header.Set("x-callback-token", "cb-tes")
	http.DefaultClient.Do(req) // bayar kurang: tidak aktif
	var plan string
	e.app.db.QueryRow(context.Background(), `SELECT plan FROM orgs WHERE id=$1`, orgID).Scan(&plan)
	if plan != "free" {
		t.Fatal("bayar kurang tidak boleh mengaktifkan paket")
	}
	req, _ = http.NewRequest("POST", e.srv.URL+"/billing/webhook/xendit", strings.NewReader(`{"external_id":"ext-1","status":"PAID","paid_amount":149000}`))
	req.Header.Set("x-callback-token", "cb-tes")
	resp, _ = http.DefaultClient.Do(req)
	if resp.StatusCode != 200 {
		t.Fatalf("webhook: %d", resp.StatusCode)
	}
	var until *time.Time
	e.app.db.QueryRow(context.Background(), `SELECT plan, plan_until FROM orgs WHERE id=$1`, orgID).Scan(&plan, &until)
	if plan != "pro" || until == nil || until.Before(time.Now().Add(29*24*time.Hour)) {
		t.Fatalf("paket tidak aktif: %s %v", plan, until)
	}
	// masa habis -> turun ke free
	e.app.db.Exec(context.Background(), `UPDATE orgs SET plan_until = now() - interval '1 day' WHERE id=$1`, orgID)
	e.app.expirePlans(context.Background())
	e.app.db.QueryRow(context.Background(), `SELECT plan FROM orgs WHERE id=$1`, orgID).Scan(&plan)
	if plan != "free" {
		t.Fatal("paket kedaluwarsa tidak turun ke free")
	}
}

// ---------- hapus akun ----------

func TestIntegrationDeleteAccount(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("del@x.id", "Del")
	a.post("/market/lead", map[string]any{"key": "k", "status": "baru"})
	code, j := a.post("/auth/delete-account", map[string]string{"password": "salah"})
	a.must(401, code, j)
	code, j = a.post("/auth/delete-account", map[string]string{"password": "rahasia123"})
	a.must(200, code, j)
	var n int
	e.app.db.QueryRow(context.Background(), `SELECT count(*) FROM orgs WHERE name='Del'`).Scan(&n)
	if n != 0 {
		t.Fatal("org tidak ikut terhapus")
	}
	e.app.db.QueryRow(context.Background(), `SELECT count(*) FROM leads`).Scan(&n)
	if n != 0 {
		t.Fatal("lead tidak ikut terhapus (cascade)")
	}
	code, j = a.post("/auth/login", map[string]string{"email": "del@x.id", "password": "rahasia123"})
	a.must(401, code, j)
}

// ---------- CSRF ----------

func TestIntegrationCSRF(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("c@x.id", "C")
	req, _ := http.NewRequest("POST", e.srv.URL+"/market/lead", strings.NewReader(`{"key":"k","status":"baru"}`))
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	resp, _ := a.c.Do(req)
	if resp.StatusCode != 403 {
		t.Fatalf("lintas situs harus 403, dapat %d", resp.StatusCode)
	}
}
