package main

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// ---------- SSRF guard ----------

func TestIsBlockedIP(t *testing.T) {
	blocked := []string{"127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
		"100.64.0.1", "100.127.255.254", "0.0.0.0", "224.0.0.1", "240.0.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12::1",
		"ff02::1", "64:ff9b::a00:1", "::ffff:10.0.0.1"}
	for _, s := range blocked {
		if !isBlockedIP(net.ParseIP(s)) {
			t.Errorf("%s harus ditolak", s)
		}
	}
	for _, s := range []string{"8.8.8.8", "1.1.1.1", "203.0.113.9", "2606:4700::1111"} {
		if isBlockedIP(net.ParseIP(s)) {
			t.Errorf("%s harus boleh", s)
		}
	}
	if !isBlockedIP(nil) {
		t.Error("nil harus ditolak")
	}
}

func TestSafeHTTPClientRejectsPrivateAndRedirect(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/redir" {
			http.Redirect(w, r, "http://127.0.0.1:1/", http.StatusFound)
			return
		}
		w.WriteHeader(204)
	}))
	defer srv.Close()

	// tanpa ALLOW_INSECURE_WEBHOOK: loopback ditolak di Dialer.Control, sebelum koneksi terbentuk
	t.Setenv("ALLOW_INSECURE_WEBHOOK", "")
	_, err := safeHTTPClient(3 * time.Second).Get(srv.URL)
	if err == nil || !strings.Contains(err.Error(), "ditolak") {
		t.Fatalf("loopback harus ditolak, dapat %v", err)
	}
	// alamat privat juga ditolak tanpa mencoba menyambung (10.255.255.1 tidak ada, tetapi error harus 'ditolak', bukan timeout)
	cl := safeHTTPClient(2 * time.Second)
	_, err = cl.Get("http://10.255.255.1:9/")
	if err == nil || !strings.Contains(err.Error(), "ditolak") {
		t.Fatalf("IP privat harus ditolak, dapat %v", err)
	}
	_, err = cl.Get("http://169.254.169.254/latest/meta-data/")
	if err == nil || !strings.Contains(err.Error(), "ditolak") {
		t.Fatalf("metadata cloud harus ditolak, dapat %v", err)
	}

	// mode tes: loopback boleh, tetapi redirect tetap tidak diikuti
	t.Setenv("ALLOW_INSECURE_WEBHOOK", "1")
	cl = safeHTTPClient(3 * time.Second)
	resp, err := cl.Get(srv.URL)
	if err != nil || resp.StatusCode != 204 {
		t.Fatalf("loopback dengan ALLOW_INSECURE_WEBHOOK harus jalan: %v", err)
	}
	resp.Body.Close()
	resp, err = cl.Get(srv.URL + "/redir")
	if err == nil || !errors.Is(err, errRedirect) {
		if resp != nil {
			resp.Body.Close()
		}
		t.Fatalf("redirect harus ditolak, dapat %v", err)
	}
	// privat tetap ditolak walau mode tes
	if _, err = cl.Get("http://10.255.255.1:9/"); err == nil || !strings.Contains(err.Error(), "ditolak") {
		t.Fatalf("IP privat harus tetap ditolak di mode tes, dapat %v", err)
	}
}

func TestValidateWebhookURL(t *testing.T) {
	t.Setenv("ALLOW_INSECURE_WEBHOOK", "")
	ok := []string{"", "https://hooks.example.com/raqio", "https://1.1.1.1/x"}
	for _, u := range ok {
		if err := validateWebhookURL(u); err != nil {
			t.Errorf("%q harus valid: %v", u, err)
		}
	}
	bad := []string{"http://hooks.example.com/x", "ftp://x.example.com", "https://user:pw@hooks.example.com/",
		"https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://169.254.169.254/", "https://[::1]/",
		"https://legacy/", "https://postgres.internal/", "https://x.local/", "bukan url", "https://" + strings.Repeat("a", 500) + ".com"}
	for _, u := range bad {
		if err := validateWebhookURL(u); err == nil {
			t.Errorf("%q harus ditolak", u)
		}
	}
	t.Setenv("ALLOW_INSECURE_WEBHOOK", "1")
	for _, u := range []string{"http://127.0.0.1:8081/hook", "http://localhost:1/x"} {
		if err := validateWebhookURL(u); err != nil {
			t.Errorf("mode tes: %q harus valid: %v", u, err)
		}
	}
	if validateWebhookURL("http://10.0.0.5/x") == nil {
		t.Error("mode tes tetap menolak IP privat non-loopback")
	}
}

