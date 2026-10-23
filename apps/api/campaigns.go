// campaigns.go: outreach dari hasil riset (turn research into client).
//
// Kampanye memilih prospek dari papan (filter skor, wilayah, industri, status) dan merender pesan personal per
// prospek dari template dengan variabel {nama} {wilayah} {industri} {celah} {rating} {ulasan} {jasa} {pengirim} {audit}.
// Saluran: whatsapp (auto lewat gateway Fonnte/Wablas/generic, atau manual satu klik wa.me), instagram (manual:
// buka profil + salin pesan), email (auto lewat SMTP worker). Setiap pengiriman menandai prospek "dihubungi".
// {audit} = tautan halaman audit personal publik /p/<token> yang menampilkan posisi bisnis itu di antara pesaing
// terdekat plus penawaran org. Email dan WhatsApp auto menghormati tabel unsubscribes dan membawa tautan /u/<token>.
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var campaignChannels = map[string]bool{"whatsapp": true, "instagram": true, "email": true}

// defaultTemplates: contoh awal per saluran, bisa diubah pengguna.
var defaultTemplates = map[string]struct{ Subject, Body string }{
	"whatsapp":  {"", "Halo kak, salam kenal. Saya lihat {nama} sudah punya rating {rating} dari {ulasan} ulasan di Google Maps, keren. {celah} Kebetulan saya bantu bisnis {industri} di {wilayah} untuk {jasa}. Saya buatkan audit singkat posisi {nama} di antara pesaing sekitar: {audit}\n\nBoleh saya kirim contoh penawarannya? Terima kasih 🙏 {pengirim}"},
	"instagram": {"", "Halo kak {nama}, salam kenal. Saya bantu bisnis {industri} di {wilayah} untuk {jasa}. {celah} Saya sudah buatkan audit singkat posisi {nama} dibanding pesaing sekitar: {audit}. Kalau berkenan, saya kirim contohnya ya 🙏 {pengirim}"},
	"email":     {"Audit singkat untuk {nama}", "Halo tim {nama},\n\nSaya {pengirim}, membantu bisnis {industri} di {wilayah} untuk {jasa}.\n\n{nama} sudah punya rating {rating} dari {ulasan} ulasan di Google Maps. {celah}\n\nSaya buatkan audit singkat posisi {nama} di antara pesaing terdekat, bisa dilihat di sini: {audit}\n\nKalau berkenan, saya kirim contoh penawaran yang sesuai. Terima kasih.\n\n{pengirim}"},
}

type senderCfg struct {
	Name, Phone, ReplyTo, Provider, GatewayURL, GatewayToken, Offer string
}

func (a *App) senderOf(ctx context.Context, org string) senderCfg {
	var c senderCfg
	a.db.QueryRow(ctx, `SELECT offer, sender_name, sender_phone, reply_to, wa_provider, wa_gateway_url, wa_gateway_token FROM org_settings WHERE org_id=$1`, org).
		Scan(&c.Offer, &c.Name, &c.Phone, &c.ReplyTo, &c.Provider, &c.GatewayURL, &c.GatewayToken)
	return c
}

