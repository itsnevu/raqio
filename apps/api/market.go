package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/mail"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var cleanRe = regexp.MustCompile(`[^\w\s&.,/-]`)
var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
var telegramChatRe = regexp.MustCompile(`^-?\d{1,20}$`)

// leadStatusList: satu-satunya daftar status lead di Go (urutan dipakai papan prospek). Sinkron dengan CHECK
// leads_status_check di migrasi 007 dan LEAD_STATUSES di worker Python.
var leadStatusList = []string{"baru", "dihubungi", "tertarik", "deal", "tolak"}
var leadStatuses = func() map[string]bool {
	m := map[string]bool{}
	for _, s := range leadStatusList {
		m[s] = true
	}
	return m
}()

type Lead struct {
	Status   string  `json:"status"`
	Note     string  `json:"note"`
	Remind   string  `json:"remind"`
	Assignee string  `json:"assignee"` // uuid anggota org penanggung jawab, "" = belum dipegang
	Updated  string  `json:"updated"`
	Name     *string `json:"-"`
}

func (a *App) leadsOf(r *http.Request, org string) map[string]Lead {
	out := map[string]Lead{}
	rows, err := a.db.Query(r.Context(), `SELECT key, status, note, coalesce(to_char(remind,'YYYY-MM-DD'),''), coalesce(assignee::text,''), updated_at FROM leads WHERE org_id=$1`, org)
	if err != nil {
		logDB("leadsOf", "select leads", err)
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		var l Lead
		var t time.Time
		if rows.Scan(&k, &l.Status, &l.Note, &l.Remind, &l.Assignee, &t) != nil {
			continue
		}
		l.Updated = t.UTC().Format(time.RFC3339)
		out[k] = l
	}
	return out
}

// ---------- laporan ----------

// listReports: 12 laporan terbaru org, hanya kolom ringkasan (index reports_org_id), bukan JSON penuh.
func (a *App) listReports(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	rows := a.query(r.Context(), w, `SELECT id, industry, area, created_at, coalesce(summary, '{}'::jsonb), cached_from IS NOT NULL
		FROM reports WHERE org_id=$1 ORDER BY id DESC LIMIT 12`, s.OrgID)
	if rows == nil {
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var ind, area string
		var t time.Time
		var sm []byte
		var cached bool
		if rows.Scan(&id, &ind, &area, &t, &sm, &cached) != nil {
			continue
		}
		out = append(out, map[string]any{"id": id, "industry": ind, "area": area, "created": t.UTC().Format(time.RFC3339),
			"summary": json.RawMessage(sm), "cached": cached})
	}
	writeJSON(w, 200, out)
}

func (a *App) loadReport(r *http.Request, org string, id int64) (map[string]any, bool) {
	var raw []byte
	if err := a.db.QueryRow(r.Context(), `SELECT report FROM reports WHERE org_id=$1 AND id=$2`, org, id).Scan(&raw); err != nil {
		if err != errNoRows {
			logDB("loadReport", "select report", err)
		}
		return nil, false
	}
	var rep map[string]any
	if json.Unmarshal(raw, &rep) != nil {
		return nil, false
	}
	rep["id"] = id
	return rep, true
}

func (a *App) getReport(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	id, _ := strconv.ParseInt(r.URL.Query().Get("id"), 10, 64)
	rep, ok := a.loadReport(r, s.OrgID, id)
	if !ok {
		errCode(w, 404, "not_found", "tidak ada")
		return
	}
	leads := a.leadsOf(r, s.OrgID)
	for _, p := range placesOf(rep) {
		if l, ok := leads[leadKey(p)]; ok {
			p["lead"] = l
		}
	}
	writeJSON(w, 200, rep)
}

func cleanField(s string, n int) string { return trunc(cleanRe.ReplaceAllString(s, ""), n) }