func TestRedactErr(t *testing.T) {
	t.Setenv("TELEGRAM_BOT_TOKEN", "123456:ABC-def_ghi")
	err := errors.New(`Post "https://api.telegram.org/bot123456:ABC-def_ghi/sendMessage": dial tcp: timeout`)
	got := redactErr(err)
	if strings.Contains(got, "ABC-def") || !strings.Contains(got, "bot[redacted]") || !strings.Contains(got, "timeout") {
		t.Fatalf("redaksi: %q", got)
	}
	if redactErr(nil) != "" {
		t.Fatal("nil harus kosong")
	}
}

// ---------- sanitasi header email ----------

func TestMailHeaderSanitised(t *testing.T) {
	if got := headerSafe("Halo\r\nBcc: spam@x.id\x00"); got != "HaloBcc: spam@x.id" {
		t.Fatalf("headerSafe: %q", got)
	}
	subj := encodeSubject("Pantau \"Kopi\"\r\nBcc: spam@x.id ☕")
	if strings.ContainsAny(subj, "\r\n") || !strings.HasPrefix(subj, "=?utf-8?q?") {
		t.Fatalf("subject: %q", subj)
	}
	if _, err := parseRecipient("a@x.id\r\nBcc: b@x.id"); err == nil {
		t.Fatal("penerima dengan CRLF harus ditolak")
	}
	if _, err := parseRecipient("bukan email"); err == nil {
		t.Fatal("penerima tidak valid harus ditolak")
	}
	if got, err := parseRecipient("  Nama <a@x.id> "); err != nil || got != "a@x.id" {
		t.Fatalf("parseRecipient: %q %v", got, err)
	}
	// Mailer dev: alamat tidak valid dibalas error, tidak dicatat sebagai terkirim
	if err := (&Mailer{}).Send("x\r\ny", "s", "b"); err == nil {
		t.Fatal("Send ke alamat tidak valid harus error")
	}
}

// ---------- clientIP dan proxy tepercaya ----------

func TestClientIPTrustedProxies(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "")
	mk := func(remote, xff string) string {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = remote
		if xff != "" {
			r.Header.Set("X-Forwarded-For", xff)
		}
		return clientIP(r)
	}
	// koneksi langsung dari internet: XFF diabaikan sepenuhnya
	if got := mk("203.0.113.5:4000", "1.2.3.4"); got != "203.0.113.5" {
		t.Fatalf("XFF dari remote tidak tepercaya harus diabaikan: %s", got)
	}
	// dari proxy tepercaya: ambil dari kanan melewati proxy tepercaya, bukan paling kiri (yang bisa dipalsukan)
	if got := mk("10.0.0.1:1", "9.9.9.9, 1.2.3.4, 10.0.0.2"); got != "1.2.3.4" {
		t.Fatalf("harus 1.2.3.4, dapat %s", got)
	}
	if got := mk("127.0.0.1:1", "spoof, 5.6.7.8"); got != "5.6.7.8" {
		t.Fatalf("harus 5.6.7.8, dapat %s", got)
	}
	if got := mk("127.0.0.1:1", "bukan-ip"); got != "127.0.0.1" {
		t.Fatalf("XFF rusak harus kembali ke RemoteAddr, dapat %s", got)
	}
	if got := mk("[::1]:1", "2001:db8::7"); got != "2001:db8::7" {
		t.Fatalf("ipv6: %s", got)
	}
	// daftar proxy khusus: jaringan privat tidak lagi otomatis dipercaya
	t.Setenv("TRUSTED_PROXIES", "203.0.113.0/24")
	if got := mk("203.0.113.5:1", "1.2.3.4"); got != "1.2.3.4" {
		t.Fatalf("proxy khusus: %s", got)
	}
	if got := mk("10.0.0.1:1", "1.2.3.4"); got != "10.0.0.1" {
		t.Fatalf("10/8 tidak tepercaya lagi: %s", got)
	}
}

// ---------- util ----------

