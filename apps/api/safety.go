// safety.go: pengaman lintas endpoint. Guard SSRF untuk HTTP keluar (webhook), validasi URL webhook,
// cek CSRF untuk request bersesi cookie, dan redaksi rahasia di pesan error.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"
)

// ---------- SSRF guard ----------

// blockedNets: jaringan yang tidak boleh dituju HTTP keluar, di luar yang sudah dicakup net.IP
// (loopback, privat 10/8 172.16/12 192.168/16 fc00::/7, link-local 169.254/16 fe80::/10, multicast, unspecified).
var blockedNets = func() []*net.IPNet {
	var out []*net.IPNet
	for _, c := range []string{
		"0.0.0.0/8",      // "this network"
		"100.64.0.0/10",  // CGNAT
		"192.0.0.0/24",   // IETF protocol assignments
		"198.18.0.0/15",  // benchmarking
		"240.0.0.0/4",    // reserved
		"64:ff9b::/96",   // NAT64, bisa memetakan ke IPv4 internal
		"64:ff9b:1::/48", // NAT64 lokal
		"2001:db8::/32",  // dokumentasi
	} {
		_, n, err := net.ParseCIDR(c)
		if err == nil {
			out = append(out, n)
		}
	}
	return out
}()

// isBlockedIP: true kalau alamat tidak boleh dituju dari server (internal, loopback, metadata cloud, dsb).
func isBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsUnspecified() || ip.IsMulticast() || ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsInterfaceLocalMulticast() {
		return true
	}
	for _, n := range blockedNets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// insecureWebhookAllowed: ALLOW_INSECURE_WEBHOOK=1 mengizinkan http:// dan tujuan loopback. Hanya untuk dev dan
// tes (httptest). Jangan dinyalakan di produksi.
func insecureWebhookAllowed() bool { return os.Getenv("ALLOW_INSECURE_WEBHOOK") == "1" }

var errRedirect = errors.New("redirect ditolak")

// safeHTTPClient: klien HTTP untuk tujuan yang diisi pengguna (webhook). Alamat diperiksa SETELAH resolve DNS
// (Dialer.Control), jadi nama domain yang mengarah ke IP internal pun ditolak. Redirect tidak diikuti supaya
// server tujuan tidak bisa mengarahkan ke jaringan internal. Proxy lingkungan diabaikan.
func safeHTTPClient(timeout time.Duration) *http.Client {
	allowLoopback := insecureWebhookAllowed()
	d := &net.Dialer{Timeout: 10 * time.Second, Control: func(network, address string, _ syscall.RawConn) error {
		host, _, err := net.SplitHostPort(address)
		if err != nil {
			host = address
		}
		ip := net.ParseIP(host)
		if ip != nil && allowLoopback && ip.IsLoopback() {
			return nil
		}
		if isBlockedIP(ip) {
			return fmt.Errorf("tujuan %s ditolak: alamat internal", host)
		}
		return nil
	}}
	tr := &http.Transport{
		Proxy:                 nil,
		DialContext:           d.DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: timeout,
		MaxIdleConns:          8,
		IdleConnTimeout:       30 * time.Second,
		ForceAttemptHTTP2:     true,
	}
	return &http.Client{Timeout: timeout, Transport: tr,
		CheckRedirect: func(*http.Request, []*http.Request) error { return errRedirect }}
}

