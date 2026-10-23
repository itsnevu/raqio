// alerts.go: pantauan jadi alert bermakna.
//
// Loop alertLoop memeriksa laporan baru, membandingkan dengan laporan sebelumnya untuk pasangan industri+wilayah
// yang sama di org itu, menilai seberapa penting perubahannya, menyimpannya ke watch_alerts (dalam transaksi yang
// sama dengan penandaan alerted=true), lalu menyerahkan pengiriman ke worker pool notifikasi: email, Telegram, dan
// webhook (lewat outbox, ditandatangani HMAC). Setiap laporan hasil pindai (bukan salinan cache) juga memicu
// webhook "report.done" supaya integrasi pelanggan bisa menarik hasilnya.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ---------- penilaian perubahan ----------

// alertSeverity: bobot per jenis perubahan. Pesaing tutup dan rating turun paling menarik buat pengguna.
func alertSeverity(ch map[string][]Place) int {
	return 2*len(ch["new"]) + 3*len(ch["gone"]) + 2*len(ch["rating_down"]) + len(ch["rating_up"]) + len(ch["reviews_jump"])
}

// alertSummary: kalimat ringkas bahasa manusia, dipakai di UI, email, Telegram, dan webhook.
func alertSummary(industry, area string, ch map[string][]Place) string {
	var parts []string
	add := func(n int, s string) {
		if n > 0 {
			parts = append(parts, fmt.Sprintf("%d %s", n, s))
		}
	}
	add(len(ch["new"]), "pesaing baru")
	add(len(ch["gone"]), "hilang dari peta")
	add(len(ch["rating_down"]), "rating turun")
	add(len(ch["rating_up"]), "rating naik")
	add(len(ch["reviews_jump"]), "sedang ramai")
	if len(parts) == 0 {
		return ""
	}
	return fmt.Sprintf("%s di %s: %s.", industry, area, strings.Join(parts, ", "))
}

// alertDetail: beberapa nama teratas per jenis, untuk badan pesan.
func alertDetail(ch map[string][]Place) string {
	var b strings.Builder
	line := func(title, key string, fmtOne func(Place) string) {
		ps := ch[key]
		if len(ps) == 0 {
			return
		}
		b.WriteString(title + ":\n")
		for i, p := range ps {
			if i == 5 {
				fmt.Fprintf(&b, "  dan %d lainnya\n", len(ps)-5)
				break
			}
			b.WriteString("  - " + fmtOne(p) + "\n")
		}
	}
	line("Pesaing baru", "new", func(p Place) string {
		return fmt.Sprintf("%s (rating %.1f, %d ulasan)", str(p, "name"), num(p, "rating"), int(num(p, "reviews")))
	})
	line("Hilang dari peta", "gone", func(p Place) string { return str(p, "name") })
	line("Rating turun", "rating_down", func(p Place) string { return fmt.Sprintf("%s (%.1f)", str(p, "name"), num(p, "delta")) })
	line("Rating naik", "rating_up", func(p Place) string { return fmt.Sprintf("%s (+%.1f)", str(p, "name"), num(p, "delta")) })
	line("Sedang ramai", "reviews_jump", func(p Place) string { return fmt.Sprintf("%s (+%d ulasan)", str(p, "name"), int(num(p, "delta"))) })
	return b.String()
}

// ---------- loop ----------

func (a *App) alertLoop(ctx context.Context) {
	for {
		if release, ok := a.tryLock(ctx, lockAlert); ok {
			a.processNewReports(ctx)
			release()
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Minute):
		}
	}
}

