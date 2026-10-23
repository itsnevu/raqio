// logo.go: sajikan logo bisnis yang diunduh worker (tabel business_logos). Publik: gambar bisnis dari sumber publik
// (favicon website, foto profil Instagram), kuncinya place_id yang tidak menebakkan apa pun. Cache lama supaya
// browser dan Caddy tidak meminta ulang.
package main

import (
	"crypto/sha1"
	"encoding/hex"
	"net/http"
	"time"
)

func (a *App) logoImage(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	if key == "" || len(key) > 300 {
		http.NotFound(w, r)
		return
	}
	var ct string
	var data []byte
	var at time.Time
	if err := a.db.QueryRow(r.Context(), `SELECT content_type, data, fetched_at FROM business_logos WHERE key=$1`, key).Scan(&ct, &data, &at); err != nil || len(data) == 0 {
		w.Header().Set("Cache-Control", "public, max-age=3600")
		http.NotFound(w, r)
		return
	}
	sum := sha1.Sum(data)
	etag := `"` + hex.EncodeToString(sum[:8]) + `"`
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	if ct == "" {
		ct = "image/png"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "public, max-age=604800, immutable")
	w.Header().Set("ETag", etag)
	w.Header().Set("Last-Modified", at.UTC().Format(http.TimeFormat))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write(data)
}
