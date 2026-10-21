// Backend utama Raqio (Go). Masih kerangka: health check dan proxy ke service scraper Python.
// Rencana: auth, DB, dan endpoint /market/* pindah ke sini satu per satu; Python tinggal jadi worker scraping.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
)

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	port := env("PORT", "8080")
	scraper, err := url.Parse(env("SCRAPER_URL", "http://127.0.0.1:8000"))
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "raqio-api"})
	})
	// Sementara: semua yang belum diport diteruskan ke service Python.
	mux.Handle("/", httputil.NewSingleHostReverseProxy(scraper))

	log.Printf("raqio-api jalan di http://localhost:%s (scraper: %s)", port, scraper)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