func (a *App) runMarket(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		Industry, Area string
		Fresh          bool // true = abaikan cache, pindai ulang sekarang
	}
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	ind, area := cleanField(in.Industry, 60), cleanField(in.Area, 80)
	if ind == "" || area == "" {
		errCode(w, 400, "validation", "Isi industri dan wilayah.")
		return
	}
	if in.Fresh && s.Guest {
		errCode(w, 403, "guest_no_fresh", "Tamu memakai hasil instan; daftar untuk pindai ulang")
		return
	}
	// hasil instan: pasangan yang sama sudah dipindai org mana pun dalam masa cache. Tanpa job, tanpa kuota.
	if !in.Fresh {
		// typo/alias industri disamakan dulu dengan ejaan tersimpan supaya cache tetap kena ("coffe" -> "coffee")
		cacheInd := a.resolveCachedIndustry(r.Context(), ind, area)
		if srcID, srcOrg, raw, created, ok := a.cachedReport(r.Context(), cacheInd, area); ok {
			// sumbernya laporan org ini sendiri: tampilkan aslinya (lengkap dengan kontak), jangan bikin salinan tanpa kontak
			id, err := srcID, error(nil)
			if srcOrg != s.OrgID {
				id, err = a.copyCachedReport(r.Context(), s.OrgID, ind, area, srcID, raw)
			}
			if err == nil {
				writeJSON(w, 200, map[string]any{"ok": true, "job": nil, "cached": true, "report_id": id,
					"age_hours": int(time.Since(created).Hours())})
				return
			}
			logDB("runMarket", "copyCachedReport", err)
		}
	}
	// kuota dipotong dan job diantrekan dalam satu transaksi; antrean riset dibatasi planLimits.Queue (409 queue_full)
	id, err := a.startJob(r.Context(), s.OrgID, s.Plan, &s.UserID, "market_run", 1, map[string]any{"industry": ind, "area": area}, planPriority(s.Plan))
	if replyJobErr(w, err) {
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "job": id})
}

func (a *App) runCompare(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		Industry string
		Areas    []string
	}
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	ind := cleanField(in.Industry, 60)
	// dedupe wilayah tanpa peduli huruf besar/kecil: index unik reports(job_id, lower(area)) menolak wilayah ganda
	areas := []string{}
	seen := map[string]bool{}
	for _, x := range in.Areas {
		v := cleanField(x, 80)
		k := strings.ToLower(v)
		if v == "" || seen[k] {
			continue
		}
		seen[k] = true
		areas = append(areas, v)
	}
	lim := planLimits(s.Plan)
	if len(areas) > lim.Areas {
		areas = areas[:lim.Areas]
	}
	if ind == "" || len(areas) < 2 {
		errCode(w, 400, "validation", "Isi industri dan minimal 2 wilayah.")
		return
	}
	id, err := a.startJob(r.Context(), s.OrgID, s.Plan, &s.UserID, "market_compare", len(areas), map[string]any{"industry": ind, "areas": areas}, planPriority(s.Plan))
	if replyJobErr(w, err) {
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "job": id})
}

// getCompare: hasil perbandingan diambil dari job compare terakhir org yang cocok industrinya.
func (a *App) getCompare(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	ind := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("industry")))
	var res []byte
	err := a.db.QueryRow(r.Context(), `SELECT result FROM jobs WHERE org_id=$1 AND kind='market_compare' AND status='done'
		AND lower(params->>'industry')=$2 ORDER BY id DESC LIMIT 1`, s.OrgID, ind).Scan(&res)
	if err != nil || res == nil {
		if err != nil && err != errNoRows {
			logDB("getCompare", "select jobs", err)
		}
		writeJSON(w, 200, map[string]any{"industry": ind, "areas": []any{}, "insights": []string{"Belum ada laporan untuk wilayah ini."}})
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write(res)
}

// ---------- pantau ----------

