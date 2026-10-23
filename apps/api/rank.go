// rank.go: peringkat publik per industri dan wilayah dengan skor terbuka (rumus di docs/SKOR.md bagian 4), lencana SVG
// yang bisa ditempel di website bisnis, dan penghitung tampilan. Sumber: laporan asli terbaru untuk pasangan itu dari
// org mana pun (data Google Maps publik), tanpa kontak dan tanpa menyebut org pemilik laporan.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log/slog"
	"math"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// Ambang kelayakan peringkat publik. Angka ini dipublikasikan di /metodologi dan ikut dikirim di respons
// /rank ("standards") supaya setiap klaim halaman bisa dipertanggungjawabkan dengan angka eksak.
const (
	rankMinRated   = 10 // halaman pasangan tayang hanya jika bisnis ber-rating >= ini
	rankMinReviews = 5  // di bawah ini bisnis tampil tanpa nomor peringkat ("belum cukup ulasan")
)

type rankRow struct {
	Key        string  `json:"key"`
	Name       string  `json:"name"`
	Category   string  `json:"category"`
	Rating     float64 `json:"rating"`
	Reviews    int     `json:"reviews"`
	Score      float64 `json:"score"`
	Quality    float64 `json:"quality"`
	Scale      float64 `json:"scale"`
	Reach      float64 `json:"reach"`
	Bayes      float64 `json:"bayes"`
	Rank       int     `json:"rank"`
	Gem        bool    `json:"hidden_gem"`
	Flagged    bool    `json:"flagged"`
	TooFew     bool    `json:"too_few"` // ulasan < rankMinReviews: tampil, tapi tidak diberi peringkat
	HasWebsite bool    `json:"has_website"`
	HasIG      bool    `json:"has_instagram"`
	HasWA      bool    `json:"has_whatsapp"`
	LogoKey    string  `json:"logo_key,omitempty"`
	MapsURL    string  `json:"maps_url"`
	Branches   int     `json:"branches"`
}

// rankGroup: urutan kelompok tampilan: 0 berperingkat, 1 belum cukup ulasan, 2 ditandai lonjakan.
func rankGroup(r rankRow) int {
	switch {
	case r.Flagged:
		return 2
	case r.TooFew:
		return 1
	}
	return 0
}

// rankMarket: bahan hitung yang sama untuk semua bisnis di satu wilayah (dikirim ke UI supaya tiap angka bisa
// diturunkan ulang persis: C dan m untuk rating Bayesian, ulasan terbanyak untuk skala logaritmik).
type rankMarket struct {
	AvgRating     float64 `json:"avg_rating"`     // C: rata-rata rating semua bisnis berating
	MedianReviews float64 `json:"median_reviews"` // m: median ulasan, minimal 10
	MaxReviews    float64 `json:"max_reviews"`    // ulasan terbanyak di wilayah (penyebut skala)
	Rated         int     `json:"rated"`          // jumlah bisnis berating yang dihitung
	Weights       [3]int  `json:"weights"`        // bobot kualitas, skala, jangkauan
}

// titleCase: huruf kapital di awal tiap kata untuk nama industri/wilayah dari URL (kata sambung tetap kecil).
func titleCase(s string) string {
	words := strings.Fields(strings.ToLower(strings.TrimSpace(s)))
	for i, w := range words {
		if i > 0 && (w == "di" || w == "dan" || w == "dari" || w == "ke" || w == "&") {
			continue
		}
		r, n := utf8.DecodeRuneInString(w)
		if r != utf8.RuneError {
			words[i] = string(unicode.ToUpper(r)) + w[n:]
		}
	}
	return strings.Join(words, " ")
}

// raqioScores: skor peringkat publik untuk semua bisnis berating di laporan. Cabang satu brand (brand_group) ditampilkan sekali.
func raqioScores(places []Place) []rankRow {
	rows, _ := raqioScoresMarket(places)
	return rows
}