// processNewReports: ambil laporan yang belum diperiksa (FOR UPDATE SKIP LOCKED, maksimal 100), tandai alerted,
// buat alert dan antrekan webhook report.done dalam SATU transaksi. Notifikasi dikirim setelah commit lewat worker pool.
func (a *App) processNewReports(ctx context.Context) {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		logDB("alert", "begin", err)
		return
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `UPDATE reports SET alerted=true
		WHERE id IN (SELECT id FROM reports WHERE alerted=false ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED)
		RETURNING id, org_id, industry, area, report, cached_from`)
	if err != nil {
		logDB("alert", "claim reports", err)
		return
	}
	type rep struct {
		id       int64
		org, ind string
		area     string
		raw      []byte
		cached   *int64
	}
	var list []rep
	for rows.Next() {
		var r rep
		if rows.Scan(&r.id, &r.org, &r.ind, &r.area, &r.raw, &r.cached) == nil {
			list = append(list, r)
		}
	}
	rows.Close()
	if len(list) == 0 {
		return
	}
	sort.Slice(list, func(i, j int) bool { return list[i].id < list[j].id })

	var tasks []alertTask
	for _, r := range list {
		var cur map[string]any
		if json.Unmarshal(r.raw, &cur) != nil {
			continue
		}
		cur["id"] = r.id
		if r.cached == nil { // salinan cache bukan hasil pindai baru: jangan picu report.done
			if err := webhookIn(ctx, tx, r.org, "report.done", map[string]any{"report_id": r.id, "industry": r.ind, "area": r.area,
				"businesses": summaryCount(cur), "cached": false}); err != nil {
				logDB("alert", "outbox report.done", err)
				return
			}
		}
		var prevID int64
		var prevRaw []byte
		if err := tx.QueryRow(ctx, `SELECT id, report FROM reports WHERE org_id=$1 AND lower(industry)=lower($2) AND lower(area)=lower($3) AND id<$4 ORDER BY id DESC LIMIT 1`,
			r.org, r.ind, r.area, r.id).Scan(&prevID, &prevRaw); err != nil {
			continue // laporan pertama untuk pasangan ini: tidak ada yang dibandingkan
		}
		var prev map[string]any
		if json.Unmarshal(prevRaw, &prev) != nil {
			continue
		}
		ch := reportChanges(prev, cur)
		sum := alertSummary(r.ind, r.area, ch)
		if sum == "" {
			continue
		}
		chJSON, _ := json.Marshal(ch)
		var alertID int64
		if err := tx.QueryRow(ctx, `INSERT INTO watch_alerts (org_id, report_id, prev_report_id, industry, area, severity, summary, changes)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, r.org, r.id, prevID, r.ind, r.area, alertSeverity(ch), sum, chJSON).Scan(&alertID); err != nil {
			logDB("alert", "insert watch_alerts", err)
			return
		}
		tasks = append(tasks, alertTask{org: r.org, alertID: alertID, industry: r.ind, area: r.area, summary: sum, detail: alertDetail(ch), ch: ch})
	}
	if err := tx.Commit(ctx); err != nil {
		logDB("alert", "commit", err)
		return
	}
	for _, t := range tasks {
		enqueueNotify("alert "+strconv.FormatInt(t.alertID, 10), func() {
			a.notifyAlert(t.org, t.alertID, t.industry, t.area, t.summary, t.detail, t.ch)
		})
	}
}

func summaryCount(rep map[string]any) int {
	if sm, ok := rep["summary"].(map[string]any); ok {
		if n, ok := sm["businesses"].(float64); ok {
			return int(n)
		}
	}
	return len(placesOf(rep))
}

// ---------- worker pool notifikasi ----------

type alertTask struct {
	org                             string
	alertID                         int64
	industry, area, summary, detail string
	ch                              map[string][]Place
}

const notifyWorkers = 2

var (
	notifyQ    = make(chan func(), 100)
	notifyOnce sync.Once
)

// enqueueNotify: serahkan pengiriman (alert pantauan, pengingat lead) ke 2 worker tetap, bukan goroutine per
// pemberitahuan. Kalau antrean penuh, dilewati dengan log; alert tetap tersimpan dan terlihat di UI, hanya
// pemberitahuannya yang tidak terkirim. label hanya untuk log.
func enqueueNotify(label string, run func()) {
	notifyOnce.Do(func() {
		for i := 0; i < notifyWorkers; i++ {
			go func() {
				for run := range notifyQ {
					run()
				}
			}()
		}
	})
	select {
	case notifyQ <- run:
	default:
		slog.Warn("antrean notifikasi penuh, pemberitahuan tidak dikirim", "apa", label)
	}
}

// ---------- saluran notifikasi ----------

type notifyCfg struct {
	Email, Telegram, WebhookURL, WebhookSecret string
}

func (a *App) notifyCfgOf(ctx context.Context, org string) notifyCfg {
	var c notifyCfg
	err := a.db.QueryRow(ctx, `SELECT notify_email, telegram_chat, webhook_url, webhook_secret FROM org_settings WHERE org_id=$1`, org).
		Scan(&c.Email, &c.Telegram, &c.WebhookURL, &c.WebhookSecret)
	if err != nil && err != errNoRows {
		logDB("notifyCfg", "select org_settings", err)
	}
	return c
}

// orgRecipients: notify_email kalau diisi, kalau tidak semua owner/admin org (akun tamu tidak punya email asli).
func (a *App) orgRecipients(ctx context.Context, org string, cfg notifyCfg) []string {
	if cfg.Email != "" {
		return []string{cfg.Email}
	}
	rows, err := a.db.Query(ctx, `SELECT u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND m.role IN ('owner','admin') AND u.deleted_at IS NULL AND u.email NOT LIKE '%@'||$2`, org, guestDomain)
	if err != nil {
		logDB("notify", "select penerima", err)
		return nil
	}
	defer rows.Close()
	var to []string
	for rows.Next() {
		var e string
		if rows.Scan(&e) == nil {
			to = append(to, e)
		}
	}
	return to
}

// notifyOrgChannels: kirim email (subjek + badan teks) dan pesan Telegram (HTML) ke saluran org. Webhook tidak
// termasuk: pemanggil mengantrekannya sendiri lewat outbox (a.webhook atau webhookIn di transaksinya).
func (a *App) notifyOrgChannels(ctx context.Context, org string, cfg notifyCfg, subject, body, html string) {
	for _, e := range a.orgRecipients(ctx, org, cfg) {
		if err := a.mail.Send(e, subject, body); err != nil {
			slog.Warn("email notifikasi", "err", redactErr(err))
		}
	}
	if cfg.Telegram != "" {
		a.telegram(cfg.Telegram, html)
	}
}

func (a *App) notifyAlert(org string, alertID int64, industry, area, summary, detail string, ch map[string][]Place) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cfg := a.notifyCfgOf(ctx, org)
	link := a.appURL("/watch")
	body := summary + "\n\n" + detail + "\nLihat detail: " + link
	a.notifyOrgChannels(ctx, org, cfg, "Raqio: "+summary, body, "<b>Raqio pantau</b>\n"+htmlEsc(summary)+"\n\n<pre>"+htmlEsc(detail)+"</pre>"+link)
	a.webhook(org, "watch.alert", map[string]any{"alert_id": alertID, "industry": industry, "area": area, "summary": summary, "changes": ch})
	a.execLog(ctx, `UPDATE watch_alerts SET notified_at=now() WHERE id=$1`, alertID)
}

func htmlEsc(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(s)
}

// telegram: bot server-level (TELEGRAM_BOT_TOKEN), chat id milik org. Error di-log lewat redactErr supaya token
// bot (ada di URL) tidak bocor ke log.
func (a *App) telegram(chat, html string) {
	tok := env("TELEGRAM_BOT_TOKEN", "")
	if tok == "" {
		slog.Info("telegram (tidak dikirim, TELEGRAM_BOT_TOKEN kosong)", "chat", chat)
		return
	}
	form := url.Values{"chat_id": {chat}, "text": {html}, "parse_mode": {"HTML"}, "disable_web_page_preview": {"true"}}
	cl := safeHTTPClient(10 * time.Second)
	resp, err := cl.PostForm("https://api.telegram.org/bot"+tok+"/sendMessage", form)
	if err != nil {
		slog.Warn("telegram", "err", redactErr(err))
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		slog.Warn("telegram", "status", resp.StatusCode)
	}
}

// ---------- endpoint ----------

// GET /watch/alerts: 50 alert terbaru org, yang belum dibaca di depan.
func (a *App) listAlerts(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	rows := a.query(r.Context(), w, `SELECT id, report_id, prev_report_id, industry, area, severity, summary, changes, created_at, notified_at, read_at
		FROM watch_alerts WHERE org_id=$1 ORDER BY (read_at IS NULL) DESC, id DESC LIMIT 50`, s.OrgID)
	if rows == nil {
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	unread := 0
	for rows.Next() {
		var id, rid int64
		var prev *int64
		var ind, area, sum string
		var sev int
		var ch []byte
		var created time.Time
		var notified, read *time.Time
		if rows.Scan(&id, &rid, &prev, &ind, &area, &sev, &sum, &ch, &created, &notified, &read) != nil {
			continue
		}
		if read == nil {
			unread++
		}
		out = append(out, map[string]any{"id": id, "report_id": rid, "prev_report_id": prev, "industry": ind, "area": area, "severity": sev,
			"summary": sum, "changes": json.RawMessage(ch), "created_at": created, "notified_at": notified, "read_at": read})
	}
	writeJSON(w, 200, map[string]any{"alerts": out, "unread": unread})
}

// POST /watch/alerts/read {id} atau {all:true}
func (a *App) readAlerts(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct {
		ID  int64
		All bool
	}
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	if in.All {
		if !a.exec(r.Context(), w, `UPDATE watch_alerts SET read_at=now() WHERE org_id=$1 AND read_at IS NULL`, s.OrgID) {
			return
		}
	} else if !a.exec(r.Context(), w, `UPDATE watch_alerts SET read_at=now() WHERE org_id=$1 AND id=$2`, s.OrgID, in.ID) {
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// POST /org/webhook/test: kirim event "ping" ke webhook org secara sinkron, satu percobaan, timeout 5 detik.
func (a *App) testWebhook(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	cfg := a.notifyCfgOf(r.Context(), s.OrgID)
	if cfg.WebhookURL == "" {
		errCode(w, 400, "validation", "Webhook URL belum diisi.")
		return
	}
	payload := map[string]any{"event": "ping", "org_id": s.OrgID, "at": time.Now().UTC().Format(time.RFC3339), "data": map[string]any{"message": "halo dari Raqio"}}
	body, _ := json.Marshal(payload)
	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
	defer cancel()
	err := deliverOnce(ctx, safeHTTPClient(5*time.Second), cfg.WebhookURL, cfg.WebhookSecret, "ping", body)
	if err != nil {
		writeJSON(w, 200, map[string]any{"ok": false, "error": trunc(redactErr(err), 200)})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------- hasil instan dari cache lintas org ----------

// ---------- pencocokan industri untuk cache hasil instan ----------

// industryTypos: salah ketik umum yang membuat cache meleset ("coffe shop" vs "coffee shop").
var industryTypos = map[string]string{"coffe": "coffee", "cofee": "coffee", "cofe": "coffee", "cafee": "cafe",
	"restorant": "restoran", "restauran": "restoran", "lundry": "laundry", "loundry": "laundry"}

// industryGroups: cermin INDUSTRY_ALIASES di services/scraper/datastore.py, urut tetap supaya hasil deterministik.
var industryGroups = []struct {
	group   string
	aliases []string
}{
	{"agency", []string{"agency", "agensi", "agen digital", "creative", "kreatif", "marketing", "advertising", "branding"}},
	{"coffee", []string{"coffee", "kopi", "cafe", "kafe", "café"}},
	{"salon", []string{"salon", "barber", "kecantikan", "beauty"}},
	{"restaurant", []string{"resto", "restoran", "restaurant", "rumah makan"}},
	{"gym", []string{"gym", "fitness"}},
	{"laundry", []string{"laundry"}},
	{"bakery", []string{"bakery", "roti", "kue"}},
	{"clinic", []string{"klinik", "clinic"}},
	{"dentist", []string{"gigi", "dental", "dentist"}},
	{"printing", []string{"percetakan", "printing", "fotokopi", "fotocopy"}},
	{"property", []string{"properti", "property", "real estate"}},
	{"wedding", []string{"wedding", "pernikahan"}},
	{"catering", []string{"katering", "catering"}},
	{"software", []string{"software", "aplikasi", "developer"}},
}

// normIndustry: kunci pembanding industri — huruf kecil, spasi rapat, typo umum diperbaiki, lalu dipetakan
// ke grup alias. "coffe shop", "coffee shop", dan "kedai kopi" jatuh ke kunci yang sama.
func normIndustry(s string) string {
	words := strings.Fields(strings.ToLower(s))
	for i, w := range words {
		if t, ok := industryTypos[w]; ok {
			words[i] = t
		}
	}
	joined := " " + strings.Join(words, " ") + " "
	for _, g := range industryGroups {
		for _, al := range g.aliases {
			if strings.Contains(joined, al) {
				return g.group
			}
		}
	}
	return strings.TrimSpace(joined)
}

// resolveCachedIndustry: samakan ejaan industri dengan laporan tersimpan untuk wilayah ini supaya typo/alias
// tetap kena cache hasil instan. Mengembalikan ejaan tersimpan yang cocok, atau input apa adanya.
func (a *App) resolveCachedIndustry(ctx context.Context, industry, area string) string {
	days := envInt("MARKET_CACHE_DAYS", 7)
	rows, err := a.db.Query(ctx, `SELECT DISTINCT industry FROM reports
		WHERE lower(area)=lower($1) AND cached_from IS NULL AND created_at > now() - make_interval(days => $2)`, area, days)
	if err != nil {
		return industry
	}
	defer rows.Close()
	norm := normIndustry(industry)
	for rows.Next() {
		var c string
		if rows.Scan(&c) != nil {
			continue
		}
		if strings.EqualFold(c, industry) {
			return industry // ejaan persis sudah ada, tidak perlu diganti
		}
		if normIndustry(c) == norm {
			return c
		}
	}
	return industry
}

// cachedReport: laporan terbaru org mana pun untuk industri+wilayah yang sama dalam MARKET_CACHE_DAYS hari.
// Hanya hasil pindai asli (cached_from IS NULL) yang dijadikan sumber.
func (a *App) cachedReport(ctx context.Context, industry, area string) (srcID int64, srcOrg string, raw []byte, created time.Time, ok bool) {
	days := envInt("MARKET_CACHE_DAYS", 7)
	err := a.db.QueryRow(ctx, `SELECT id, org_id, report, created_at FROM reports
		WHERE lower(industry)=lower($1) AND lower(area)=lower($2) AND cached_from IS NULL AND created_at > now() - make_interval(days => $3)
		ORDER BY id DESC LIMIT 1`, industry, area, days).Scan(&srcID, &srcOrg, &raw, &created)
	return srcID, srcOrg, raw, created, err == nil
}

// copyCachedReport: salin ke org pemanggil sebagai laporan baru (tanpa job, tanpa kuota). Hanya data dasar Maps yang
// disalin: kontak hasil "Cek kontak" berbayar org asal (telepon, website, IG, email) dan lead dibuang, dan id sumber
// tidak ikut di JSON (hanya di kolom cached_from). Kalau org sudah punya salinan dari sumber yang sama, id lama dikembalikan.
func (a *App) copyCachedReport(ctx context.Context, org string, industry, area string, srcID int64, raw []byte) (int64, error) {
	var existing int64
	if err := a.db.QueryRow(ctx, `SELECT id FROM reports WHERE org_id=$1 AND cached_from=$2 ORDER BY id DESC LIMIT 1`, org, srcID).Scan(&existing); err == nil {
		return existing, nil
	}
	var rep map[string]any
	if err := json.Unmarshal(raw, &rep); err != nil {
		return 0, err
	}
	stripContactFields(rep)
	delete(rep, "cached_from")
	rep["industry"], rep["area"] = industry, area
	out, _ := json.Marshal(rep)
	summary, _ := json.Marshal(summaryOf(rep))
	var id int64
	err := a.db.QueryRow(ctx, `INSERT INTO reports (org_id, industry, area, report, summary, cached_from) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		org, industry, area, out, summary, srcID).Scan(&id)
	return id, err
}