// watchesOf: semua pantauan org, dipetakan per pasangan.
func (a *App) watchesOf(w http.ResponseWriter, r *http.Request, org string) (map[string]map[string]any, bool) {
	rows := a.query(r.Context(), w, `SELECT industry, area, every_days, last_run FROM watches WHERE org_id=$1 ORDER BY created_at`, org)
	if rows == nil {
		return nil, false
	}
	defer rows.Close()
	out := map[string]map[string]any{}
	for rows.Next() {
		var ind, area string
		var every int
		var last *time.Time
		if rows.Scan(&ind, &area, &every, &last) != nil {
			continue
		}
		item := map[string]any{"industry": ind, "area": area, "every_days": every, "last_run": nil}
		if last != nil {
			item["last_run"] = last.UTC().Format(time.RFC3339)
		}
		out[pairKey(ind, area)] = item
	}
	return out, true
}

func (a *App) listWatches(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	watches, ok := a.watchesOf(w, r, s.OrgID)
	if !ok {
		return
	}
	out := make([]map[string]any, 0, len(watches))
	for _, v := range watches {
		out = append(out, v)
	}
	sort.SliceStable(out, func(i, j int) bool {
		return str(out[i], "industry")+str(out[i], "area") < str(out[j], "industry")+str(out[j], "area")
	})
	writeJSON(w, 200, out)
}