func raqioScoresMarket(places []Place) ([]rankRow, rankMarket) {
	rated := make([]Place, 0, len(places))
	for _, p := range places {
		if num(p, "rating") > 0 {
			rated = append(rated, p)
		}
	}
	if len(rated) == 0 {
		return nil, rankMarket{}
	}
	// rata-rata pasar C dan median ulasan m (min 10), sama dengan skor kekuatan
	sumR := 0.0
	revs := make([]float64, 0, len(rated))
	maxRev := 1.0
	for _, p := range rated {
		sumR += num(p, "rating")
		r := num(p, "reviews")
		revs = append(revs, r)
		if r > maxRev {
			maxRev = r
		}
	}
	C := sumR / float64(len(rated))
	sort.Float64s(revs)
	m := math.Max(revs[len(revs)/2], 10)
	market := rankMarket{AvgRating: math.Round(C*100) / 100, MedianReviews: m, MaxReviews: maxRev, Rated: len(rated), Weights: [3]int{60, 25, 15}}
	seenBrand := map[string]bool{}
	var out []rankRow
	for _, p := range rated {
		brand := str(p, "brand_group")
		if brand != "" {
			if seenBrand[brand] {
				continue
			}
			seenBrand[brand] = true
		}
		R, v := num(p, "rating"), num(p, "reviews")
		bayes := (v/(v+m))*R + (m/(v+m))*C
		quality := math.Max(0, math.Min(1, (bayes-1)/4))
		scale := math.Log10(1+v) / math.Log10(1+maxRev)
		reach := 0.0
		hasW, hasIG, hasWA := str(p, "website") != "", str(p, "instagram") != "", str(p, "whatsapp") != ""
		for _, b := range []bool{hasW, hasIG, hasWA} {
			if b {
				reach += 1.0 / 3
			}
		}
		score := 60*quality + 25*scale + 15*reach
		flagged := false
		if hist, ok := p["review_jump_pct"].(float64); ok && hist > 50 && v >= 100 {
			flagged = true
		}
		out = append(out, rankRow{
			Key: leadKey(p), Name: str(p, "name"), Category: str(p, "category"), Rating: R, Reviews: int(v),
			Score: math.Round(score*10) / 10, Quality: math.Round(quality*1000) / 1000, Scale: math.Round(scale*1000) / 1000,
			Reach: math.Round(reach*1000) / 1000, Bayes: math.Round(bayes*100) / 100,
			Gem: R >= 4.7 && v >= 15 && v < 300, Flagged: flagged, TooFew: v < rankMinReviews,
			HasWebsite: hasW, HasIG: hasIG, HasWA: hasWA,
			LogoKey: str(p, "logo_key"), MapsURL: str(p, "maps_url"), Branches: int(num(p, "branches_in_area")),
		})
	}
	// urutan: berperingkat (skor tertinggi dulu), lalu belum cukup ulasan, lalu yang ditandai lonjakan;
	// nomor peringkat hanya untuk kelompok pertama
	sort.SliceStable(out, func(i, j int) bool {
		if gi, gj := rankGroup(out[i]), rankGroup(out[j]); gi != gj {
			return gi < gj
		}
		return out[i].Score > out[j].Score
	})
	rank := 0
	for i := range out {
		if rankGroup(out[i]) == 0 {
			rank++
			out[i].Rank = rank
		}
	}
	return out, market
}

// latestPublicReport: laporan asli terbaru (bukan salinan cache) untuk pasangan industri+wilayah dari org mana pun,
// dalam RANK_MAX_DAYS hari (default 30).
func (a *App) latestPublicReport(r *http.Request, industry, area string) (map[string]any, time.Time, bool) {
	days := envInt("RANK_MAX_DAYS", 30)
	var raw []byte
	var created time.Time
	err := a.db.QueryRow(r.Context(), `SELECT report, created_at FROM reports
		WHERE cached_from IS NULL AND lower(industry)=lower($1) AND lower(area)=lower($2) AND created_at > now() - make_interval(days => $3)
		ORDER BY id DESC LIMIT 1`, industry, area, days).Scan(&raw, &created)
	if err != nil {
		return nil, time.Time{}, false
	}
	rep, ok := parseReport(raw)
	return rep, created, ok
}

