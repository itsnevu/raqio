// stats.go: angka total data yang sudah terkumpul (publik, tanpa sesi) untuk strip di halaman Riset dan beranda.
// Semua angka agregat tanpa data org: jumlah bisnis di laporan terbaru per pasangan, laporan asli, pasangan
// industri+wilayah, logo, riset/cek kontak/chat yang selesai, tampilan peringkat 7 hari. Dihitung ulang paling cepat
// tiap statsTTL supaya tidak membebani DB kalau halaman dibuka ramai.
package main

import (
	"net/http"
	"sync"
	"time"
)

const statsTTL = 60 * time.Second

type publicStats struct {
	Businesses  int       `json:"businesses"`   // bisnis di laporan terbaru tiap pasangan (unik per pasangan)
	ScannedRows int       `json:"scanned_rows"` // total baris bisnis di semua pindaian (termasuk pindaian ulang)
	Reports     int       `json:"reports"`      // laporan asli (bukan salinan cache)
	Pairs       int       `json:"pairs"`        // pasangan industri+wilayah yang pernah diriset
	Logos       int       `json:"logos"`        // logo bisnis tersimpan
	Runs        int       `json:"runs"`         // job riset (market_run + market_compare) selesai
	Details     int       `json:"details"`      // job cek kontak selesai
	Chats       int       `json:"chats"`        // jawaban asisten selesai
	RankViews   int       `json:"rank_views_7d"`
	Updated     time.Time `json:"updated"`
}

var statsMu sync.Mutex
var statsCache publicStats

func (a *App) computeStats(r *http.Request) publicStats {
	ctx := r.Context()
	s := publicStats{Updated: time.Now()}
	a.db.QueryRow(ctx, `SELECT coalesce(sum(b), 0), count(*) FROM (
		SELECT DISTINCT ON (lower(industry), lower(area)) coalesce((summary->>'businesses')::int, 0) b
		FROM reports WHERE cached_from IS NULL ORDER BY lower(industry), lower(area), id DESC) t`).Scan(&s.Businesses, &s.Pairs)
	a.db.QueryRow(ctx, `SELECT coalesce(sum(coalesce((summary->>'businesses')::int, 0)), 0), count(*) FROM reports WHERE cached_from IS NULL`).Scan(&s.ScannedRows, &s.Reports)
	a.db.QueryRow(ctx, `SELECT count(*) FROM business_logos`).Scan(&s.Logos)
	a.db.QueryRow(ctx, `SELECT count(*) FILTER (WHERE kind IN ('market_run','market_compare')), count(*) FILTER (WHERE kind='market_detail'),
		count(*) FILTER (WHERE kind='chat') FROM jobs WHERE status='done'`).Scan(&s.Runs, &s.Details, &s.Chats)
	a.db.QueryRow(ctx, `SELECT coalesce(sum(n), 0) FROM page_views WHERE day > current_date - 7`).Scan(&s.RankViews)
	return s
}

// GET /stats (publik): angka agregat, cache statsTTL.
func (a *App) statsPublic(w http.ResponseWriter, r *http.Request) {
	statsMu.Lock()
	if time.Since(statsCache.Updated) > statsTTL {
		statsCache = a.computeStats(r)
	}
	s := statsCache
	statsMu.Unlock()
	w.Header().Set("Cache-Control", "public, max-age=60")
	writeJSON(w, 200, s)
}