// prospectItems: semua prospek org (skor >= 40 atau sudah punya status), satu baris per bisnis, urut skor.
func (a *App) prospectItems(r *http.Request, org string) []Place {
	leads := a.leadsOf(r, org)
	best := map[string]Place{}
	for _, rep := range a.latestReports(r, org, 0) {
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
	return items
}

// ---------- alamat, variabel, render ----------

var nonDigit = regexp.MustCompile(`\D+`)
var igHandleRe = regexp.MustCompile(`^[A-Za-z0-9._]{1,30}$`)

func digitsOf(s string) string { return nonDigit.ReplaceAllString(s, "") }

// igHandle: terima "jpckemang", "@jpckemang", atau URL instagram.com/jpckemang.
func igHandle(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.Index(s, "instagram.com/"); i >= 0 {
		s = s[i+len("instagram.com/"):]
	}
	s = strings.TrimPrefix(s, "@")
	s = strings.SplitN(s, "/", 2)[0]
	s = strings.SplitN(s, "?", 2)[0]
	if !igHandleRe.MatchString(s) {
		return ""
	}
	return s
}

// addrFor: alamat tujuan per saluran dari data bisnis; kosong = tidak bisa dihubungi lewat saluran itu.
func addrFor(channel string, p Place) string {
	switch channel {
	case "whatsapp":
		if d := digitsOf(str(p, "whatsapp")); len(d) >= 9 {
			return d
		}
		if d := digitsOf(str(p, "phone")); len(d) >= 9 && strings.HasPrefix(d, "62") {
			return d
		}
	case "instagram":
		return igHandle(str(p, "instagram"))
	case "email":
		if xs, ok := p["emails"].([]any); ok {
			for _, x := range xs {
				if e, ok := x.(string); ok && strings.Contains(e, "@") {
					return strings.ToLower(strings.TrimSpace(e))
				}
			}
		}
	}
	return ""
}

// gapSentence: kalimat celah berbasis alasan skor, dipakai variabel {celah}.
func gapSentence(p Place) string {
	reasons := ""
	if xs, ok := p["lead_reasons"].([]any); ok {
		for _, x := range xs {
			reasons += strings.ToLower(fmt.Sprint(x)) + "|"
		}
	}
	switch {
	case strings.Contains(reasons, "tanpa website"):
		return "Saya lihat belum ada website atau katalog online, padahal banyak calon pelanggan cek dulu di Google sebelum datang."
	case strings.Contains(reasons, "ig tidak ditemukan"):
		return "Saya belum menemukan Instagram resminya, padahal banyak pelanggan cari referensi di sana."
	case strings.Contains(reasons, "review sedikit") || num(p, "reviews") < 100:
		return "Ulasannya masih bisa ditambah supaya lebih sering muncul di pencarian."
	}
	return "Masih ada ruang untuk tampil lebih menonjol dibanding pesaing sekitar."
}

func campaignVars(p Place, sender senderCfg, auditURL string) map[string]string {
	name := strings.TrimSpace(str(p, "name"))
	jasa := sender.Offer
	if jasa == "" {
		jasa = "tampil lebih menonjol secara online"
	}
	return map[string]string{
		"nama": name, "wilayah": str(p, "area"), "industri": str(p, "industry"), "celah": gapSentence(p),
		"rating": strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.1f", num(p, "rating")), "0"), "."),
		"ulasan": strconv.Itoa(int(num(p, "reviews"))), "jasa": jasa, "pengirim": sender.Name, "audit": auditURL,
	}
}

var tplVarRe = regexp.MustCompile(`\{([a-z_]+)\}`)

func renderTemplate(tpl string, vars map[string]string) string {
	out := tplVarRe.ReplaceAllStringFunc(tpl, func(m string) string {
		k := strings.Trim(m, "{}")
		if v, ok := vars[k]; ok {
			return v
		}
		return m
	})
	return strings.TrimSpace(out)
}

// ---------- token unsubscribe dan audit ----------

func (a *App) unsubToken(org, addr string) string {
	payload := base64.RawURLEncoding.EncodeToString([]byte(org + "|" + addr))
	return payload + "." + a.sign(payload)[:32]
}

func (a *App) parseUnsub(tok string) (org, addr string, ok bool) {
	i := strings.LastIndex(tok, ".")
	if i <= 0 {
		return "", "", false
	}
	payload, sig := tok[:i], tok[i+1:]
	if a.sign(payload)[:32] != sig {
		return "", "", false
	}
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return "", "", false
	}
	parts := strings.SplitN(string(raw), "|", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

// ---------- handlers ----------

type campaignRow struct {
	ID        int64          `json:"id"`
	Name      string         `json:"name"`
	Channel   string         `json:"channel"`
	Mode      string         `json:"mode"`
	Subject   string         `json:"subject"`
	Template  string         `json:"template"`
	Throttle  int            `json:"throttle_sec"`
	Status    string         `json:"status"`
	JobID     *int64         `json:"job_id"`
	CreatedAt time.Time      `json:"created_at"`
	StartedAt *time.Time     `json:"started_at"`
	Finished  *time.Time     `json:"finished_at"`
	Counts    map[string]int `json:"counts"`
}

func (a *App) campaignCounts(ctx context.Context, ids []int64) map[int64]map[string]int {
	out := map[int64]map[string]int{}
	if len(ids) == 0 {
		return out
	}
	rows, err := a.db.Query(ctx, `SELECT campaign_id, status, count(*) FROM campaign_recipients WHERE campaign_id = ANY($1) GROUP BY 1,2`, ids)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var st string
		var n int
		if rows.Scan(&id, &st, &n) == nil {
			if out[id] == nil {
				out[id] = map[string]int{}
			}
			out[id][st] = n
		}
	}
	return out
}

func (a *App) listCampaigns(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	rows := a.query(r.Context(), w, `SELECT id, name, channel, mode, subject, template, throttle_sec, status, job_id, created_at, started_at, finished_at
		FROM campaigns WHERE org_id=$1 ORDER BY id DESC LIMIT 100`, s.OrgID)
	if rows == nil {
		return
	}
	defer rows.Close()
	var list []campaignRow
	var ids []int64
	for rows.Next() {
		var c campaignRow
		if rows.Scan(&c.ID, &c.Name, &c.Channel, &c.Mode, &c.Subject, &c.Template, &c.Throttle, &c.Status, &c.JobID, &c.CreatedAt, &c.StartedAt, &c.Finished) == nil {
			list = append(list, c)
			ids = append(ids, c.ID)
		}
	}
	counts := a.campaignCounts(r.Context(), ids)
	for i := range list {
		list[i].Counts = counts[list[i].ID]
		if list[i].Counts == nil {
			list[i].Counts = map[string]int{}
		}
	}
	if list == nil {
		list = []campaignRow{}
	}
	writeJSON(w, 200, map[string]any{"campaigns": list, "templates": defaultTemplates})
}

type campaignSelect struct {
	Keys     []string `json:"keys"`
	MinScore float64  `json:"min_score"`
	Area     string   `json:"area"`
	Industry string   `json:"industry"`
	Statuses []string `json:"statuses"` // status lead; "baru" juga mencakup prospek tanpa baris lead
	Limit    int      `json:"limit"`
}

// selectProspects: terapkan pilihan eksplisit (keys) atau filter ke daftar prospek org.
func selectProspects(items []Place, sel campaignSelect) []Place {
	keys := map[string]bool{}
	for _, k := range sel.Keys {
		keys[k] = true
	}
	statuses := map[string]bool{}
	for _, s := range sel.Statuses {
		statuses[s] = true
	}
	var out []Place
	for _, p := range items {
		k := str(p, "key")
		if len(keys) > 0 {
			if !keys[k] {
				continue
			}
		} else {
			if sel.MinScore > 0 && num(p, "lead_score") < sel.MinScore {
				continue
			}
			if sel.Area != "" && !strings.Contains(strings.ToLower(str(p, "area")), strings.ToLower(sel.Area)) {
				continue
			}
			if sel.Industry != "" && !strings.Contains(strings.ToLower(str(p, "industry")), strings.ToLower(sel.Industry)) {
				continue
			}
			if len(statuses) > 0 {
				st := "baru"
				if l, ok := p["lead"].(Lead); ok && l.Status != "" {
					st = l.Status
				}
				if !statuses[st] {
					continue
				}
			}
		}
		out = append(out, p)
		if sel.Limit > 0 && len(out) >= sel.Limit {
			break
		}
	}
	return out
}

func (a *App) createCampaign(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		Name     string         `json:"name"`
		Channel  string         `json:"channel"`
		Mode     string         `json:"mode"`
		Subject  string         `json:"subject"`
		Template string         `json:"template"`
		Throttle int            `json:"throttle_sec"`
		Select   campaignSelect `json:"select"`
	}
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	if !campaignChannels[in.Channel] {
		errCode(w, 400, "validation", "Saluran harus whatsapp, instagram, atau email.")
		return
	}
	if in.Mode == "" {
		in.Mode = "manual"
	}
	if in.Mode != "auto" && in.Mode != "manual" {
		errCode(w, 400, "validation", "Mode harus auto atau manual.")
		return
	}
	if in.Channel == "instagram" && in.Mode == "auto" {
		errCode(w, 400, "validation", "Instagram hanya mode manual: DM massal otomatis membuat akun diblokir.")
		return
	}
	in.Template = strings.TrimSpace(in.Template)
	if in.Template == "" {
		in.Template = defaultTemplates[in.Channel].Body
	}
	if len([]rune(in.Template)) > 4000 {
		errCode(w, 400, "validation", "Template maksimal 4000 karakter.")
		return
	}
	if in.Channel == "email" && strings.TrimSpace(in.Subject) == "" {
		in.Subject = defaultTemplates["email"].Subject
	}
	if in.Throttle == 0 {
		in.Throttle = 90
	}
	if in.Throttle < 15 || in.Throttle > 3600 {
		errCode(w, 400, "validation", "Jeda antar pesan 15 sampai 3600 detik.")
		return
	}
	name := trunc(in.Name, 80)
	if name == "" {
		name = fmt.Sprintf("Kampanye %s %s", in.Channel, time.Now().Format("2 Jan 15:04"))
	}
	if in.Select.Limit <= 0 || in.Select.Limit > 500 {
		in.Select.Limit = 500
	}
	picked := selectProspects(a.prospectItems(r, s.OrgID), in.Select)
	if len(picked) == 0 {
		errCode(w, 400, "validation", "Tidak ada prospek yang cocok dengan pilihan.")
		return
	}
	sender := a.senderOf(r.Context(), s.OrgID)
	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	defer tx.Rollback(ctx)
	var cid int64
	if err := tx.QueryRow(ctx, `INSERT INTO campaigns (org_id, created_by, name, channel, mode, subject, template, throttle_sec)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, s.OrgID, s.UserID, name, in.Channel, in.Mode, trunc(in.Subject, 200), in.Template, in.Throttle).Scan(&cid); err != nil {
		logDB("createCampaign", "insert campaigns", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	appURL := strings.TrimRight(env("APP_URL", "http://localhost:3000"), "/")
	counts := map[string]int{"pending": 0, "skipped": 0}
	for _, p := range picked {
		addr := addrFor(in.Channel, p)
		token := newHexSecret(12)
		vars := campaignVars(p, sender, appURL+"/p/"+token)
		vars["report_id"] = fmt.Sprint(p["report_id"])
		rendered := renderTemplate(in.Template, vars)
		status, errMsg := "pending", ""
		if addr == "" {
			status, errMsg = "skipped", map[string]string{"whatsapp": "tidak ada nomor WhatsApp", "instagram": "tidak ada akun Instagram", "email": "tidak ada email"}[in.Channel]
		} else {
			var unsub int
			tx.QueryRow(ctx, `SELECT count(*) FROM unsubscribes WHERE org_id=$1 AND addr=$2`, s.OrgID, addr).Scan(&unsub)
			if unsub > 0 {
				status, errMsg = "unsubscribed", "sudah minta berhenti dihubungi"
			}
		}
		vj, _ := json.Marshal(vars)
		if _, err := tx.Exec(ctx, `INSERT INTO campaign_recipients (campaign_id, org_id, lead_key, name, to_addr, vars, rendered, audit_token, status, error)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (campaign_id, lead_key) DO NOTHING`,
			cid, s.OrgID, str(p, "key"), trunc(str(p, "name"), 200), addr, vj, rendered, token, status, errMsg); err != nil {
			logDB("createCampaign", "insert recipients", err)
			errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
			return
		}
		counts[status]++
	}
	if err := tx.Commit(ctx); err != nil {
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "id": cid, "counts": counts, "total": len(picked)})
}

// previewCampaign: render template untuk satu prospek (lead_key) atau prospek pertama yang cocok.
func (a *App) previewCampaign(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		Channel  string         `json:"channel"`
		Template string         `json:"template"`
		Subject  string         `json:"subject"`
		LeadKey  string         `json:"lead_key"`
		Select   campaignSelect `json:"select"`
	}
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	if !campaignChannels[in.Channel] {
		in.Channel = "whatsapp"
	}
	if strings.TrimSpace(in.Template) == "" {
		in.Template = defaultTemplates[in.Channel].Body
	}
	items := a.prospectItems(r, s.OrgID)
	var sample Place
	if in.LeadKey != "" {
		for _, p := range items {
			if str(p, "key") == in.LeadKey {
				sample = p
				break
			}
		}
	}
	matched := selectProspects(items, in.Select)
	if sample == nil && len(matched) > 0 {
		sample = matched[0]
	}
	reachable := 0
	for _, p := range matched {
		if addrFor(in.Channel, p) != "" {
			reachable++
		}
	}
	if sample == nil {
		writeJSON(w, 200, map[string]any{"rendered": "", "subject": in.Subject, "matched": len(matched), "reachable": reachable, "sample": nil})
		return
	}
	sender := a.senderOf(r.Context(), s.OrgID)
	vars := campaignVars(sample, sender, strings.TrimRight(env("APP_URL", "http://localhost:3000"), "/")+"/p/contoh")
	writeJSON(w, 200, map[string]any{"rendered": renderTemplate(in.Template, vars), "subject": renderTemplate(in.Subject, vars),
		"matched": len(matched), "reachable": reachable, "sample": map[string]any{"name": str(sample, "name"), "addr": addrFor(in.Channel, sample), "vars": vars}})
}

func (a *App) campaignByID(w http.ResponseWriter, r *http.Request, org string) (*campaignRow, bool) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	c := &campaignRow{}
	err := a.db.QueryRow(r.Context(), `SELECT id, name, channel, mode, subject, template, throttle_sec, status, job_id, created_at, started_at, finished_at
		FROM campaigns WHERE org_id=$1 AND id=$2`, org, id).Scan(&c.ID, &c.Name, &c.Channel, &c.Mode, &c.Subject, &c.Template, &c.Throttle, &c.Status, &c.JobID, &c.CreatedAt, &c.StartedAt, &c.Finished)
	if err != nil {
		errCode(w, 404, "not_found", "Kampanye tidak ada.")
		return nil, false
	}
	return c, true
}

func (a *App) getCampaign(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	c, ok := a.campaignByID(w, r, s.OrgID)
	if !ok {
		return
	}
	c.Counts = a.campaignCounts(r.Context(), []int64{c.ID})[c.ID]
	if c.Counts == nil {
		c.Counts = map[string]int{}
	}
	rows := a.query(r.Context(), w, `SELECT id, lead_key, name, to_addr, rendered, audit_token, status, error, sent_at FROM campaign_recipients WHERE campaign_id=$1 ORDER BY id`, c.ID)
	if rows == nil {
		return
	}
	defer rows.Close()
	recs := []map[string]any{}
	appURL := strings.TrimRight(env("APP_URL", "http://localhost:3000"), "/")
	for rows.Next() {
		var id int64
		var key, name, addr, rendered, tok, st, errMsg string
		var sentAt *time.Time
		if rows.Scan(&id, &key, &name, &addr, &rendered, &tok, &st, &errMsg, &sentAt) == nil {
			recs = append(recs, map[string]any{"id": id, "lead_key": key, "name": name, "to_addr": addr, "rendered": rendered, "status": st, "error": errMsg,
				"sent_at": sentAt, "audit_url": appURL + "/p/" + tok, "link": sendLink(c.Channel, addr, c.Subject, rendered)})
		}
	}
	writeJSON(w, 200, map[string]any{"campaign": c, "recipients": recs})
}

// sendLink: tautan satu klik untuk mode manual.
func sendLink(channel, addr, subject, body string) string {
	switch channel {
	case "whatsapp":
		return "https://wa.me/" + addr + "?text=" + url.QueryEscape(body)
	case "instagram":
		return "https://instagram.com/" + addr
	case "email":
		return "mailto:" + addr + "?subject=" + url.QueryEscape(subject) + "&body=" + url.QueryEscape(body)
	}
	return ""
}

// startCampaign: potong kuota outreach sejumlah penerima pending; mode auto membuat job campaign_send untuk worker.
func (a *App) startCampaign(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	c, ok := a.campaignByID(w, r, s.OrgID)
	if !ok {
		return
	}
	if c.Status == "done" {
		errCode(w, 409, "campaign_done", "Kampanye sudah selesai.")
		return
	}
	ctx := r.Context()
	var pending int
	a.db.QueryRow(ctx, `SELECT count(*) FROM campaign_recipients WHERE campaign_id=$1 AND status='pending'`, c.ID).Scan(&pending)
	if pending == 0 {
		errCode(w, 400, "validation", "Tidak ada penerima yang bisa dikirimi.")
		return
	}
	sender := a.senderOf(ctx, s.OrgID)
	if c.Mode == "auto" {
		if c.Channel == "whatsapp" && (sender.Provider == "" || sender.GatewayToken == "") {
			errCode(w, 400, "validation", "Mode otomatis WhatsApp butuh gateway (Fonnte, Wablas, atau generic) di Pengaturan > Pengirim.")
			return
		}
		if c.Channel == "email" && !s.Verified && !s.Guest {
			errCode(w, 403, "unverified", "Verifikasi email dulu sebelum mengirim email massal.")
			return
		}
	}
	// hanya potong kuota untuk penerima yang belum pernah dihitung (status draft -> running pertama kali, atau lanjut dari paused tanpa potong lagi)
	if c.Status == "draft" {
		if err := a.consume(ctx, s.OrgID, s.Plan, "outreach", pending); err != nil {
			replyJobErr(w, err)
			return
		}
	}
	var jobID *int64
	if c.Mode == "auto" {
		params := map[string]any{"campaign_id": c.ID, "channel": c.Channel, "throttle_sec": c.Throttle, "subject": c.Subject,
			"sender":  map[string]string{"name": sender.Name, "reply_to": sender.ReplyTo, "wa_provider": sender.Provider, "wa_gateway_url": sender.GatewayURL, "wa_gateway_token": sender.GatewayToken},
			"app_url": strings.TrimRight(env("APP_URL", "http://localhost:3000"), "/")}
		id, err := enqueueIn(ctx, a.db, s.OrgID, &s.UserID, "campaign_send", params, 5)
		if err != nil {
			logDB("startCampaign", "enqueue", err)
			errCode(w, 500, "db_error", "Gagal memulai, coba lagi")
			return
		}
		a.db.Exec(ctx, `UPDATE jobs SET max_attempts=1 WHERE id=$1`, id)
		jobID = &id
	}
	if !a.exec(ctx, w, `UPDATE campaigns SET status='running', job_id=coalesce($2, job_id), started_at=coalesce(started_at, now()) WHERE id=$1`, c.ID, jobID) {
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "status": "running", "pending": pending, "job": jobID})
}

func (a *App) pauseCampaign(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	c, ok := a.campaignByID(w, r, s.OrgID)
	if !ok {
		return
	}
	if c.JobID != nil {
		a.db.Exec(r.Context(), `UPDATE jobs SET cancel_requested=true, status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END WHERE id=$1 AND org_id=$2 AND status IN ('queued','running')`, *c.JobID, s.OrgID)
	}
	if !a.exec(r.Context(), w, `UPDATE campaigns SET status='paused' WHERE id=$1 AND status='running'`, c.ID) {
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "status": "paused"})
}

// nextRecipient: mode manual, penerima pending berikutnya beserta tautan satu klik.
func (a *App) nextRecipient(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	c, ok := a.campaignByID(w, r, s.OrgID)
	if !ok {
		return
	}
	var id int64
	var key, name, addr, rendered, tok string
	err := a.db.QueryRow(r.Context(), `SELECT id, lead_key, name, to_addr, rendered, audit_token FROM campaign_recipients WHERE campaign_id=$1 AND status='pending' ORDER BY id LIMIT 1`, c.ID).
		Scan(&id, &key, &name, &addr, &rendered, &tok)
	if err != nil {
		writeJSON(w, 200, map[string]any{"done": true})
		return
	}
	var left int
	a.db.QueryRow(r.Context(), `SELECT count(*) FROM campaign_recipients WHERE campaign_id=$1 AND status='pending'`, c.ID).Scan(&left)
	appURL := strings.TrimRight(env("APP_URL", "http://localhost:3000"), "/")
	writeJSON(w, 200, map[string]any{"done": false, "left": left, "recipient": map[string]any{"id": id, "lead_key": key, "name": name, "to_addr": addr,
		"rendered": rendered, "subject": c.Subject, "link": sendLink(c.Channel, addr, c.Subject, rendered), "audit_url": appURL + "/p/" + tok}})
}

// markRecipient: pengguna menandai hasil kirim manual (sent, skipped, replied, failed). sent -> lead dihubungi, replied -> tertarik.
func (a *App) markRecipient(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	c, ok := a.campaignByID(w, r, s.OrgID)
	if !ok {
		return
	}
	var in struct {
		RecipientID int64  `json:"recipient_id"`
		Status      string `json:"status"`
	}
	readJSON(r, &in)
	if in.Status != "sent" && in.Status != "skipped" && in.Status != "replied" && in.Status != "failed" {
		errCode(w, 400, "validation", "Status harus sent, skipped, replied, atau failed.")
		return
	}
	ctx := r.Context()
	var key, name string
	if err := a.db.QueryRow(ctx, `UPDATE campaign_recipients SET status=$3, sent_at=CASE WHEN $3 IN ('sent','replied') THEN coalesce(sent_at, now()) ELSE sent_at END
		WHERE id=$1 AND campaign_id=$2 RETURNING lead_key, name`, in.RecipientID, c.ID, in.Status).Scan(&key, &name); err != nil {
		errCode(w, 404, "not_found", "Penerima tidak ada.")
		return
	}
	a.touchLead(ctx, s.OrgID, key, name, in.Status, c.Name)
	var left int
	a.db.QueryRow(ctx, `SELECT count(*) FROM campaign_recipients WHERE campaign_id=$1 AND status='pending'`, c.ID).Scan(&left)
	if left == 0 && c.Mode == "manual" {
		a.db.Exec(ctx, `UPDATE campaigns SET status='done', finished_at=now() WHERE id=$1 AND status='running'`, c.ID)
	}
	writeJSON(w, 200, map[string]any{"ok": true, "left": left})
}

// touchLead: status prospek mengikuti hasil outreach (sent -> dihubungi, replied -> tertarik), tanpa menurunkan status yang lebih maju.
func (a *App) touchLead(ctx context.Context, org, key, name, result, campaignName string) {
	target := ""
	switch result {
	case "sent":
		target = "dihubungi"
	case "replied":
		target = "tertarik"
	}
	if target == "" {
		return
	}
	rank := map[string]int{"baru": 0, "dihubungi": 1, "tertarik": 2, "deal": 3, "tolak": 3}
	note := fmt.Sprintf("[kampanye %s] %s %s", campaignName, result, time.Now().Format("2 Jan"))
	// status hanya naik (baru -> dihubungi -> tertarik); deal/tolak tidak diubah
	a.db.Exec(ctx, `INSERT INTO leads (org_id, key, name, status, note) VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (org_id, key) DO UPDATE SET
		  status = CASE WHEN (CASE leads.status WHEN 'baru' THEN 0 WHEN 'dihubungi' THEN 1 WHEN 'tertarik' THEN 2 ELSE 3 END) < $6 THEN $4 ELSE leads.status END,
		  note = CASE WHEN leads.note = '' THEN $5 ELSE left(leads.note || E'
' || $5, 2000) END,
		  updated_at = now()`,
		org, key, name, target, note, rank[target])
}

// ---------- publik: unsubscribe dan audit ----------

func (a *App) unsubscribe(w http.ResponseWriter, r *http.Request) {
	org, addr, ok := a.parseUnsub(r.PathValue("token"))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if !ok {
		w.WriteHeader(400)
		fmt.Fprint(w, "<!doctype html><meta charset=utf-8><title>Tautan tidak valid</title><p style='font-family:sans-serif'>Tautan tidak valid.</p>")
		return
	}
	a.db.Exec(r.Context(), `INSERT INTO unsubscribes (org_id, addr) VALUES ($1,$2) ON CONFLICT DO NOTHING`, org, addr)
	a.db.Exec(r.Context(), `UPDATE campaign_recipients SET status='unsubscribed', error='minta berhenti' WHERE org_id=$1 AND to_addr=$2 AND status='pending'`, org, addr)
	fmt.Fprintf(w, "<!doctype html><meta charset=utf-8><title>Berhenti dihubungi</title><p style='font-family:sans-serif;max-width:520px;margin:48px auto'>Terima kasih. <b>%s</b> tidak akan dihubungi lagi oleh pengirim ini.</p>", html.EscapeString(addr))
}

// auditPublic: data halaman audit personal /p/<token>: bisnis, celah, 5 pesaing terdekat terkuat, dan penawaran org.
func (a *App) auditPublic(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	if len(tok) < 8 {
		errCode(w, 404, "not_found", "tidak ada")
		return
	}
	var org, key string
	var vars []byte
	if err := a.db.QueryRow(r.Context(), `SELECT org_id, lead_key, vars FROM campaign_recipients WHERE audit_token=$1`, tok).Scan(&org, &key, &vars); err != nil {
		errCode(w, 404, "not_found", "tidak ada")
		return
	}
	var v map[string]string
	json.Unmarshal(vars, &v)
	rid, _ := strconv.ParseInt(v["report_id"], 10, 64)
	rep, ok := a.loadReport(r, org, rid)
	if !ok {
		errCode(w, 404, "not_found", "laporan sudah tidak ada")
		return
	}
	var me Place
	var others []Place
	for _, p := range placesOf(rep) {
		if leadKey(p) == key {
			me = p
			continue
		}
		others = append(others, p)
	}
	if me == nil {
		errCode(w, 404, "not_found", "bisnis sudah tidak ada di laporan")
		return
	}
	sort.SliceStable(others, func(i, j int) bool { return num(others[i], "reviews") > num(others[j], "reviews") })
	if len(others) > 5 {
		others = others[:5]
	}
	slim := func(p Place) map[string]any {
		return map[string]any{"name": str(p, "name"), "rating": num(p, "rating"), "reviews": int(num(p, "reviews")), "category": str(p, "category"),
			"has_website": str(p, "website") != "", "has_instagram": str(p, "instagram") != ""}
	}
	comp := []map[string]any{}
	rank := 1
	for _, p := range placesOf(rep) {
		if num(p, "reviews") > num(me, "reviews") {
			rank++
		}
	}
	for _, p := range others {
		comp = append(comp, slim(p))
	}
	sender := a.senderOf(r.Context(), org)
	var orgName string
	a.db.QueryRow(r.Context(), `SELECT name FROM orgs WHERE id=$1`, org).Scan(&orgName)
	writeJSON(w, 200, map[string]any{
		"business":    slim(me),
		"gap":         gapSentence(me),
		"rank":        rank,
		"total":       len(placesOf(rep)),
		"industry":    str(rep, "industry"),
		"area":        str(rep, "area"),
		"competitors": comp,
		"summary":     rep["summary"],
		"offer":       map[string]string{"org": orgName, "sender": sender.Name, "phone": digitsOf(sender.Phone), "jasa": sender.Offer},
		"created":     str(rep, "created"),
	})
}

// ---------- pengaturan pengirim ----------

func (a *App) getSender(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	c := a.senderOf(r.Context(), s.OrgID)
	masked := ""
	if c.GatewayToken != "" {
		masked = "••••" + c.GatewayToken[max(0, len(c.GatewayToken)-4):]
	}
	writeJSON(w, 200, map[string]any{"sender_name": c.Name, "sender_phone": c.Phone, "reply_to": c.ReplyTo, "wa_provider": c.Provider,
		"wa_gateway_url": c.GatewayURL, "wa_gateway_token_masked": masked, "offer": c.Offer})
}

func (a *App) putSender(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		SenderName   *string `json:"sender_name"`
		SenderPhone  *string `json:"sender_phone"`
		ReplyTo      *string `json:"reply_to"`
		WaProvider   *string `json:"wa_provider"`
		WaGatewayURL *string `json:"wa_gateway_url"`
		WaToken      *string `json:"wa_gateway_token"`
	}
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	var name, phone, reply, prov, gurl, tok *string
	if in.SenderName != nil {
		v := trunc(*in.SenderName, 80)
		name = &v
	}
	if in.SenderPhone != nil {
		v := digitsOf(*in.SenderPhone)
		if v != "" && (len(v) < 9 || !strings.HasPrefix(v, "62")) {
			errCode(w, 400, "validation", "Nomor WhatsApp pengirim format 62xxxxxxxxxx.")
			return
		}
		phone = &v
	}
	if in.ReplyTo != nil {
		v := trunc(*in.ReplyTo, 200)
		if v != "" && !strings.Contains(v, "@") {
			errCode(w, 400, "validation", "Reply-to harus alamat email.")
			return
		}
		reply = &v
	}
	if in.WaProvider != nil {
		v := *in.WaProvider
		if v != "" && v != "fonnte" && v != "wablas" && v != "generic" {
			errCode(w, 400, "validation", "Provider WhatsApp: fonnte, wablas, atau generic.")
			return
		}
		prov = &v
	}
	if in.WaGatewayURL != nil {
		v := trunc(*in.WaGatewayURL, 500)
		if v != "" {
			if err := validateWebhookURL(v); err != nil {
				errCode(w, 400, "validation", "URL gateway: "+err.Error())
				return
			}
		}
		gurl = &v
	}
	if in.WaToken != nil && *in.WaToken != "" {
		v := trunc(*in.WaToken, 300)
		tok = &v
	}
	if !a.exec(r.Context(), w, `INSERT INTO org_settings (org_id, sender_name, sender_phone, reply_to, wa_provider, wa_gateway_url, wa_gateway_token)
		VALUES ($1, coalesce($2,''), coalesce($3,''), coalesce($4,''), coalesce($5,''), coalesce($6,''), coalesce($7,''))
		ON CONFLICT (org_id) DO UPDATE SET
		  sender_name = coalesce($2, org_settings.sender_name), sender_phone = coalesce($3, org_settings.sender_phone),
		  reply_to = coalesce($4, org_settings.reply_to), wa_provider = coalesce($5, org_settings.wa_provider),
		  wa_gateway_url = coalesce($6, org_settings.wa_gateway_url), wa_gateway_token = coalesce($7, org_settings.wa_gateway_token)`,
		s.OrgID, name, phone, reply, prov, gurl, tok) {
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