// GET /rank?industry=&area= (publik): daftar peringkat + komponen skor, tanpa kontak.
func (a *App) rankPublic(w http.ResponseWriter, r *http.Request) {
	industry := cleanField(r.URL.Query().Get("industry"), 60)
	area := cleanField(r.URL.Query().Get("area"), 80)
	if industry == "" || area == "" {
		errCode(w, 400, "validation", "butuh industry dan area")
		return
	}
	rep, created, ok := a.latestPublicReport(r, industry, area)
	if !ok {
		errCode(w, 404, "not_found", "Belum ada peringkat untuk pasangan ini.")
		return
	}
	rows, market := raqioScoresMarket(placesOf(rep))
	// kelayakan halaman: tanpa cukup bisnis ber-rating, peringkat menyesatkan — lebih jujur menolak tayang
	if len(rows) < rankMinRated {
		errCode(w, 404, "not_enough_data", fmt.Sprintf(
			"Peringkat butuh minimal %d bisnis ber-rating; pasangan ini baru punya %d. Coba wilayah yang lebih luas.",
			rankMinRated, len(rows)))
		return
	}
	limit := 50
	if len(rows) > limit {
		rows = rows[:limit]
	}
	key := "rank:" + strings.ToLower(industry) + "|" + strings.ToLower(area)
	views := a.bumpViews(r, key)
	capped, _ := rep["summary"].(map[string]any)["capped"].(bool)
	writeJSON(w, 200, map[string]any{
		"industry": titleCase(str(rep, "industry")), "area": titleCase(str(rep, "area")), "updated": created, "total": len(placesOf(rep)),
		"rows": rows, "views_7d": views, "summary": rep["summary"], "market": market, "capped": capped,
		"formula": "Skor = 60 x kualitas (rating Bayesian) + 25 x skala (log ulasan) + 15 x jangkauan (website, IG, WhatsApp); rincian di /metodologi",
		// angka eksak yang menopang klaim halaman; tampil juga di /metodologi
		"standards": map[string]any{
			"min_rated": rankMinRated, "min_reviews_rank": rankMinReviews,
			"freshness_days": envInt("RANK_MAX_DAYS", 30),
			"flag":           "lonjakan ulasan > 50% pada bisnis >= 100 ulasan ditandai dan tidak diberi peringkat",
			"brand_dedup":    "cabang satu brand ditampilkan sekali",
			"paid_placement": false,
		},
	})
}

