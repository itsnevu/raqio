// digest.go: pengingat lead jatuh tempo harian.
//
// Sekali per hari mulai jam DIGEST_HOUR (default 8) zona Asia/Jakarta, tiap org yang punya lead dengan
// remind <= hari ini dan status belum deal/tolak menerima ringkasan "N prospek jatuh tempo hari ini: ..." lewat
// saluran notifikasi org yang sama dengan alert pantauan: email ke notify_email (atau owner/admin), Telegram, dan
// webhook event "lead.reminder" dengan daftar lead {key, name, status, remind, industry, area}. org_digest.last_sent_at
// mencegah kiriman ganda di hari yang sama. Dipanggil dari schedulerRound, yaitu di bawah advisory lock
// (tryLock lockScheduler), jadi aman dijalankan beberapa replika API. Org tamu dilewati.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

// jakarta: WIB. Tanpa tzdata (image distroless) jatuh ke zona tetap +07:00; WIB tidak punya DST jadi hasilnya sama.
var jakarta = func() *time.Location {
	if loc, err := time.LoadLocation("Asia/Jakarta"); err == nil {
		return loc
	}
	return time.FixedZone("WIB", 7*3600)
}()

// digestHour: jam (0-23 WIB) mulai pengiriman; DIGEST_HOUR=0 berarti sejak tengah malam.
func digestHour() int {
	if n, err := strconv.Atoi(os.Getenv("DIGEST_HOUR")); err == nil && n >= 0 && n <= 23 {
		return n
	}
	return 8
}

type digestLead struct {
	Key      string `json:"key"`
	Name     string `json:"name"`
	Status   string `json:"status"`
	Remind   string `json:"remind"`
	Industry string `json:"industry"`
	Area     string `json:"area"`
}

// leadDigestRound: kirim pengingat ke org yang punya lead jatuh tempo dan belum menerima pengingat hari ini (WIB).
// now dipisah sebagai parameter supaya bisa diuji.
func (a *App) leadDigestRound(ctx context.Context, now time.Time) int {
	local := now.In(jakarta)
	if local.Hour() < digestHour() {
		return 0
	}
	dayStart := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, jakarta)
	today := dayStart.Format("2006-01-02")
	rows, err := a.db.Query(ctx, `SELECT l.org_id, l.key, l.name, l.status, to_char(l.remind, 'YYYY-MM-DD')
		FROM leads l JOIN orgs o ON o.id = l.org_id
		WHERE l.remind <= $1::date AND l.status NOT IN ('deal','tolak') AND o.plan <> 'guest'
		  AND NOT EXISTS (SELECT 1 FROM org_digest d WHERE d.org_id = l.org_id AND d.last_sent_at >= $2)
		ORDER BY l.org_id, l.remind, l.name`, today, dayStart)
	if err != nil {
		logDB("digest", "select leads jatuh tempo", err)
		return 0
	}
	byOrg := map[string][]digestLead{}
	var orgs []string
	for rows.Next() {
		var org string
		var l digestLead
		if rows.Scan(&org, &l.Key, &l.Name, &l.Status, &l.Remind) != nil {
			continue
		}
		if _, ok := byOrg[org]; !ok {
			orgs = append(orgs, org)
		}
		byOrg[org] = append(byOrg[org], l)
	}
	rows.Close()
	sent := 0
	for _, org := range orgs {
		if a.sendLeadDigest(ctx, org, byOrg[org], today) {
			sent++
		}
	}
	return sent
}

