package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestLimiterBurstThenRefill(t *testing.T) {
	now := time.Unix(0, 0)
	l := &limiter{rate: 1, burst: 3, m: map[string]*bucket{}, now: func() time.Time { return now }}
	for i := 0; i < 3; i++ {
		if !l.allow("a") {
			t.Fatalf("burst ke-%d harus lolos", i+1)
		}
	}
	if l.allow("a") {
		t.Fatal("token habis, harus ditolak")
	}
	if !l.allow("b") {
		t.Fatal("kunci lain punya bucket sendiri")
	}
	now = now.Add(2 * time.Second)
	if !l.allow("a") || !l.allow("a") {
		t.Fatal("setelah 2 detik harus terisi 2 token")
	}
	if l.allow("a") {
		t.Fatal("token ketiga belum ada")
	}
}

func TestClientIPPrefersForwardedFor(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.1:1234"
	if clientIP(r) != "10.0.0.1" {
		t.Fatal("fallback RemoteAddr tanpa port")
	}
	r.Header.Set("X-Forwarded-For", "203.0.113.9, 10.0.0.2")
	if clientIP(r) != "203.0.113.9" {
		t.Fatal("ambil IP pertama di X-Forwarded-For")
	}
}

func TestRateLimitIPReturns429AndSkipsHealth(t *testing.T) {
	l := &limiter{rate: 0, burst: 1, m: map[string]*bucket{}, now: time.Now}
	h := rateLimitIP(l, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	code := func(path string) int {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		return rec.Code
	}
	if code("/jobs") != 200 || code("/jobs") != 429 {
		t.Fatal("permintaan kedua dari IP sama harus 429")
	}
	if code("/healthz") != 200 {
		t.Fatal("health tidak kena rate limit")
	}
}