func TestTruncRune(t *testing.T) {
	if got := trunc("héllo wörld", 5); got != "héllo" {
		t.Fatalf("trunc rune: %q", got)
	}
	if got := trunc("☕☕☕", 2); got != "☕☕" {
		t.Fatalf("trunc emoji: %q", got)
	}
	if got := trunc("  abc  ", 10); got != "abc" {
		t.Fatalf("trunc trim: %q", got)
	}
}

func TestCheckAuthSecret(t *testing.T) {
	if checkAuthSecret("ganti-dengan-string-acak-panjang-sekali-sekali") == nil {
		t.Fatal("placeholder harus ditolak")
	}
	if checkAuthSecret("pendek") == nil {
		t.Fatal("pendek harus ditolak")
	}
	if err := checkAuthSecret("3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"); err != nil {
		t.Fatal(err)
	}
}

func TestHourCounterAndLimiterSweep(t *testing.T) {
	now := time.Unix(0, 0)
	c := &hourCounter{now: func() time.Time { return now }}
	for i := 0; i < 3; i++ {
		if !c.take(3) {
			t.Fatal("slot harus ada")
		}
	}
	if c.take(3) {
		t.Fatal("slot habis")
	}
	now = now.Add(time.Hour)
	if !c.take(3) {
		t.Fatal("jam baru harus reset")
	}
	// sweep tidak boleh membuang bucket yang belum terisi penuh (itu sama dengan isi ulang gratis)
	l := &limiter{rate: 5.0 / 3600, burst: 5, m: map[string]*bucket{}, now: func() time.Time { return now }}
	for i := 0; i < 5; i++ {
		l.allow("ip")
	}
	now = now.Add(15 * time.Minute)
	l.sweep()
	if l.allow("ip") && l.allow("ip") {
		t.Fatal("setelah 15 menit baru ada 1 token (5 per jam), bukan burst penuh")
	}
}

func TestMetricsAllowed(t *testing.T) {
	r := httptest.NewRequest("GET", "/metrics", nil)
	r.RemoteAddr = "203.0.113.9:1"
	t.Setenv("METRICS_TOKEN", "")
	t.Setenv("APP_ENV", "")
	if !metricsAllowed(r) {
		t.Fatal("dev tanpa token: terbuka")
	}
	t.Setenv("APP_ENV", "production")
	if metricsAllowed(r) {
		t.Fatal("produksi tanpa token: IP publik ditolak")
	}
	r.RemoteAddr = "10.0.0.7:1"
	if !metricsAllowed(r) {
		t.Fatal("produksi tanpa token: IP privat boleh")
	}
	t.Setenv("METRICS_TOKEN", "rahasia-metrik")
	r.RemoteAddr = "203.0.113.9:1"
	if metricsAllowed(r) {
		t.Fatal("token diset: tanpa header ditolak")
	}
	r.Header.Set("Authorization", "Bearer rahasia-metrik")
	if !metricsAllowed(r) {
		t.Fatal("token cocok harus boleh")
	}
}

// ---------- integrasi ----------

