package main

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// Fitur Instagram yang dulu dilayani app.py (/business dan /run), sekarang lewat job worker dan Postgres.

var igUserRe = regexp.MustCompile(`^[A-Za-z0-9._]{1,30}$`)

// igProfile: ringkasan profil IG untuk panel detail bisnis. Bentuk JSON sama dengan ig_profile() lama.
func (a *App) igProfile(w http.ResponseWriter, r *http.Request) {
	u := strings.ToLower(strings.TrimPrefix(r.URL.Query().Get("ig"), "@"))
	if !igUserRe.MatchString(u) {
		writeJSON(w, 200, map[string]any{"found": false})
		return
	}
	var raw, hist []byte
	var last time.Time
	err := a.db.QueryRow(r.Context(), `SELECT data, history, last_scraped FROM ig_profiles WHERE username=$1`, u).Scan(&raw, &hist, &last)
	if err != nil {
		var pending bool
		a.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM jobs WHERE kind='ig_profile' AND params->>'username'=$1 AND status IN ('queued','running'))`, u).Scan(&pending)
		writeJSON(w, 200, map[string]any{"found": false, "username": u, "pending": pending})
		return
	}
	var d map[string]any
	json.Unmarshal(raw, &d)
	var h []map[string]any
	json.Unmarshal(hist, &h)
	st, _ := d["stats"].(map[string]any)
	if st == nil {
		st = map[string]any{}
	}
	var delta any
	if len(h) > 1 {
		delta = num(h[len(h)-1], "followers") - num(h[0], "followers")
	}
	top, _ := st["top_posts"].([]any)
	if len(top) > 3 {
		top = top[:3]
	}
	var since any
	if len(h) > 0 {
		since = h[0]["ts"]
	}
	writeJSON(w, 200, map[string]any{
		"found": true, "username": d["username"], "full_name": d["full_name"], "biography": d["biography"],
		"followers": d["followers"], "following": d["following"], "posts_count": d["posts_count"], "is_verified": d["is_verified"],
		"engagement_rate": st["engagement_rate"], "posts_per_week": st["posts_per_week"], "avg_likes": st["avg_likes"], "best_day": st["best_day"],
		"top_posts": top, "followers_delta": delta, "tracked_since": since, "last_scraped": last.UTC().Format(time.RFC3339),
	})
}

// igRun: antrekan analisis akun IG (maks 5 akun sekaligus, tiap akun memakai kuota cek kontak).
func (a *App) igRun(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		Targets string
		Force   bool
	}
	readJSON(r, &in)
	var users []string
	for _, t := range regexp.MustCompile(`[,\s]+`).Split(in.Targets, -1) {
		t = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(t), "@"))
		if t == "" {
			continue
		}
		if !igUserRe.MatchString(t) {
			errJSON(w, 400, "Username hanya boleh huruf, angka, titik, dan underscore.")
			return
		}
		users = append(users, t)
	}
	if len(users) == 0 {
		errJSON(w, 400, "Isi minimal satu username.")
		return
	}
	if len(users) > 5 {
		errJSON(w, 400, "Maksimal 5 akun sekaligus.")
		return
	}
	ctx := r.Context()
	if err := a.consume(ctx, s.OrgID, s.Plan, "market_detail", len(users)); err != nil {
		errJSON(w, 402, err.Error())
		return
	}
	ids := []int64{}
	for _, u := range users {
		id, err := a.enqueue(ctx, s.OrgID, &s.UserID, "ig_profile", map[string]any{"username": u, "force": in.Force}, 5)
		if err == nil {
			ids = append(ids, id)
		}
	}
	writeJSON(w, 200, map[string]any{"ok": true, "jobs": ids})
}