// POST /rank/report (publik): laporan "data keliru" dari halaman peringkat. Anonim, maksimal 5 per IP per hari,
// disimpan di rank_reports untuk ditindaklanjuti operator (lihat runbook).
func (a *App) rankReport(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Industry, Area, Key, Message string
	}
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	ind, area := cleanField(in.Industry, 60), cleanField(in.Area, 80)
	msg := strings.TrimSpace(trunc(in.Message, 1000))
	if ind == "" || area == "" || len(msg) < 10 {
		errCode(w, 400, "validation", "Tulis keterangan minimal 10 karakter supaya bisa ditindaklanjuti.")
		return
	}
	ip := clientIP(r)
	var today int
	if err := a.db.QueryRow(r.Context(), `SELECT count(*) FROM rank_reports WHERE ip=$1 AND created_at > now() - interval '1 day'`, ip).Scan(&today); err != nil {
		logDB("rankReport", "count rank_reports", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	if today >= 5 {
		errCode(w, 429, "rate_limited", "Maksimal 5 laporan per hari. Terima kasih, laporan sebelumnya sedang ditinjau.")
		return
	}
	if !a.exec(r.Context(), w, `INSERT INTO rank_reports (industry, area, biz_key, message, ip) VALUES ($1,$2,$3,$4,$5)`,
		ind, area, trunc(in.Key, 300), msg, ip) {
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// rankRefreshRound: jaga kesegaran halaman peringkat yang ramai dilihat. Hanya aktif bila operator mengisi
// RANK_REFRESH_ORG (org yang kuotanya dipakai, biasanya org milik pengelola): pasangan dengan tampilan 7 hari
// terakhir yang laporan aslinya lebih tua dari RANK_REFRESH_DAYS (default 7) diriset ulang, maksimal 2 per putaran.
func (a *App) rankRefreshRound(ctx context.Context) {
	org := os.Getenv("RANK_REFRESH_ORG")
	if org == "" {
		return
	}
	var plan string
	if err := a.db.QueryRow(ctx, `SELECT plan FROM orgs WHERE id=$1`, org).Scan(&plan); err != nil {
		logDB("rankRefresh", "select org", err)
		return
	}
	days := envInt("RANK_REFRESH_DAYS", 7)
	rows, err := a.db.Query(ctx, `
		SELECT v.key FROM (SELECT key, sum(n) views FROM page_views
			WHERE key LIKE 'rank:%' AND day > current_date - 7 GROUP BY key) v
		WHERE views > 0 ORDER BY views DESC LIMIT 20`)
	if err != nil {
		logDB("rankRefresh", "select page_views", err)
		return
	}
	var keys []string
	for rows.Next() {
		var k string
		if rows.Scan(&k) == nil {
			keys = append(keys, k)
		}
	}
	rows.Close()
	started := 0
	for _, k := range keys {
		if started >= 2 {
			return
		}
		ind, area, ok := strings.Cut(strings.TrimPrefix(k, "rank:"), "|")
		if !ok || ind == "" || area == "" {
			continue
		}
		var age float64
		err := a.db.QueryRow(ctx, `SELECT extract(epoch from now() - max(created_at))/86400 FROM reports
			WHERE cached_from IS NULL AND lower(industry)=$1 AND lower(area)=$2`, ind, area).Scan(&age)
		if err != nil || age < float64(days) {
			continue
		}
		if _, err := a.startJob(ctx, org, plan, nil, "market_run", 1,
			map[string]any{"industry": ind, "area": area, "rank_refresh": true}, 10); err == nil {
			slog.Info("rank: riset ulang halaman publik", "industry", ind, "area", area)
			started++
		}
	}
}

// GET /rank/pairs (publik): pasangan industri+wilayah yang punya peringkat, terbaru dulu.
func (a *App) rankPairs(w http.ResponseWriter, r *http.Request) {
	days := envInt("RANK_MAX_DAYS", 30)
	rows := a.query(r.Context(), w, `SELECT DISTINCT ON (lower(industry), lower(area)) industry, area, created_at,
		coalesce((summary->>'businesses')::int, 0) FROM reports WHERE cached_from IS NULL AND created_at > now() - make_interval(days => $1)
		ORDER BY lower(industry), lower(area), id DESC`, days)
	if rows == nil {
		return
	}
	defer rows.Close()
	type pair struct {
		Industry   string    `json:"industry"`
		Area       string    `json:"area"`
		Updated    time.Time `json:"updated"`
		Businesses int       `json:"businesses"`
	}
	items := []pair{}
	for rows.Next() {
		var x pair
		if rows.Scan(&x.Industry, &x.Area, &x.Updated, &x.Businesses) == nil && x.Businesses > 0 {
			items = append(items, x)
		}
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].Updated.After(items[j].Updated) })
	if len(items) > 200 {
		items = items[:200]
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

// bumpViews: +1 tampilan hari ini untuk kunci, kembalikan jumlah 7 hari (termasuk hari ini). Gagal DB diabaikan.
func (a *App) bumpViews(r *http.Request, key string) int {
	ctx := r.Context()
	a.db.Exec(ctx, `INSERT INTO page_views (key, day, n) VALUES ($1, current_date, 1) ON CONFLICT (key, day) DO UPDATE SET n = page_views.n + 1`, key)
	var n int
	a.db.QueryRow(ctx, `SELECT coalesce(sum(n),0) FROM page_views WHERE key=$1 AND day > current_date - 7`, key).Scan(&n)
	return n
}

// GET /badge/{industry}/{area}/{key}.svg (publik): lencana "#N {industri} di {wilayah} versi Raqio".
func (a *App) badgeSVG(w http.ResponseWriter, r *http.Request) {
	industry := cleanField(r.PathValue("industry"), 60)
	area := cleanField(r.PathValue("area"), 80)
	key := strings.TrimSuffix(r.PathValue("key"), ".svg")
	w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	rep, _, ok := a.latestPublicReport(r, industry, area)
	rank, name, score, reviews := 0, "", 0.0, 0
	if ok {
		for _, row := range raqioScores(placesOf(rep)) {
			if row.Key == key {
				rank, name, score, reviews = row.Rank, row.Name, row.Score, row.Reviews
				break
			}
		}
	}
	w.Write([]byte(badgeSVGText(rank, name, industry, area, score, reviews, r.URL.Query().Get("theme") == "light")))
}

// textWidth: perkiraan lebar teks (px) untuk font sans 400/600; cukup untuk menentukan lebar SVG tanpa mengukur glyph.
func textWidth(s string, size float64, bold bool) float64 {
	k := 0.56
	if bold {
		k = 0.62
	}
	return float64(utf8.RuneCountInString(s)) * size * k
}

// badgeSVGText: lencana peringkat. Blok kiri: "TOP" + "#N" di atas gradasi amber; kanan: baris 1 "Salon di Gading Serpong",
// baris 2 "Skor Raqio 91.8 · 2.491 ulasan · raqio". Tanpa peringkat: "Belum masuk peringkat".
func badgeSVGText(rank int, name, industry, area string, score float64, reviews int, light bool) string {
	ind, ar := titleCase(industry), titleCase(area)
	line1 := fmt.Sprintf("%s di %s", ind, ar)
	line2 := "Peringkat terbuka · raqio"
	pos := "–"
	if rank > 0 {
		pos = fmt.Sprintf("#%d", rank)
		line2 = fmt.Sprintf("Skor Raqio %.1f · %s ulasan · raqio", score, groupThousands(reviews))
	} else {
		line1 = "Belum masuk peringkat"
		if ind != "" && ar != "" {
			line2 = fmt.Sprintf("%s di %s · raqio", ind, ar)
		}
	}
	bg, fg, muted, stroke := "#0B0B0B", "#F2F2F0", "#A3A3A3", "#2A2A2A"
	if light {
		bg, fg, muted, stroke = "#FFFFFF", "#111111", "#6B6B6B", "#E3E3E3"
	}
	left := math.Max(58, textWidth(pos, 20, true)+22)
	wText := math.Max(textWidth(line1, 13.5, true), textWidth(line2, 10.5, false))
	width := int(math.Ceil(left + 14 + wText + 16))
	h := 46.0
	title := html.EscapeString(strings.TrimSpace(pos + " " + line1 + " " + name))
	return fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" role="img" aria-label="%s"><title>%s</title>
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC24D"/><stop offset="1" stop-color="#F59E0B"/></linearGradient>
<clipPath id="c"><rect width="%d" height="%d" rx="12"/></clipPath></defs>
<g clip-path="url(#c)"><rect width="%d" height="%d" fill="%s"/><rect width="%.0f" height="%d" fill="url(#g)"/></g>
<rect x="0.5" y="0.5" width="%d" height="%d" rx="11.5" fill="none" stroke="%s"/>
<text x="%.1f" y="14" text-anchor="middle" font-family="Albert Sans,Segoe UI,Helvetica,Arial,sans-serif" font-size="8.5" font-weight="700" letter-spacing="1.2" fill="#3A2A00">TOP</text>
<text x="%.1f" y="35" text-anchor="middle" font-family="Albert Sans,Segoe UI,Helvetica,Arial,sans-serif" font-size="20" font-weight="800" fill="#0B0B0B">%s</text>
<text x="%.1f" y="20" font-family="Albert Sans,Segoe UI,Helvetica,Arial,sans-serif" font-size="13.5" font-weight="700" fill="%s">%s</text>
<text x="%.1f" y="35" font-family="Albert Sans,Segoe UI,Helvetica,Arial,sans-serif" font-size="10.5" fill="%s">%s</text></svg>`,
		width, int(h), width, int(h), title, title,
		width, int(h), width, int(h), bg, left, int(h), width-1, int(h)-1, stroke,
		left/2, left/2, html.EscapeString(pos),
		left+14, fg, html.EscapeString(line1), left+14, muted, html.EscapeString(line2))
}

// groupThousands: 2491 -> "2.491" (gaya Indonesia).
func groupThousands(n int) string {
	s := fmt.Sprintf("%d", n)
	if len(s) <= 3 {
		return s
	}
	var b strings.Builder
	pre := len(s) % 3
	if pre > 0 {
		b.WriteString(s[:pre])
	}
	for i := pre; i < len(s); i += 3 {
		if b.Len() > 0 {
			b.WriteByte('.')
		}
		b.WriteString(s[i : i+3])
	}
	return b.String()
}

// parseReport: JSON laporan menjadi map; Place adalah alias map[string]any jadi placesOf langsung bisa dipakai.
func parseReport(raw []byte) (map[string]any, bool) {
	var rep map[string]any
	if json.Unmarshal(raw, &rep) != nil {
		return nil, false
	}
	return rep, true
}
