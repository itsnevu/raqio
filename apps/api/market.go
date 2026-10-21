package main

import (
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var cleanRe = regexp.MustCompile(`[^\w\s&.,/-]`)
var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
var leadStatuses = map[string]bool{"baru": true, "dihubungi": true, "tertarik": true, "deal": true, "tolak": true}

type Lead struct {
	Status  string  `json:"status"`
	Note    string  `json:"note"`
	Remind  string  `json:"remind"`
	Updated string  `json:"updated"`
	Name    *string `json:"-"`
}

func (a *App) leadsOf(r *http.Request, org string) map[string]Lead {
	rows, err := a.db.Query(r.Context(), `SELECT key, status, note, coalesce(to_char(remind,'YYYY-MM-DD'),''), updated_at FROM leads WHERE org_id=$1`, org)
	out := map[string]Lead{}
	if err != nil {
		return out
	}
	for rows.Next() {
		var k string
		var l Lead
		var t time.Time
		rows.Scan(&k, &l.Status, &l.Note, &l.Remind, &t)
		l.Updated = t.UTC().Format(time.RFC3339)
		out[k] = l
	}
	return out
}

// ---------- laporan ----------

func (a *App) listReports(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	rows, err := a.db.Query(r.Context(), `SELECT id, industry, area, created_at FROM reports WHERE org_id=$1 ORDER BY id DESC LIMIT 12`, s.OrgID)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var ind, area string
		var t time.Time
		rows.Scan(&id, &ind, &area, &t)
		out = append(out, map[string]any{"id": id, "industry": ind, "area": area, "created": t.UTC().Format(time.RFC3339)})
	}
	writeJSON(w, 200, out)
}