// validateWebhookURL: dipakai putSettings sebelum menyimpan webhook_url. String kosong = menghapus webhook,
// dianggap valid. Wajib https (kecuali ALLOW_INSECURE_WEBHOOK=1), tanpa userinfo, host bukan IP internal
// atau nama lokal. Pemeriksaan DNS dilakukan saat kirim oleh safeHTTPClient.
func validateWebhookURL(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	if len(raw) > 500 {
		return errors.New("Webhook URL terlalu panjang (maksimal 500 karakter).")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return errors.New("Webhook URL tidak valid.")
	}
	insecure := insecureWebhookAllowed()
	switch u.Scheme {
	case "https":
	case "http":
		if !insecure {
			return errors.New("Webhook URL harus https://.")
		}
	default:
		return errors.New("Webhook URL harus diawali https://.")
	}
	if u.User != nil {
		return errors.New("Webhook URL tidak boleh memuat username atau password.")
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return errors.New("Webhook URL tidak punya host.")
	}
	if ip := net.ParseIP(host); ip != nil {
		if insecure && ip.IsLoopback() {
			return nil
		}
		if isBlockedIP(ip) {
			return errors.New("Webhook URL tidak boleh menunjuk alamat internal.")
		}
		return nil
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") ||
		strings.HasSuffix(host, ".internal") || strings.HasSuffix(host, ".arpa") || !strings.Contains(host, ".") {
		if insecure && (host == "localhost" || strings.HasSuffix(host, ".localhost")) {
			return nil
		}
		return errors.New("Webhook URL harus memakai nama domain publik.")
	}
	return nil
}

// ---------- redaksi rahasia di log ----------

var botTokenRe = regexp.MustCompile(`bot[0-9]+:[A-Za-z0-9_-]+`)

// redactErr: teks error yang aman dicatat. *url.Error memuat URL lengkap, termasuk token bot Telegram
// (https://api.telegram.org/bot<token>/...). Token diganti "bot[redacted]".
func redactErr(err error) string {
	if err == nil {
		return ""
	}
	return redactString(err.Error())
}

// redactString: redaksi rahasia server di teks bebas (nilai panic, pesan alarm): token bot Telegram dan
// secret webhook ops diganti "[redacted]".
func redactString(s string) string {
	for _, k := range []string{"TELEGRAM_BOT_TOKEN", "OPS_WEBHOOK_SECRET"} {
		if v := os.Getenv(k); v != "" {
			s = strings.ReplaceAll(s, v, "[redacted]")
		}
	}
	return botTokenRe.ReplaceAllString(s, "bot[redacted]")
}

// ---------- CSRF dan Content-Type ----------

// sameSiteRequest: pengaman CSRF untuk request tulis yang memakai cookie. Urutan: Sec-Fetch-Site kalau ada
// (browser modern), kalau tidak Origin, kalau tidak Referer; host harus sama dengan APP_URL atau Host request.
// Tanpa ketiganya (curl, SDK) dianggap bukan browser dan diizinkan: CSRF butuh browser, dan browser selalu
// mengirim minimal Origin pada POST.
func sameSiteRequest(r *http.Request) bool {
	if sfs := r.Header.Get("Sec-Fetch-Site"); sfs != "" {
		return sfs == "same-origin" || sfs == "none"
	}
	if origin := r.Header.Get("Origin"); origin != "" {
		return originAllowed(origin, r.Host) // "null" (sandbox, file://) tidak pernah cocok
	}
	if ref := r.Header.Get("Referer"); ref != "" {
		return originAllowed(ref, r.Host)
	}
	return true
}

func originAllowed(src, reqHost string) bool {
	u, err := url.Parse(src)
	if err != nil || u.Host == "" {
		return false
	}
	return hostMatches(u.Host, reqHost) || hostMatches(u.Host, appHost())
}

func appHost() string {
	u, err := url.Parse(env("APP_URL", "http://localhost:3000"))
	if err != nil {
		return ""
	}
	return u.Host
}

// hostMatches: sama persis (termasuk port), atau hostname sama bila salah satu tanpa port.
func hostMatches(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	if strings.EqualFold(a, b) {
		return true
	}
	ha, pa := splitHostPort(a)
	hb, pb := splitHostPort(b)
	return strings.EqualFold(ha, hb) && (pa == "" || pb == "")
}

func splitHostPort(h string) (string, string) {
	if host, port, err := net.SplitHostPort(h); err == nil {
		return host, port
	}
	return h, ""
}

// hasJSONBody: Content-Type application/json. Body kosong tanpa Content-Type juga diterima.
func hasJSONBody(r *http.Request) bool {
	ct := r.Header.Get("Content-Type")
	if ct == "" {
		return r.ContentLength == 0
	}
	mt, _, err := mime.ParseMediaType(ct)
	return err == nil && mt == "application/json"
}

// browserGuard: untuk request non-GET: tolak lintas situs (403) dan Content-Type selain JSON (415).
// Dipasang di requireSession (sesi cookie) dan di endpoint auth tanpa sesi (login, register, guest).
func browserGuard(next http.Handler) http.Handler { return guardRequest(next, true) }

// csrfGuard: hanya cek lintas situs, body bebas. Untuk /auth/logout (dipanggil lewat form HTML).
func csrfGuard(next http.Handler) http.Handler { return guardRequest(next, false) }

func guardRequest(next http.Handler, jsonOnly bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
			if !sameSiteRequest(r) {
				errJSON(w, 403, "Permintaan lintas situs ditolak.")
				return
			}
			if jsonOnly && !hasJSONBody(r) {
				errJSON(w, 415, "Content-Type harus application/json.")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// ---------- verifikasi email dipaksa ----------

// requireVerified: aksi sensitif (tagihan, undangan, API key, webhook) hanya untuk email yang sudah diverifikasi.
// Tamu dianggap terverifikasi. Dipasang di dalam requireSession.
func (a *App) requireVerified(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s := sess(r)
		if s == nil {
			errJSON(w, 401, "Belum login.")
			return
		}
		if !s.Verified && !s.Guest {
			errJSON(w, 403, "Verifikasi email dulu. Cek kotak masuk atau kirim ulang dari Pengaturan.")
			return
		}
		next(w, r)
	}
}

// requireVerifiedFields: seperti requireVerified, tetapi hanya kalau body JSON memuat salah satu field
// (mis. webhook_url, notify_email). Body dibaca lalu dipasang kembali supaya handler tetap bisa membacanya.
func (a *App) requireVerifiedFields(next http.HandlerFunc, fields ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s := sess(r)
		if s != nil && !s.Verified && !s.Guest {
			body, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
			if err != nil {
				errJSON(w, 400, "Request tidak valid.")
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(body))
			var m map[string]json.RawMessage
			if json.Unmarshal(body, &m) == nil {
				for _, f := range fields {
					if v, ok := m[f]; ok && string(v) != "null" {
						errJSON(w, 403, "Verifikasi email dulu sebelum mengatur notifikasi atau webhook.")
						return
					}
				}
			}
		}
		next(w, r)
	}
}

// ---------- penghitung global sederhana ----------

// hourCounter: batas global per jam (mis. jumlah akun tamu seluruh instance). Jendela tetap, reset tiap jam.
type hourCounter struct {
	mu    sync.Mutex
	start time.Time
	n     int
	now   func() time.Time
}

func newHourCounter() *hourCounter { return &hourCounter{now: time.Now} }

// take: ambil satu slot; false kalau sudah mencapai max dalam jam berjalan.
func (c *hourCounter) take(max int) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	t := c.now()
	if c.start.IsZero() || t.Sub(c.start) >= time.Hour {
		c.start, c.n = t, 0
	}
	if c.n >= max {
		return false
	}
	c.n++
	return true
}