func TestIntegrationLockoutBackoffPerEmailIP(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("lock2@x.id", "L2")
	a.post("/auth/logout", nil)
	for i := 0; i < 4; i++ {
		code, _ := a.post("/auth/login", map[string]string{"email": "lock2@x.id", "password": "salah"})
		if code != 401 {
			t.Fatalf("gagal ke-%d harus 401, dapat %d", i+1, code)
		}
	}
	a.post("/auth/login", map[string]string{"email": "lock2@x.id", "password": "salah"}) // ke-5: kunci 1 menit
	code, j := a.post("/auth/login", map[string]string{"email": "lock2@x.id", "password": "rahasia123"})
	a.must(429, code, j)
	ctx := context.Background()
	var fails int
	var until *time.Time
	key := loginKey("lock2@x.id", "127.0.0.1")
	e.app.db.QueryRow(ctx, `SELECT fails, locked_until FROM login_attempts WHERE key=$1`, key).Scan(&fails, &until)
	if fails != 5 || until == nil || until.After(time.Now().Add(2*time.Minute)) {
		t.Fatalf("kunci 1 menit: fails=%d until=%v", fails, until)
	}
	// backoff progresif: 10 gagal = 15 menit, 20 = 1 jam
	e.app.db.Exec(ctx, `UPDATE login_attempts SET fails=9, locked_until=NULL WHERE key=$1`, key)
	a.post("/auth/login", map[string]string{"email": "lock2@x.id", "password": "salah"})
	e.app.db.QueryRow(ctx, `SELECT locked_until FROM login_attempts WHERE key=$1`, key).Scan(&until)
	if until == nil || until.Before(time.Now().Add(14*time.Minute)) || until.After(time.Now().Add(16*time.Minute)) {
		t.Fatalf("kunci 15 menit: %v", until)
	}
	e.app.db.Exec(ctx, `UPDATE login_attempts SET fails=19, locked_until=NULL WHERE key=$1`, key)
	a.post("/auth/login", map[string]string{"email": "lock2@x.id", "password": "salah"})
	e.app.db.QueryRow(ctx, `SELECT locked_until FROM login_attempts WHERE key=$1`, key).Scan(&until)
	if until == nil || until.Before(time.Now().Add(59*time.Minute)) {
		t.Fatalf("kunci 1 jam: %v", until)
	}
	// IP lain (lewat XFF dari proxy tepercaya 127.0.0.1) tidak ikut terkunci: penyerang tidak bisa mengunci korban
	req, _ := http.NewRequest("POST", e.srv.URL+"/auth/login", strings.NewReader(`{"email":"lock2@x.id","password":"rahasia123"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", "203.0.113.77")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("login dari IP lain harus 200, dapat %d", resp.StatusCode)
	}
	// email yang tidak terdaftar: tetap 401 dan juga dicatat (bcrypt dummy dijalankan)
	code, _ = a.post("/auth/login", map[string]string{"email": "tidak-ada@x.id", "password": "apa saja"})
	if code != 401 {
		t.Fatalf("email tak dikenal harus 401, dapat %d", code)
	}
}

func TestIntegrationAPIKeyBoundToMembership(t *testing.T) {
	e := setupIntegration(t)
	o := e.client()
	o.register("own@x.id", "KeyOrg")
	ctx := context.Background()
	e.app.db.Exec(ctx, `UPDATE orgs SET plan='team' WHERE name='KeyOrg'`)
	e.app.db.Exec(ctx, `UPDATE users SET email_verified_at=now() WHERE email='own@x.id'`)
	o.post("/auth/login", map[string]string{"email": "own@x.id", "password": "rahasia123"})

	// admin masuk lewat undangan (langsung terverifikasi), lalu membuat key peran admin
	code, j := o.post("/org/invite", map[string]string{"email": "adm@x.id", "role": "admin"})
	o.must(200, code, j)
	it := e.token("invite", "adm@x.id")
	adm := e.client()
	code, j = adm.post("/auth/register", map[string]string{"email": "adm@x.id", "password": "rahasia123", "invite": it})
	adm.must(200, code, j)
	code, j = adm.post("/org/api-keys", map[string]string{"label": "ci", "role": "admin"})
	adm.must(200, code, j)
	key := j["key"].(string)
	code, j = bearer(t, e.srv.URL, "GET", "/auth/me", key, nil)
	if code != 200 || j["role"] != "admin" {
		t.Fatalf("key admin: %d %v", code, j)
	}
	// key tidak boleh membuat key baru atau mengundang
	code, _ = bearer(t, e.srv.URL, "POST", "/org/api-keys", key, map[string]string{"label": "x"})
	if code != 403 {
		t.Fatalf("key membuat key harus 403, dapat %d", code)
	}
	code, _ = bearer(t, e.srv.URL, "POST", "/org/invite", key, map[string]string{"email": "z@x.id"})
	if code != 403 {
		t.Fatalf("key mengundang harus 403, dapat %d", code)
	}
	// pembuat diturunkan jadi viewer: peran efektif key ikut turun
	e.app.db.Exec(ctx, `UPDATE memberships SET role='viewer' WHERE user_id=(SELECT id FROM users WHERE email='adm@x.id')`)
	code, j = bearer(t, e.srv.URL, "GET", "/auth/me", key, nil)
	if code != 200 || j["role"] != "viewer" {
		t.Fatalf("peran efektif harus viewer: %d %v", code, j)
	}
	code, _ = bearer(t, e.srv.URL, "POST", "/market/lead", key, map[string]any{"key": "k", "name": "n", "status": "baru"})
	if code != 403 {
		t.Fatalf("viewer lewat key tidak boleh menulis, dapat %d", code)
	}
	// dikeluarkan dari org: key dicabut
	code, j = o.post("/org/remove-member", map[string]string{"email": "adm@x.id"})
	o.must(200, code, j)
	code, _ = bearer(t, e.srv.URL, "GET", "/auth/me", key, nil)
	if code != 401 {
		t.Fatalf("key setelah removeMember harus 401, dapat %d", code)
	}
	var revoked *time.Time
	e.app.db.QueryRow(ctx, `SELECT revoked_at FROM api_keys WHERE label='ci'`).Scan(&revoked)
	if revoked == nil {
		t.Fatal("revoked_at harus terisi")
	}

	// ganti password owner mencabut key owner, bukan key orang lain
	code, j = o.post("/org/api-keys", map[string]string{"label": "own", "role": "analyst"})
	o.must(200, code, j)
	okey := j["key"].(string)
	code, j = o.post("/auth/change-password", map[string]string{"old": "rahasia123", "new": "rahasia456"})
	o.must(200, code, j)
	if code, _ = bearer(t, e.srv.URL, "GET", "/auth/me", okey, nil); code != 401 {
		t.Fatalf("key setelah ganti password harus 401, dapat %d", code)
	}
	// last_used_at tertulis sinkron saat pertama dipakai
	code, j = o.post("/org/api-keys", map[string]string{"label": "lu", "role": "analyst"})
	o.must(200, code, j)
	bearer(t, e.srv.URL, "GET", "/auth/me", j["key"].(string), nil)
	var used *time.Time
	e.app.db.QueryRow(ctx, `SELECT last_used_at FROM api_keys WHERE label='lu'`).Scan(&used)
	if used == nil {
		t.Fatal("last_used_at harus terisi setelah dipakai")
	}
}

func TestIntegrationGuestLimits(t *testing.T) {
	e := setupIntegration(t)
	g := e.client()
	code, j := g.post("/auth/guest", map[string]string{})
	g.must(200, code, j)
	_, j = g.get("/auth/me")
	if j["guest"] != true {
		t.Fatalf("me harus menandai tamu: %v", j)
	}
	// tamu tidak bisa membuat API key walau owner org tamunya
	code, j = g.post("/org/api-keys", map[string]string{"label": "x"})
	g.must(403, code, j)
	code, j = g.post("/org/invite", map[string]string{"email": "y@x.id"})
	if code != 403 && code != 402 {
		t.Fatalf("tamu mengundang: %d %v", code, j)
	}
	// batas global per jam
	t.Setenv("GUEST_MAX_PER_HOUR", "1")
	guestGlobal = newHourCounter()
	code, _ = e.client().post("/auth/guest", map[string]string{})
	if code != 200 {
		t.Fatalf("tamu pertama dalam jam ini harus 200, dapat %d", code)
	}
	code, _ = e.client().post("/auth/guest", map[string]string{})
	if code != 429 {
		t.Fatalf("melewati GUEST_MAX_PER_HOUR harus 429, dapat %d", code)
	}
	guestGlobal = newHourCounter()
	// klaim dengan email yang sudah terdaftar: 200 existing, akun tamu tidak berubah
	reg := e.client()
	reg.register("ada@x.id", "Ada")
	code, j = g.post("/auth/claim-guest", map[string]string{"email": "ada@x.id", "password": "rahasia123"})
	g.must(200, code, j)
	if j["existing"] != true {
		t.Fatalf("klaim email terdaftar: %v", j)
	}
	_, j = g.get("/auth/me")
	if j["plan"] != "guest" {
		t.Fatalf("akun tamu harus tetap tamu: %v", j)
	}
}

func TestIntegrationCSRFOriginAndContentType(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("csrf@x.id", "C2")
	t.Setenv("APP_URL", "https://app.raqio.test")
	send := func(path, origin, ctype, body string) int {
		req, _ := http.NewRequest("POST", e.srv.URL+path, strings.NewReader(body))
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		if ctype != "" {
			req.Header.Set("Content-Type", ctype)
		}
		resp, err := a.c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	lead := `{"key":"k","name":"n","status":"baru"}`
	if c := send("/market/lead", "https://evil.example", "application/json", lead); c != 403 {
		t.Fatalf("Origin asing harus 403, dapat %d", c)
	}
	if c := send("/market/lead", "null", "application/json", lead); c != 403 {
		t.Fatalf("Origin null harus 403, dapat %d", c)
	}
	if c := send("/market/lead", "https://app.raqio.test", "application/json", lead); c != 200 {
		t.Fatalf("Origin = APP_URL harus 200, dapat %d", c)
	}
	if c := send("/market/lead", "http://"+e.srv.Listener.Addr().String(), "application/json", lead); c != 200 {
		t.Fatalf("Origin = Host harus 200, dapat %d", c)
	}
	if c := send("/market/lead", "", "text/plain", lead); c != 415 {
		t.Fatalf("text/plain harus 415 (login CSRF lewat form sederhana), dapat %d", c)
	}
	if c := send("/market/lead", "", "application/x-www-form-urlencoded", "key=k"); c != 415 {
		t.Fatalf("form harus 415, dapat %d", c)
	}
	// endpoint auth tanpa sesi juga dijaga
	if c := send("/auth/login", "https://evil.example", "application/json", `{"email":"csrf@x.id","password":"rahasia123"}`); c != 403 {
		t.Fatalf("login lintas situs harus 403, dapat %d", c)
	}
	if c := send("/auth/guest", "", "text/plain", "{}"); c != 415 {
		t.Fatalf("guest text/plain harus 415, dapat %d", c)
	}
	// logout lewat form HTML (Nav.tsx) tetap jalan
	if c := send("/auth/logout", "https://app.raqio.test", "application/x-www-form-urlencoded", ""); c != 200 {
		t.Fatalf("logout form harus 200, dapat %d", c)
	}
}

func TestIntegrationVerifiedRequiredAndFirstVerifyRevokes(t *testing.T) {
	e := setupIntegration(t)
	a := e.client()
	a.register("unv@x.id", "Unv")
	ctx := context.Background()
	e.app.db.Exec(ctx, `UPDATE orgs SET plan='pro' WHERE name='Unv'`)
	a.post("/auth/login", map[string]string{"email": "unv@x.id", "password": "rahasia123"})

	for _, c := range []struct {
		path string
		body any
	}{
		{"/org/api-keys", map[string]string{"label": "x"}},
		{"/org/invite", map[string]string{"email": "y@x.id"}},
		{"/billing/checkout", map[string]string{"plan": "pro"}},
		{"/org/settings", map[string]string{"webhook_url": "https://hooks.example.com/x"}},
		{"/org/settings", map[string]string{"notify_email": "n@x.id"}},
	} {
		code, j := a.post(c.path, c.body)
		if code != 403 || !strings.Contains(j["error"].(string), "Verifikasi") {
			t.Fatalf("%s belum verifikasi harus 403 'Verifikasi email dulu', dapat %d %v", c.path, code, j)
		}
	}
	// pengaturan yang bukan saluran keluar tetap boleh
	code, j := a.post("/org/settings", map[string]any{"offer": "jasa"})
	a.must(200, code, j)
	code, j = a.post("/auth/resend-verify", nil)
	a.must(200, code, j)

	// skenario pre-account takeover: ada sesi lain dan API key (disuntik) sebelum pemilik email memverifikasi
	b := e.client()
	b.post("/auth/login", map[string]string{"email": "unv@x.id", "password": "rahasia123"})
	var uid, oid string
	e.app.db.QueryRow(ctx, `SELECT u.id, m.org_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email='unv@x.id'`).Scan(&uid, &oid)
	raw := apiKeyPrefix + newRawToken()
	e.app.db.Exec(ctx, `INSERT INTO api_keys (org_id, created_by, label, prefix, hash, role) VALUES ($1,$2,'lama',$3,$4,'admin')`, oid, uid, raw[:11], hashToken(raw))
	if code, _ := bearer(t, e.srv.URL, "GET", "/auth/me", raw, nil); code != 200 {
		t.Fatalf("key sebelum verifikasi harus jalan: %d", code)
	}
	tok := e.token("verify", "unv@x.id")
	resp, _ := a.c.Get(e.srv.URL + "/auth/verify?token=" + tok)
	if resp.StatusCode != 303 || !strings.Contains(resp.Header.Get("Location"), "verified") {
		t.Fatalf("verify: %d", resp.StatusCode)
	}
	code, j = a.get("/auth/me")
	a.must(200, code, j) // sesi yang memverifikasi tetap hidup
	if code, _ = b.get("/auth/me"); code != 401 {
		t.Fatalf("sesi lain harus dicabut saat verifikasi pertama, dapat %d", code)
	}
	if code, _ = bearer(t, e.srv.URL, "GET", "/auth/me", raw, nil); code != 401 {
		t.Fatalf("API key lama harus dicabut saat verifikasi pertama, dapat %d", code)
	}
	code, j = a.post("/org/api-keys", map[string]string{"label": "baru"})
	a.must(200, code, j)
	code, j = a.post("/org/settings", map[string]string{"webhook_url": "https://hooks.example.com/x"})
	a.must(200, code, j)

	// undangan: user lain yang sudah ada menerima lewat accept-invite; token sekali pakai
	x := e.client()
	x.register("x2@x.id", "X2")
	code, j = a.post("/org/invite", map[string]string{"email": "x2@x.id", "role": "viewer"})
	a.must(200, code, j)
	it := e.token("invite", "x2@x.id")
	code, j = x.post("/auth/accept-invite", map[string]string{"token": it})
	x.must(200, code, j)
	_, j = x.get("/auth/me")
	if j["org_id"] != oid || j["role"] != "viewer" {
		t.Fatalf("accept-invite: %v", j)
	}
	code, j = x.post("/auth/accept-invite", map[string]string{"token": it})
	x.must(400, code, j)
	// batas anggota pro = 3: 2 anggota + 1 undangan pending = penuh, undangan berikutnya 402
	code, j = a.post("/org/invite", map[string]string{"email": "x3@x.id"})
	a.must(200, code, j)
	code, j = a.post("/org/invite", map[string]string{"email": "x4@x.id"})
	a.must(402, code, j)
}

func TestIntegrationDeleteAccountOwnerTransfer(t *testing.T) {
	e := setupIntegration(t)
	o := e.client()
	o.register("boss@x.id", "Tim")
	ctx := context.Background()
	e.app.db.Exec(ctx, `UPDATE orgs SET plan='team' WHERE name='Tim'`)
	e.app.db.Exec(ctx, `UPDATE users SET email_verified_at=now() WHERE email='boss@x.id'`)
	o.post("/auth/login", map[string]string{"email": "boss@x.id", "password": "rahasia123"})
	join := func(email, role string) *client {
		code, j := o.post("/org/invite", map[string]string{"email": email, "role": role})
		o.must(200, code, j)
		c := e.client()
		code, j = c.post("/auth/register", map[string]string{"email": email, "password": "rahasia123", "invite": e.token("invite", email)})
		c.must(200, code, j)
		return c
	}
	an := join("analis@x.id", "analyst") // bergabung lebih dulu (tertua)
	ad := join("admin@x.id", "admin")

	code, j := o.post("/auth/delete-account", map[string]string{"password": "rahasia123"})
	o.must(409, code, j)
	code, j = o.post("/auth/delete-account", map[string]any{"password": "rahasia123", "force": true})
	o.must(200, code, j)
	// admin jadi owner (diutamakan dari anggota tertua), org dan data tetap ada
	_, j = ad.get("/auth/me")
	if j["role"] != "owner" {
		t.Fatalf("admin harus jadi owner: %v", j)
	}
	_, j = an.get("/auth/me")
	if j["role"] != "analyst" {
		t.Fatalf("analyst tidak berubah: %v", j)
	}
	var n int
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM orgs WHERE name='Tim'`).Scan(&n)
	if n != 1 {
		t.Fatal("org dengan anggota lain tidak boleh terhapus")
	}
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM audit_log WHERE user_id IS NULL AND ip<>''`).Scan(&n)
	if n != 0 {
		t.Fatalf("IP audit_log user yang dihapus harus dianonimkan, masih %d baris", n)
	}
	code, _ = o.post("/auth/login", map[string]string{"email": "boss@x.id", "password": "rahasia123"})
	if code != 401 {
		t.Fatalf("akun terhapus harus 401, dapat %d", code)
	}
}