func (a *App) loadReport(r *http.Request, org string, id int64) (map[string]any, bool) {
	var raw []byte
	if err := a.db.QueryRow(r.Context(), `SELECT report FROM reports WHERE org_id=$1 AND id=$2`, org, id).Scan(&raw); err != nil {
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
		errJSON(w, 404, "tidak ada")
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
	var in struct{ Industry, Area string }
	readJSON(r, &in)
	ind, area := cleanField(in.Industry, 60), cleanField(in.Area, 80)
	if ind == "" || area == "" {
		errJSON(w, 400, "Isi industri dan wilayah.")
		return
	}
	if _, busy := a.activeJob(r.Context(), s.OrgID); busy {
		errJSON(w, 409, "Masih ada proses yang berjalan.")
		return
	}
	if err := a.consume(r.Context(), s.OrgID, s.Plan, "market_run", 1); err != nil {
		errJSON(w, 402, err.Error())
		return
	}
	id, err := a.enqueue(r.Context(), s.OrgID, &s.UserID, "market_run", map[string]any{"industry": ind, "area": area}, 0)
	if err != nil {
		errJSON(w, 500, "antrian")
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
	readJSON(r, &in)
	ind := cleanField(in.Industry, 60)
	areas := []string{}
	for _, x := range in.Areas {
		if v := cleanField(x, 80); v != "" {
			areas = append(areas, v)
		}
	}
	lim := planLimits(s.Plan)
	if len(areas) > lim.Areas {
		areas = areas[:lim.Areas]
	}
	if ind == "" || len(areas) < 2 {
		errJSON(w, 400, "Isi industri dan minimal 2 wilayah.")
		return
	}
	if _, busy := a.activeJob(r.Context(), s.OrgID); busy {
		errJSON(w, 409, "Masih ada proses yang berjalan.")
		return
	}
	if err := a.consume(r.Context(), s.OrgID, s.Plan, "market_run", len(areas)); err != nil {
		errJSON(w, 402, err.Error())
		return
	}
	id, err := a.enqueue(r.Context(), s.OrgID, &s.UserID, "market_compare", map[string]any{"industry": ind, "areas": areas}, 0)
	if err != nil {
		errJSON(w, 500, "antrian")
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
		writeJSON(w, 200, map[string]any{"industry": ind, "areas": []any{}, "insights": []string{"Belum ada laporan untuk wilayah ini."}})
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write(res)
}

// ---------- pantau ----------

func (a *App) listWatches(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	rows, _ := a.db.Query(r.Context(), `SELECT industry, area, every_days, last_run FROM watches WHERE org_id=$1`, s.OrgID)
	out := []map[string]any{}
	for rows.Next() {
		var ind, area string
		var every int
		var last *time.Time
		rows.Scan(&ind, &area, &every, &last)
		item := map[string]any{"industry": ind, "area": area, "every_days": every, "last_run": nil}
		if last != nil {
			item["last_run"] = last.UTC().Format(time.RFC3339)
		}
		out = append(out, item)
	}
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
	readJSON(r, &in)
	ind, area := trunc(in.Industry, 60), trunc(in.Area, 80)
	ctx := r.Context()
	if !in.On {
		a.db.Exec(ctx, `DELETE FROM watches WHERE org_id=$1 AND lower(industry)=lower($2) AND lower(area)=lower($3)`, s.OrgID, ind, area)
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	var n int
	a.db.QueryRow(ctx, `SELECT count(*) FROM watches WHERE org_id=$1`, s.OrgID).Scan(&n)
	if n >= planLimits(s.Plan).Watches {
		errJSON(w, 402, "Jumlah wilayah pantau paket "+s.Plan+" sudah maksimal ("+strconv.Itoa(n)+").")
		return
	}
	every := in.EveryDays
	if every <= 0 {
		every = 7
	}
	var last *time.Time
	if t, err := time.Parse(time.RFC3339Nano, in.LastRun); err == nil {
		last = &t
	}
	a.db.Exec(ctx, `INSERT INTO watches (org_id, industry, area, every_days, last_run) VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (org_id, lower(industry), lower(area)) DO NOTHING`, s.OrgID, ind, area, every, last)
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------- lead ----------

func (a *App) setLead(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		Key, Name, Status string
		Note, Remind      *string
	}
	readJSON(r, &in)
	key := trunc(in.Key, 300)
	if key == "" || !leadStatuses[in.Status] {
		errJSON(w, 400, "key/status tidak valid")
		return
	}
	if in.Remind != nil && *in.Remind != "" && !dateRe.MatchString(*in.Remind) {
		errJSON(w, 400, "format tanggal pengingat harus YYYY-MM-DD")
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
	_, err := a.db.Exec(r.Context(), `INSERT INTO leads (org_id, key, name, status, note, remind) VALUES ($1,$2,$3,$4,coalesce($5,''),$6::date)
		ON CONFLICT (org_id, key) DO UPDATE SET name=excluded.name, status=excluded.status, updated_at=now(),
		note = CASE WHEN $5::text IS NULL THEN leads.note ELSE excluded.note END,
		remind = CASE WHEN $7::bool THEN leads.remind ELSE excluded.remind END`,
		s.OrgID, key, trunc(in.Name, 200), in.Status, in.Note, remind, in.Remind == nil)
	if err != nil {
		errJSON(w, 500, "db")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------- cek kontak (job sinkron) ----------

func (a *App) detail(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		ReportID int64 `json:"report_id"`
		Key      string
	}
	readJSON(r, &in)
	if _, busy := a.activeJob(r.Context(), s.OrgID); busy {
		errJSON(w, 409, "Tunggu riset yang sedang jalan selesai dulu.")
		return
	}
	if _, ok := a.loadReport(r, s.OrgID, in.ReportID); !ok {
		errJSON(w, 400, "laporan tidak ada")
		return
	}
	if err := a.consume(r.Context(), s.OrgID, s.Plan, "market_detail", 1); err != nil {
		errJSON(w, 402, err.Error())
		return
	}
	id, err := a.enqueue(r.Context(), s.OrgID, &s.UserID, "market_detail", map[string]any{"report_id": in.ReportID, "key": trunc(in.Key, 300)}, -5)
	if err != nil {
		errJSON(w, 500, "antrian")
		return
	}
	j, err := a.waitJob(r.Context(), s.OrgID, id, 90*time.Second)
	if err != nil || j.Status != "done" {
		msg := "Google Maps tidak merespons, coba lagi sebentar lagi"
		if j != nil && j.Error != nil {
			msg = *j.Error
		}
		errJSON(w, 400, msg)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write(j.Result)
}

// ---------- prospek dan pantau ----------

func (a *App) latestReports(r *http.Request, org string, n int) []map[string]any {
	rows, err := a.db.Query(r.Context(), `SELECT DISTINCT ON (lower(industry), lower(area)) id, report FROM reports
		WHERE org_id=$1 ORDER BY lower(industry), lower(area), id DESC`, org)
	if err != nil {
		return nil
	}
	var out []map[string]any
	for rows.Next() {
		var id int64
		var raw []byte
		rows.Scan(&id, &raw)
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
	writeJSON(w, 200, map[string]any{"items": items, "statuses": []string{"baru", "dihubungi", "tertarik", "deal", "tolak"}})
}

func (a *App) watchData(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	ctx := r.Context()
	watches := map[string]map[string]any{}
	rows, _ := a.db.Query(ctx, `SELECT industry, area, every_days, last_run FROM watches WHERE org_id=$1`, s.OrgID)
	for rows.Next() {
		var ind, area string
		var every int
		var last *time.Time
		rows.Scan(&ind, &area, &every, &last)
		wv := map[string]any{"industry": ind, "area": area, "every_days": every, "last_run": nil}
		if last != nil {
			wv["last_run"] = last.UTC().Format(time.RFC3339)
		}
		watches[pairKey(ind, area)] = wv
	}
	out := []map[string]any{}
	for _, cur := range a.latestReports(r, s.OrgID, 0) {
		ind, area := str(cur, "industry"), str(cur, "area")
		item := map[string]any{"industry": ind, "area": area, "report_id": cur["id"], "created": cur["created"],
			"businesses": 0, "watch": nil, "runs": 1, "changes": nil}
		if sm, ok := cur["summary"].(map[string]any); ok {
			item["businesses"] = sm["businesses"]
		}
		if wv, ok := watches[pairKey(ind, area)]; ok {
			item["watch"] = wv
		}
		var raw []byte
		if err := a.db.QueryRow(ctx, `SELECT report FROM reports WHERE org_id=$1 AND lower(industry)=lower($2) AND lower(area)=lower($3) AND id<$4 ORDER BY id DESC LIMIT 1`,
			s.OrgID, ind, area, cur["id"]).Scan(&raw); err == nil {
			var prev map[string]any
			if json.Unmarshal(raw, &prev) == nil {
				item["runs"] = 2
				item["prev_created"] = prev["created"]
				item["changes"] = reportChanges(prev, cur)
			}
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
	err := a.db.QueryRow(r.Context(), `SELECT id, kind, status, params, log, error, created_at, started_at, finished_at FROM jobs
		WHERE org_id=$1 AND kind IN ('market_run','market_compare') ORDER BY id DESC LIMIT 1`, s.OrgID).
		Scan(&j.ID, &j.Kind, &j.Status, &j.Params, &j.Log, &j.Error, &j.Created, &j.Started, &j.Finished)
	if err != nil {
		writeJSON(w, 200, map[string]any{"running": false, "log": "", "started": nil, "stopped": false})
		return
	}
	running := j.Status == "queued" || j.Status == "running"
	log := j.Log
	if j.Status == "queued" {
		log = "Menunggu giliran worker…\n"
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
	ct, _ := a.db.Exec(r.Context(), `UPDATE jobs SET cancel_requested=true, status = CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
		finished_at = CASE WHEN status='queued' THEN now() ELSE finished_at END WHERE org_id=$1 AND status IN ('queued','running')`, s.OrgID)
	writeJSON(w, 200, map[string]any{"ok": ct.RowsAffected() > 0})
}

func (a *App) listJobs(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	rows, _ := a.db.Query(r.Context(), `SELECT id, kind, status, params, '', error, created_at, started_at, finished_at FROM jobs WHERE org_id=$1 ORDER BY id DESC LIMIT 50`, s.OrgID)
	out := []Job{}
	for rows.Next() {
		var j Job
		rows.Scan(&j.ID, &j.Kind, &j.Status, &j.Params, &j.Log, &j.Error, &j.Created, &j.Started, &j.Finished)
		out = append(out, j)
	}
	writeJSON(w, 200, out)
}

// ---------- pengaturan org (pengganti localStorage) ----------

func (a *App) getSettings(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var offer string
	var goals []byte
	a.db.QueryRow(r.Context(), `SELECT offer, goals FROM org_settings WHERE org_id=$1`, s.OrgID).Scan(&offer, &goals)
	if goals == nil {
		goals = []byte("{}")
	}
	writeJSON(w, 200, map[string]any{"offer": offer, "goals": json.RawMessage(goals)})
}

func (a *App) putSettings(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		Offer *string
		Goals map[string]string
	}
	readJSON(r, &in)
	ctx := r.Context()
	a.db.Exec(ctx, `INSERT INTO org_settings (org_id) VALUES ($1) ON CONFLICT DO NOTHING`, s.OrgID)
	if in.Offer != nil {
		a.db.Exec(ctx, `UPDATE org_settings SET offer=$2 WHERE org_id=$1`, s.OrgID, trunc(*in.Offer, 300))
	}
	if len(in.Goals) > 0 {
		g, _ := json.Marshal(in.Goals)
		a.db.Exec(ctx, `UPDATE org_settings SET goals = goals || $2::jsonb WHERE org_id=$1`, s.OrgID, g)
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
