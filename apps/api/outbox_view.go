package main

import (
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
)

var (
	outboxChannels = []string{"whatsapp", "instagram", "email"}
	outboxStatuses = []string{"pending", "sent", "replied", "failed", "skipped", "unsubscribed"}
)

const outboxPage = 50

// campaignOutbox: semua penerima dari semua kampanye org (kecuali draf) dalam satu daftar, plus ringkasan per saluran.
// Filter: channel, status, q (nama/tujuan/kampanye), offset. Ringkasan sengaja tidak ikut filter.
func (a *App) campaignOutbox(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	ctx := r.Context()
	qs := r.URL.Query()
	channel, status := qs.Get("channel"), qs.Get("status")
	if channel != "" && !slices.Contains(outboxChannels, channel) {
		errCode(w, 400, "validation", "Saluran tidak valid.")
		return
	}
	if status != "" && !slices.Contains(outboxStatuses, status) {
		errCode(w, 400, "validation", "Status tidak valid.")
		return
	}
	offset, _ := strconv.Atoi(qs.Get("offset"))
	offset = min(max(offset, 0), 100000)
	like := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(trunc(qs.Get("q"), 100))

	summary := map[string]map[string]int{}
	for _, ch := range outboxChannels {
		summary[ch] = map[string]int{}
	}
	rows := a.query(ctx, w, `SELECT c.channel, r.status, count(*) FROM campaign_recipients r JOIN campaigns c ON c.id = r.campaign_id
		WHERE r.org_id=$1 AND c.org_id=$1 AND c.status <> 'draft' GROUP BY 1,2`, s.OrgID)
	if rows == nil {
		return
	}
	for rows.Next() {
		var ch, st string
		var n int
		if rows.Scan(&ch, &st, &n) == nil && summary[ch] != nil {
			summary[ch][st] = n
		}
	}
	rows.Close()

	rows = a.query(ctx, w, `SELECT r.id, r.campaign_id, c.name, c.channel, r.lead_key, r.name, r.to_addr, r.rendered, r.status, r.error, r.sent_at, count(*) OVER()
		FROM campaign_recipients r JOIN campaigns c ON c.id = r.campaign_id
		WHERE r.org_id=$1 AND c.org_id=$1 AND c.status <> 'draft'
		  AND ($2 = '' OR c.channel = $2) AND ($3 = '' OR r.status = $3)
		  AND ($4 = '' OR r.name ILIKE '%' || $4 || '%' OR r.to_addr ILIKE '%' || $4 || '%' OR c.name ILIKE '%' || $4 || '%')
		ORDER BY r.sent_at DESC NULLS LAST, r.id DESC LIMIT $5 OFFSET $6`, s.OrgID, channel, status, like, outboxPage, offset)
	if rows == nil {
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	total := 0
	for rows.Next() {
		var id, cid int64
		var cname, ch, key, name, addr, rendered, st, errMsg string
		var sentAt *time.Time
		if rows.Scan(&id, &cid, &cname, &ch, &key, &name, &addr, &rendered, &st, &errMsg, &sentAt, &total) == nil {
			items = append(items, map[string]any{"id": id, "campaign_id": cid, "campaign": cname, "channel": ch, "lead_key": key, "name": name,
				"to_addr": addr, "rendered": rendered, "status": st, "error": errMsg, "sent_at": sentAt})
		}
	}
	writeJSON(w, 200, map[string]any{"summary": summary, "items": items, "total": total, "page": outboxPage})
}