// fillLeadPairs: isi industri/wilayah tiap lead dari laporan terbaru per pasangan yang memuat bisnis itu
// (kunci = place_id, atau maps_url bila kosong, sama dengan leadKey).
func (a *App) fillLeadPairs(ctx context.Context, org string, leads []digestLead) {
	keys := make([]string, 0, len(leads))
	for _, l := range leads {
		keys = append(keys, l.Key)
	}
	rows, err := a.db.Query(ctx, `WITH latest AS (
			SELECT id, industry, area, report FROM (
				SELECT id, industry, area, report, row_number() OVER (PARTITION BY lower(industry), lower(area) ORDER BY id DESC) rn
				FROM reports WHERE org_id = $1) x WHERE rn = 1)
		SELECT DISTINCT ON (k) k, industry, area FROM (
			SELECT coalesce(nullif(p->>'place_id', ''), p->>'maps_url') AS k, l.industry, l.area, l.id
			FROM latest l, jsonb_array_elements(CASE WHEN jsonb_typeof(l.report->'all') = 'array' THEN l.report->'all' ELSE '[]'::jsonb END) p) y
		WHERE k = ANY($2::text[]) ORDER BY k, id DESC`, org, keys)
	if err != nil {
		logDB("digest", "select pasangan lead", err)
		return
	}
	defer rows.Close()
	pairs := map[string][2]string{}
	for rows.Next() {
		var k, ind, area string
		if rows.Scan(&k, &ind, &area) == nil {
			pairs[k] = [2]string{ind, area}
		}
	}
	for i := range leads {
		if p, ok := pairs[leads[i].Key]; ok {
			leads[i].Industry, leads[i].Area = p[0], p[1]
		}
	}
}

// digestLine: "nama (status, wilayah)"; wilayah dilewati kalau tidak diketahui.
func digestLine(l digestLead) string {
	name := l.Name
	if name == "" {
		name = l.Key
	}
	if l.Area != "" {
		return fmt.Sprintf("%s (%s, %s)", name, l.Status, l.Area)
	}
	return fmt.Sprintf("%s (%s)", name, l.Status)
}

// digestSummary: satu kalimat ringkas, maksimal 10 nama lalu "dan N lainnya".
func digestSummary(leads []digestLead) string {
	var parts []string
	for i, l := range leads {
		if i == 10 {
			parts = append(parts, fmt.Sprintf("dan %d lainnya", len(leads)-10))
			break
		}
		parts = append(parts, digestLine(l))
	}
	return fmt.Sprintf("%d prospek jatuh tempo hari ini: %s.", len(leads), strings.Join(parts, ", "))
}

// sendLeadDigest: tandai org_digest dan antrekan webhook dalam satu transaksi (tidak ada kiriman ganda walau proses
// mati di tengah), lalu email dan Telegram lewat worker pool notifikasi.
func (a *App) sendLeadDigest(ctx context.Context, org string, leads []digestLead, today string) bool {
	a.fillLeadPairs(ctx, org, leads)
	summary := digestSummary(leads)
	tx, err := a.db.Begin(ctx)
	if err != nil {
		logDB("digest", "begin", err)
		return false
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `INSERT INTO org_digest (org_id, last_sent_at) VALUES ($1, now())
		ON CONFLICT (org_id) DO UPDATE SET last_sent_at = now()`, org); err != nil {
		logDB("digest", "upsert org_digest", err)
		return false
	}
	if err := webhookIn(ctx, tx, org, "lead.reminder", map[string]any{"date": today, "count": len(leads), "summary": summary, "leads": leads}); err != nil {
		logDB("digest", "outbox lead.reminder", err)
		return false
	}
	if err := tx.Commit(ctx); err != nil {
		logDB("digest", "commit", err)
		return false
	}

	link := a.appURL("/prospects")
	var b strings.Builder
	for i, l := range leads {
		if i == 50 {
			fmt.Fprintf(&b, "dan %d lainnya\n", len(leads)-50)
			break
		}
		fmt.Fprintf(&b, "- %s, pengingat %s\n", digestLine(l), l.Remind)
	}
	body := summary + "\n\n" + b.String() + "\nBuka papan prospek: " + link
	html := "<b>Raqio pengingat</b>\n" + htmlEsc(summary) + "\n\n<pre>" + htmlEsc(b.String()) + "</pre>" + link
	cfg := a.notifyCfgOf(ctx, org)
	enqueueNotify("digest "+org, func() {
		nctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		a.notifyOrgChannels(nctx, org, cfg, "Raqio: "+summary, body, html)
	})
	slog.Info("pengingat lead dikirim", "org", org, "n", len(leads))
	return true
}