func (a *App) setWatch(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		Industry, Area string
		On             bool
		EveryDays      int    `json:"every_days"`
		LastRun        string `json:"last_run"`
	}
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	ind, area := cleanField(in.Industry, 60), cleanField(in.Area, 80)
	if ind == "" || area == "" {
		errCode(w, 400, "validation", "Isi industri dan wilayah.")
		return
	}
	ctx := r.Context()
	if !in.On {
		if !a.exec(ctx, w, `DELETE FROM watches WHERE org_id=$1 AND lower(industry)=lower($2) AND lower(area)=lower($3)`, s.OrgID, ind, area) {
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	var n int
	if err := a.db.QueryRow(ctx, `SELECT count(*) FROM watches WHERE org_id=$1`, s.OrgID).Scan(&n); err != nil {
		logDB("setWatch", "count watches", err)
		errCode(w, 500, "db_error", "Gagal membaca data, coba lagi")
		return
	}
	if n >= planLimits(s.Plan).Watches {
		errCode(w, 402, "quota_exceeded", "Jumlah wilayah pantau paket "+s.Plan+" sudah maksimal ("+strconv.Itoa(n)+").")
		return
	}
	every := in.EveryDays
	if every <= 0 {
		every = 7
	}
	if every > 90 {
		every = 90
	}
	var last *time.Time
	if t, err := time.Parse(time.RFC3339Nano, in.LastRun); err == nil {
		last = &t
	}
	if !a.exec(ctx, w, `INSERT INTO watches (org_id, industry, area, every_days, last_run) VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (org_id, lower(industry), lower(area)) DO NOTHING`, s.OrgID, ind, area, every, last) {
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------- lead ----------

func (a *App) setLead(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		Key, Name, Status string
		Note, Remind      *string
		Assignee          *string        // uuid anggota org; "" = lepas penanggung jawab; tidak dikirim = biarkan
		Features          map[string]any // snapshot fitur bisnis saat lead dibuat; disimpan sekali, tidak pernah ditimpa
	}
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	key := trunc(in.Key, 300)
	if key == "" || !leadStatuses[in.Status] {
		errCode(w, 400, "validation", "key/status tidak valid")
		return
	}
	if in.Remind != nil && *in.Remind != "" && !dateRe.MatchString(*in.Remind) {
		errCode(w, 400, "validation", "format tanggal pengingat harus YYYY-MM-DD")
		return
	}
	var remind any
	if in.Remind != nil {
		if *in.Remind == "" {
			remind = nil
		} else {
			remind = *in.Remind
		}
	}
	var assignee any
	if in.Assignee != nil && *in.Assignee != "" {
		var member bool
		if err := a.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM memberships WHERE org_id=$1 AND user_id=$2)`,
			s.OrgID, *in.Assignee).Scan(&member); err != nil || !member {
			errCode(w, 400, "validation", "Penanggung jawab harus anggota org ini.")
			return
		}
		assignee = *in.Assignee
	}
	var features any
	if len(in.Features) > 0 {
		if b, err := json.Marshal(in.Features); err == nil && len(b) <= 4000 {
			features = string(b)
		}
	}
	if !a.exec(r.Context(), w, `INSERT INTO leads (org_id, key, name, status, note, remind, assignee, features)
		VALUES ($1,$2,$3,$4,coalesce($5,''),$6::date,$8::uuid,$9::jsonb)
		ON CONFLICT (org_id, key) DO UPDATE SET name=excluded.name, status=excluded.status, updated_at=now(),
		note = CASE WHEN $5::text IS NULL THEN leads.note ELSE excluded.note END,
		remind = CASE WHEN $7::bool THEN leads.remind ELSE excluded.remind END,
		assignee = CASE WHEN $10::bool THEN leads.assignee ELSE excluded.assignee END,
		features = coalesce(leads.features, excluded.features)`,
		s.OrgID, key, trunc(in.Name, 200), in.Status, in.Note, remind, in.Remind == nil, assignee, features, in.Assignee == nil) {
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------- cek kontak ----------

// detailWait: frontend menunggu hasil Cek kontak secara sinkron (Object.assign ke baris bisnis), jadi handler
// menunggu paling lama ini. Lewat itu balas 202 dengan id job; klien bisa memantau lewat /log/stream?job=<id>.
var detailWait = 25 * time.Second

func (a *App) detail(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		ReportID int64 `json:"report_id"`
		Key      string
	}
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	key := trunc(in.Key, 300)
	if key == "" {
		errCode(w, 400, "validation", "key bisnis wajib diisi")
		return
	}
	if _, ok := a.loadReport(r, s.OrgID, in.ReportID); !ok {
		errCode(w, 400, "not_found", "laporan tidak ada")
		return
	}
	id, err := a.startJob(r.Context(), s.OrgID, s.Plan, &s.UserID, "market_detail", 1, map[string]any{"report_id": in.ReportID, "key": key}, -5)
	if replyJobErr(w, err) {
		return
	}
	j, err := a.waitJob(r.Context(), s.OrgID, id, detailWait)
	if err != nil && j != nil && (j.Status == "queued" || j.Status == "running") {
		writeJSON(w, 202, map[string]any{"ok": true, "job": id, "pending": true, "status": j.Status})
		return
	}
	if err != nil || j.Status != "done" {
		msg := "Google Maps tidak merespons, coba lagi sebentar lagi"
		if j != nil && j.Error != nil && *j.Error != "" {
			msg = *j.Error
		}
		errCode(w, 400, "job_failed", msg)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write(j.Result)
}

// ---------- prospek dan pantau ----------

// latestReports: laporan terbaru per pasangan industri+wilayah org, satu query window function. n > 0 membatasi jumlah pasangan.
func (a *App) latestReports(r *http.Request, org string, n int) []map[string]any {
	q := `SELECT id, report FROM (
			SELECT id, report, row_number() OVER (PARTITION BY lower(industry), lower(area) ORDER BY id DESC) rn
			FROM reports WHERE org_id=$1) x WHERE rn = 1 ORDER BY id DESC`
	args := []any{org}
	if n > 0 {
		q += ` LIMIT $2`
		args = append(args, n)
	}
	rows, err := a.db.Query(r.Context(), q, args...)
	if err != nil {
		logDB("latestReports", "window reports", err)
		return nil
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id int64
		var raw []byte
		if rows.Scan(&id, &raw) != nil {
			continue
		}
		var rep map[string]any
		if json.Unmarshal(raw, &rep) == nil {
			rep["id"] = id
			out = append(out, rep)
		}
	}
	return out
}

func (a *App) prospects(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	leads := a.leadsOf(r, s.OrgID)
	best := map[string]Place{}
	for _, rep := range a.latestReports(r, s.OrgID, 0) {
		for _, p := range placesOf(rep) {
			k := leadKey(p)
			if k == "" || !hasNum(p, "lead_score") {
				continue
			}
			l, hasLead := leads[k]
			if num(p, "lead_score") < 40 && !hasLead {
				continue
			}
			item := make(Place, len(p)+5)
			for kk, v := range p {
				item[kk] = v
			}
			item["key"], item["industry"], item["area"], item["report_id"] = k, rep["industry"], rep["area"], rep["id"]
			if hasLead {
				item["lead"] = l
			} else {
				item["lead"] = nil
			}
			if b, ok := best[k]; !ok || num(item, "lead_score") > num(b, "lead_score") {
				best[k] = item
			}
		}
	}
	items := make([]Place, 0, len(best))
	for _, v := range best {
		items = append(items, v)
	}
	sort.SliceStable(items, func(i, j int) bool { return num(items[i], "lead_score") > num(items[j], "lead_score") })
	writeJSON(w, 200, map[string]any{"items": items, "statuses": leadStatusList})
}

// watchData: per pasangan, laporan terbaru dan satu sebelumnya (rn <= 2) dalam satu query, tanpa N+1.
func (a *App) watchData(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	watches, ok := a.watchesOf(w, r, s.OrgID)
	if !ok {
		return
	}
	rows := a.query(r.Context(), w, `SELECT id, industry, area, report, rn FROM (
			SELECT id, industry, area, report, row_number() OVER (PARTITION BY lower(industry), lower(area) ORDER BY id DESC) rn
			FROM reports WHERE org_id=$1) x WHERE rn <= 2 ORDER BY lower(industry), lower(area), rn`, s.OrgID)
	if rows == nil {
		return
	}
	defer rows.Close()
	type pair struct{ cur, prev map[string]any }
	pairs := map[string]*pair{}
	var order []string
	for rows.Next() {
		var id int64
		var ind, area string
		var raw []byte
		var rn int
		if rows.Scan(&id, &ind, &area, &raw, &rn) != nil {
			continue
		}
		var rep map[string]any
		if json.Unmarshal(raw, &rep) != nil {
			continue
		}
		rep["id"] = id
		k := pairKey(ind, area)
		p, seen := pairs[k]
		if !seen {
			p = &pair{}
			pairs[k] = p
			order = append(order, k)
		}
		if rn == 1 {
			p.cur = rep
		} else {
			p.prev = rep
		}
	}
	out := []map[string]any{}
	for _, k := range order {
		p := pairs[k]
		if p.cur == nil {
			continue
		}
		cur := p.cur
		ind, area := str(cur, "industry"), str(cur, "area")
		item := map[string]any{"industry": ind, "area": area, "report_id": cur["id"], "created": cur["created"],
			"businesses": 0, "watch": nil, "runs": 1, "changes": nil}
		if sm, ok := cur["summary"].(map[string]any); ok {
			item["businesses"] = sm["businesses"]
		}
		if wv, ok := watches[pairKey(ind, area)]; ok {
			item["watch"] = wv
		}
		if p.prev != nil {
			item["runs"] = 2
			item["prev_created"] = p.prev["created"]
			item["changes"] = reportChanges(p.prev, cur)
		}
		out = append(out, item)
	}
	sort.SliceStable(out, func(i, j int) bool { return str(out[i], "created") > str(out[j], "created") })
	sort.SliceStable(out, func(i, j int) bool { return out[i]["watch"] != nil && out[j]["watch"] == nil })
	writeJSON(w, 200, out)
}

// ---------- log job (dipakai progress bar frontend) ----------

func (a *App) jobLog(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	j := &Job{}
	// ?job=<id> mengikuti job tertentu (poll fallback frontend saat ada antrean); tanpa itu job riset terbaru org
	var err error
	if q := r.URL.Query().Get("job"); q != "" {
		id, _ := strconv.ParseInt(q, 10, 64)
		err = a.db.QueryRow(r.Context(), `SELECT id, kind, status, params, error, created_at, started_at, finished_at FROM jobs
			WHERE org_id=$1 AND id=$2`, s.OrgID, id).
			Scan(&j.ID, &j.Kind, &j.Status, &j.Params, &j.Error, &j.Created, &j.Started, &j.Finished)
	} else {
		err = a.db.QueryRow(r.Context(), `SELECT id, kind, status, params, error, created_at, started_at, finished_at FROM jobs
			WHERE org_id=$1 AND kind IN ('market_run','market_compare') ORDER BY id DESC LIMIT 1`, s.OrgID).
			Scan(&j.ID, &j.Kind, &j.Status, &j.Params, &j.Error, &j.Created, &j.Started, &j.Finished)
	}
	if err != nil {
		if err != errNoRows {
			logDB("jobLog", "select jobs", err)
		}
		writeJSON(w, 200, map[string]any{"running": false, "log": "", "started": nil, "stopped": false, "status": "none"})
		return
	}
	running := j.Status == "queued" || j.Status == "running"
	log := ""
	if j.Status == "queued" {
		log = "Menunggu giliran worker…\n"
	} else if text, err := a.jobLogText(r.Context(), j.ID); err == nil {
		log = text
	} else {
		logDB("jobLog", "job_logs", err)
	}
	var started any
	if j.Started != nil {
		started = j.Started.Unix()
	} else if running {
		started = j.Created.Unix()
	}
	if j.Status == "failed" && j.Error != nil {
		log += "\n" + *j.Error + "\n[selesai, exit code 1]\n"
	}
	writeJSON(w, 200, map[string]any{"running": running, "log": log, "started": started, "stopped": j.Status == "cancelled", "job": j.ID, "status": j.Status})
}

func (a *App) stopJob(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	ct, err := a.db.Exec(r.Context(), `UPDATE jobs SET cancel_requested=true, status = CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
		finished_at = CASE WHEN status='queued' THEN now() ELSE finished_at END WHERE org_id=$1 AND status IN ('queued','running')`, s.OrgID)
	if err != nil {
		logDB("stopJob", "update jobs", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": ct.RowsAffected() > 0})
}

func (a *App) listJobs(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	rows := a.query(r.Context(), w, `SELECT id, kind, status, params, error, created_at, started_at, finished_at FROM jobs WHERE org_id=$1 ORDER BY id DESC LIMIT 50`, s.OrgID)
	if rows == nil {
		return
	}
	defer rows.Close()
	out := []Job{}
	for rows.Next() {
		var j Job
		if rows.Scan(&j.ID, &j.Kind, &j.Status, &j.Params, &j.Error, &j.Created, &j.Started, &j.Finished) == nil {
			out = append(out, j)
		}
	}
	writeJSON(w, 200, out)
}

// ---------- pengaturan org (pengganti localStorage) ----------

func (a *App) getSettings(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var offer string
	var goals []byte
	var nEmail, tg, whURL, whSecret string
	err := a.db.QueryRow(r.Context(), `SELECT offer, goals, notify_email, telegram_chat, webhook_url, webhook_secret FROM org_settings WHERE org_id=$1`, s.OrgID).
		Scan(&offer, &goals, &nEmail, &tg, &whURL, &whSecret)
	if err != nil && err != errNoRows {
		logDB("getSettings", "select org_settings", err)
		errCode(w, 500, "db_error", "Gagal membaca data, coba lagi")
		return
	}
	if goals == nil {
		goals = []byte("{}")
	}
	masked := ""
	if whSecret != "" {
		masked = "••••" + whSecret[max(0, len(whSecret)-4):]
	}
	writeJSON(w, 200, map[string]any{"offer": offer, "goals": json.RawMessage(goals),
		"notify_email": nEmail, "telegram_chat": tg, "webhook_url": whURL, "webhook_secret_masked": masked,
		"telegram_bot": env("TELEGRAM_BOT_TOKEN", "") != ""})
}

// putSettings: validasi semua input dulu, lalu simpan dalam satu statement (tidak ada keadaan setengah tersimpan).
// Kalau webhook_url diisi dan secret di DB kosong, secret 32 hex dibuat otomatis dan dikembalikan sekali di
// webhook_secret_generated.
func (a *App) putSettings(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		Offer         *string
		Goals         map[string]string
		NotifyEmail   *string `json:"notify_email"`
		TelegramChat  *string `json:"telegram_chat"`
		WebhookURL    *string `json:"webhook_url"`
		WebhookSecret *string `json:"webhook_secret"`
	}
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	var nEmail, tg, whURL, whSecret, offer *string
	if in.NotifyEmail != nil {
		v := trunc(*in.NotifyEmail, 200)
		if v != "" {
			addr, err := mail.ParseAddress(v)
			if err != nil || addr.Address != v {
				errCode(w, 400, "validation", "Alamat email notifikasi tidak valid.")
				return
			}
		}
		nEmail = &v
	}
	if in.TelegramChat != nil {
		v := trunc(*in.TelegramChat, 64)
		if v != "" && !telegramChatRe.MatchString(v) {
			errCode(w, 400, "validation", "ID chat Telegram hanya boleh angka (boleh diawali minus).")
			return
		}
		tg = &v
	}
	if in.WebhookURL != nil {
		v := trunc(*in.WebhookURL, 500)
		if v != "" {
			if err := validateWebhookURL(v); err != nil {
				errCode(w, 400, "validation", err.Error())
				return
			}
		}
		whURL = &v
	}
	if in.WebhookSecret != nil && *in.WebhookSecret != "" {
		v := trunc(*in.WebhookSecret, 200)
		whSecret = &v
	}
	if in.Offer != nil {
		v := trunc(*in.Offer, 300)
		offer = &v
	}
	var goals []byte
	if len(in.Goals) > 0 {
		goals, _ = json.Marshal(in.Goals)
	}
	candidate := newHexSecret(16)
	var saved string
	err := a.db.QueryRow(r.Context(), `INSERT INTO org_settings (org_id, offer, goals, notify_email, telegram_chat, webhook_url, webhook_secret)
		VALUES ($1, coalesce($2::text,''), coalesce($3::jsonb,'{}'::jsonb), coalesce($4::text,''), coalesce($5::text,''), coalesce($6::text,''),
		        CASE WHEN $7::text IS NOT NULL THEN $7::text WHEN coalesce($6::text,'') <> '' THEN $8::text ELSE '' END)
		ON CONFLICT (org_id) DO UPDATE SET
		    offer         = coalesce($2::text, org_settings.offer),
		    goals         = org_settings.goals || coalesce($3::jsonb, '{}'::jsonb),
		    notify_email  = coalesce($4::text, org_settings.notify_email),
		    telegram_chat = coalesce($5::text, org_settings.telegram_chat),
		    webhook_url   = coalesce($6::text, org_settings.webhook_url),
		    webhook_secret = CASE WHEN $7::text IS NOT NULL THEN $7::text
		                          WHEN coalesce($6::text, org_settings.webhook_url) <> '' AND org_settings.webhook_secret = '' THEN $8::text
		                          ELSE org_settings.webhook_secret END
		RETURNING webhook_secret`,
		s.OrgID, offer, goals, nEmail, tg, whURL, whSecret, candidate).Scan(&saved)
	if err != nil {
		logDB("putSettings", "upsert org_settings", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	out := map[string]any{"ok": true}
	if saved == candidate {
		out["webhook_secret_generated"] = candidate
	}
	writeJSON(w, 200, out)
}

// newHexSecret: n byte acak sebagai 2n karakter hex.
func newHexSecret(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}