// suggestCurated: pasangan yang dikurasi lewat env SUGGEST_CURATED="industri|wilayah;industri|wilayah".
func suggestCurated() map[string]bool {
	out := map[string]bool{}
	for _, item := range strings.Split(os.Getenv("SUGGEST_CURATED"), ";") {
		ind, area, ok := strings.Cut(item, "|")
		if ok && strings.TrimSpace(ind) != "" && strings.TrimSpace(area) != "" {
			out[pairKey(ind, area)] = true
		}
	}
	return out
}

// GET /market/suggest: pasangan industri+wilayah yang hasilnya tersedia instan. Supaya tidak membocorkan apa yang
// diriset satu org tertentu, hanya pasangan yang dipindai oleh minimal SUGGEST_MIN_ORGS org berbeda (default 2),
// atau yang dikurasi lewat SUGGEST_CURATED. Tidak ada informasi org di respons.
func (a *App) suggest(w http.ResponseWriter, r *http.Request) {
	days := envInt("MARKET_CACHE_DAYS", 7)
	minOrgs := envInt("SUGGEST_MIN_ORGS", 2)
	curated := suggestCurated()
	rows := a.query(r.Context(), w, `WITH recent AS (
			SELECT id, org_id, industry, area, created_at,
			       coalesce((summary->>'businesses')::int, (report->'summary'->>'businesses')::int, 0) AS n
			FROM reports WHERE created_at > now() - make_interval(days => $1) AND cached_from IS NULL)
		SELECT (array_agg(industry ORDER BY id DESC))[1], (array_agg(area ORDER BY id DESC))[1],
		       max(created_at), max(n), count(DISTINCT org_id)
		FROM recent GROUP BY lower(industry), lower(area) HAVING max(n) > 0`, days)
	if rows == nil {
		return
	}
	defer rows.Close()
	type it struct {
		Industry   string    `json:"industry"`
		Area       string    `json:"area"`
		Created    time.Time `json:"created_at"`
		Businesses int       `json:"businesses"`
	}
	items := []it{}
	for rows.Next() {
		var x it
		var orgs int
		if rows.Scan(&x.Industry, &x.Area, &x.Created, &x.Businesses, &orgs) != nil {
			continue
		}
		if orgs >= minOrgs || curated[pairKey(x.Industry, x.Area)] {
			items = append(items, x)
		}
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].Created.After(items[j].Created) })
	if len(items) > 12 {
		items = items[:12]
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
