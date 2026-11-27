package main

import (
	"context"
	"strings"
	"testing"
)

func TestInviteCodeFormat(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		c := newInviteCode()
		if len(c) != len("RAQIO-XXXX-XXXX-XXXX") || !strings.HasPrefix(c, "RAQIO-") {
			t.Fatalf("bentuk kode salah: %q", c)
		}
		n := normalizeInviteCode(c)
		if n == "" || formatInviteCore(n) != strings.TrimPrefix(c, "RAQIO-") {
			t.Fatalf("kode %q tidak kembali utuh: %q", c, n)
		}
		if seen[c] {
			t.Fatalf("kode kembar: %q", c)
		}
		seen[c] = true
	}
}

func TestNormalizeInviteCode(t *testing.T) {
	for in, want := range map[string]string{
		"RAQIO-AB12-CD34-EF56":     "AB12CD34EF56",
		" raqio ab12 cd34 ef56 ":   "AB12CD34EF56",
		"ab12-cd34-ef56":           "AB12CD34EF56",
		"RAQIO-AB12-CD34-EF5":      "", // kurang satu karakter
		"RAQIO-AB12-CD34-EF5U":     "", // U bukan alfabet Crockford
		"RAQIO-AB12-CD34-EF56-XYZ": "", // kelebihan
		"":                         "",
	} {
		if got := normalizeInviteCode(in); got != want {
			t.Errorf("normalizeInviteCode(%q) = %q, harap %q", in, got, want)
		}
	}
	if inviteCodeHash("raqio-ab12-cd34-ef56") != inviteCodeHash("RAQIO AB12 CD34 EF56") {
		t.Error("hash harus sama untuk penulisan yang berbeda")
	}
	if inviteCodeHash("bukan kode") != "" {
		t.Error("kode rusak harus menghasilkan hash kosong")
	}
}

// Alur akses lewat undangan: login email asing ditolak dan dicatat, tamu ditutup, daftar wajib kode,
// kode sekali pakai, akun yang sudah ada tetap bisa masuk.
func TestInviteOnlyFlow(t *testing.T) {
	e := setupIntegration(t)
	ctx := context.Background()
	c := e.client()

	// akun lama dibuat sebelum invite-only menyala
	code, j := c.post("/auth/register", map[string]string{"email": "lama@x.id", "password": "rahasia123", "name": "Lama"})
	c.must(200, code, j)
	t.Setenv("INVITE_ONLY", "1")

	code, j = c.get("/auth/access")
	c.must(200, code, j)
	if j["invite_only"] != true || j["guest"] != false {
		t.Fatalf("kebijakan akses salah: %v", j)
	}

	// login email yang belum terdaftar: 403 invite_only, dicatat sekali per jam
	for i := 0; i < 2; i++ {
		code, j = e.client().post("/auth/login", map[string]string{"email": "Penasaran@X.id", "password": "apa-saja-123"})
		if code != 403 || j["code"] != "invite_only" || !strings.Contains(j["error"].(string), "undangan") {
			t.Fatalf("login email asing harus invite_only: %d %v", code, j)
		}
	}
	var n int
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM access_requests WHERE email='penasaran@x.id' AND source='login'`).Scan(&n)
	if n != 1 {
		t.Fatalf("percobaan login harus tercatat tepat sekali per jam, dapat %d", n)
	}

	// akun yang sudah ada: password salah tetap 401 biasa, password benar tetap masuk
	code, j = e.client().post("/auth/login", map[string]string{"email": "lama@x.id", "password": "salah-salah"})
	if code != 401 {
		t.Fatalf("password salah akun lama harus 401: %d %v", code, j)
	}
	lama := e.client()
	code, j = lama.post("/auth/login", map[string]string{"email": "lama@x.id", "password": "rahasia123"})
	lama.must(200, code, j)

	// tamu ditutup
	code, j = e.client().post("/auth/guest", map[string]string{})
	if code != 403 || j["code"] != "invite_only" {
		t.Fatalf("tamu harus ditutup: %d %v", code, j)
	}

	// daftar tanpa kode: ditolak dan dicatat
	code, j = e.client().post("/auth/register", map[string]string{"email": "baru@x.id", "password": "rahasia123"})
	if code != 403 || j["code"] != "invite_only" {
		t.Fatalf("daftar tanpa kode harus invite_only: %d %v", code, j)
	}
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM access_requests WHERE email='baru@x.id' AND source='register'`).Scan(&n)
	if n != 1 {
		t.Fatalf("percobaan daftar harus tercatat, dapat %d", n)
	}

	// kode sekali pakai
	raw := newInviteCode()
	if _, err := e.app.db.Exec(ctx, `INSERT INTO invite_codes (code_hash, hint, max_uses) VALUES ($1,'tes',1)`, inviteCodeHash(raw)); err != nil {
		t.Fatal(err)
	}
	code, j = e.client().post("/auth/invite-code", map[string]string{"code": strings.ToLower(strings.ReplaceAll(raw, "-", " "))})
	if code != 200 || j["code"] != raw {
		t.Fatalf("cek kode valid harus 200 dengan bentuk baku: %d %v", code, j)
	}
	code, j = e.client().post("/auth/invite-code", map[string]string{"code": "RAQIO-0000-0000-0000"})
	if code != 404 || j["code"] != "invite_code_invalid" {
		t.Fatalf("kode tak dikenal harus 404: %d %v", code, j)
	}
	baru := e.client()
	code, j = baru.post("/auth/register", map[string]string{"email": "baru@x.id", "password": "rahasia123", "name": "Baru", "code": raw})
	baru.must(200, code, j)
	code, j = baru.get("/auth/me")
	baru.must(200, code, j)
	var uses int
	e.app.db.QueryRow(ctx, `SELECT uses FROM invite_codes WHERE code_hash=$1`, inviteCodeHash(raw)).Scan(&uses)
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM invite_code_redemptions r JOIN users u ON u.id=r.user_id WHERE u.email='baru@x.id'`).Scan(&n)
	if uses != 1 || n != 1 {
		t.Fatalf("kode harus terpakai sekali dan tercatat: uses=%d redemptions=%d", uses, n)
	}

	// kode habis: pendaftaran berikutnya ditolak dan tidak meninggalkan user setengah jadi
	code, j = e.client().post("/auth/register", map[string]string{"email": "ketiga@x.id", "password": "rahasia123", "code": raw})
	if code != 403 || j["code"] != "invite_code_invalid" {
		t.Fatalf("kode habis harus invite_code_invalid: %d %v", code, j)
	}
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM users WHERE email='ketiga@x.id'`).Scan(&n)
	if n != 0 {
		t.Fatal("pendaftaran dengan kode habis tidak boleh membuat user")
	}
	code, j = e.client().post("/auth/invite-code", map[string]string{"code": raw})
	if code != 404 {
		t.Fatalf("kode habis tidak boleh lolos cek: %d %v", code, j)
	}
}
