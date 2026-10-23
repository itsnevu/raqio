// chat.go: asisten (chat agent) sebagai job worker.
//
// Dulu dilayani app.py Python legacy lewat proxy yang melewati isolasi tenant dan kuota (AUDIT #2). Sekarang sesi
// dan pesan ada di Postgres milik org, tiap pesan user menjadi job kind "chat" yang dikerjakan worker Python
// (do_chat), memakai kuota "chat" per bulan, dan frontend memantau lewat /chat/poll (langkah dari job_logs).
//
// Kontrak dengan worker (jobs.params):
//
//	{"sid": "<uuid chat_sessions.id>", "message": "...", "message_id": <id chat_messages>,
//	 "limits": {"runs": N, "details": N, "watches": N}, "app_url": "<APP_URL>",
//	 "org_name": "...", "plan": "free|pro|team|guest", "role": "...", "verified": true|false,
//	 "context": {"industry": "...", "area": "...", "report_id": N, "business_key": "...", "page": "..."}}  (opsional)
//
// Worker menulis langkah ke job_logs (baris berawalan "🔧 " = pemanggilan tool, baris lain progres), menyisipkan
// pesan assistant ke chat_messages dan memperbarui chat_sessions.history sendiri, lalu selesai dengan result
// {"answer": "...", "model": "...", "report_ids": [...]} dan status done. Gagal: failed + error
// ("OPENROUTER_API_KEY belum diisi" kalau kunci tidak ada). Dibatalkan: cancelled. Kalau worker menjalankan riset
// pasar dari dalam chat, worker sendiri yang memotong kuota market_run lewat tabel usage memakai params.limits.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	chatMaxMessage = 2000 // karakter (rune) per pesan
	chatTitleLen   = 60   // judul sesi = awal pesan pertama
	chatMaxContext = 120  // panjang maksimal string di context
)

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var pageRe = regexp.MustCompile(`[^a-z0-9_-]`)

// chatEnabled: CHAT_ENABLED=0 mematikan POST /chat (503) tanpa mematikan riwayat.
func chatEnabled() bool { return env("CHAT_ENABLED", "1") != "0" }

// chatContext: konteks halaman yang dikirim frontend bersama pesan, diteruskan ke worker setelah dibersihkan.
type chatContext struct {
	Industry    string `json:"industry,omitempty"`
	Area        string `json:"area,omitempty"`
	ReportID    int64  `json:"report_id,omitempty"`
	BusinessKey string `json:"business_key,omitempty"`
	Page        string `json:"page,omitempty"`
}

// cleanText: buang karakter kontrol, trim, potong ke n rune. Untuk teks bebas yang diteruskan ke LLM.
func cleanText(s string, n int) string { return trunc(headerSafe(s), n) }

// cleanPage: nama halaman hanya huruf kecil, angka, _ dan -, maksimal 40 karakter.
func cleanPage(s string) string {
	return trunc(pageRe.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), ""), 40)
}

// jsonInt: angka JSON yang boleh dikirim sebagai number atau string ("123"). 0 kalau tidak valid.
func jsonInt(raw json.RawMessage) int64 {
	s := strings.Trim(strings.TrimSpace(string(raw)), `"`)
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil || n < 0 {
		return 0
	}
	return n
}

// cleanChatContext: context yang tidak valid (bukan objek) diabaikan; string dipotong; report_id hanya kalau
// laporan milik org (industri/wilayah diisi dari laporan itu bila kosong). nil kalau tidak ada yang tersisa.
func (a *App) cleanChatContext(ctx context.Context, org string, raw json.RawMessage) *chatContext {
	if len(raw) == 0 {
		return nil
	}
	var in struct {
		Industry    string          `json:"industry"`
		Area        string          `json:"area"`
		ReportID    json.RawMessage `json:"report_id"`
		BusinessKey string          `json:"business_key"`
		Page        string          `json:"page"`
	}
	if json.Unmarshal(raw, &in) != nil {
		return nil
	}
	c := &chatContext{Industry: cleanText(in.Industry, chatMaxContext), Area: cleanText(in.Area, chatMaxContext),
		BusinessKey: cleanText(in.BusinessKey, chatMaxContext), Page: cleanPage(in.Page)}
	if id := jsonInt(in.ReportID); id > 0 {
		var ind, area string
		if err := a.db.QueryRow(ctx, `SELECT industry, area FROM reports WHERE org_id=$1 AND id=$2`, org, id).Scan(&ind, &area); err == nil {
			c.ReportID = id
			if c.Industry == "" {
				c.Industry = ind
			}
			if c.Area == "" {
				c.Area = area
			}
		} else if !errors.Is(err, errNoRows) {
			logDB("chatContext", "select reports", err)
		}
	}
	if *c == (chatContext{}) {
		return nil
	}
	return c
}

// chatSessionFor: sesi milik org dengan id sid. Kalau sid valid tetapi belum ada (frontend lama membuat uuid
// sendiri), dibuat dengan id itu; kalau sid kosong atau milik org lain, dibuat sesi baru dengan id acak.
func chatSessionFor(ctx context.Context, q querier, s *Session, sid string) (string, error) {
	if uuidRe.MatchString(sid) {
		if _, err := q.Exec(ctx, `INSERT INTO chat_sessions (id, org_id, user_id) VALUES ($1::uuid, $2, $3) ON CONFLICT (id) DO NOTHING`,
			sid, s.OrgID, s.UserID); err != nil {
			return "", err
		}
		var found string
		err := q.QueryRow(ctx, `SELECT id FROM chat_sessions WHERE id=$1::uuid AND org_id=$2`, sid, s.OrgID).Scan(&found)
		if err == nil {
			return found, nil
		}
		if !errors.Is(err, errNoRows) {
			return "", err
		}
	}
	var id string
	err := q.QueryRow(ctx, `INSERT INTO chat_sessions (org_id, user_id) VALUES ($1, $2) RETURNING id`, s.OrgID, s.UserID).Scan(&id)
	return id, err
}

// chatActiveJob: id job chat yang masih queued/running untuk sesi itu (0 kalau tidak ada). Memakai index
// jobs_one_active_chat_per_sid.
func chatActiveJob(ctx context.Context, q querier, org, sid string) (int64, error) {
	var id int64
	err := q.QueryRow(ctx, `SELECT id FROM jobs WHERE org_id=$1 AND kind='chat' AND status IN ('queued','running') AND params->>'sid'=$2 LIMIT 1`, org, sid).Scan(&id)
	if errors.Is(err, errNoRows) {
		return 0, nil
	}
	return id, err
}

// POST /chat/sid: sesi baru, balas {sid}.
func (a *App) chatNewSession(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var id string
	if err := a.db.QueryRow(r.Context(), `INSERT INTO chat_sessions (org_id, user_id) VALUES ($1, $2) RETURNING id`, s.OrgID, s.UserID).Scan(&id); err != nil {
		logDB("chatNewSession", "insert chat_sessions", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "sid": id})
}

// POST /chat {sid, message, context?}: simpan pesan user dan antrekan job chat dalam satu transaksi.
// Balas {job, sid}; sid bisa berbeda dari yang dikirim kalau sesi itu bukan milik org.
func (a *App) chatSend(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	if !chatEnabled() {
		errCode(w, 503, "chat_disabled", "Asisten dimatikan.")
		return
	}
	var in struct {
		Sid     string
		Message string
		Context json.RawMessage
	}
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	msg := strings.TrimSpace(in.Message)
	if msg == "" {
		errCode(w, 400, "validation", "Tulis pesan dulu.")
		return
	}
	if utf8.RuneCountInString(msg) > chatMaxMessage {
		errCode(w, 400, "validation", fmt.Sprintf("Pesan maksimal %d karakter.", chatMaxMessage))
		return
	}
	ctx := r.Context()
	cctx := a.cleanChatContext(ctx, s.OrgID, in.Context)
	var orgName string
	if err := a.db.QueryRow(ctx, `SELECT name FROM orgs WHERE id=$1`, s.OrgID).Scan(&orgName); err != nil {
		logDB("chatSend", "select orgs", err)
	}

	tx, err := a.db.Begin(ctx)
	if err != nil {
		logDB("chatSend", "begin", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	defer tx.Rollback(ctx)
	sid, err := chatSessionFor(ctx, tx, s, strings.TrimSpace(in.Sid))
	if err != nil {
		logDB("chatSend", "chat_sessions", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	// cek cepat; pengamannya index unik jobs_one_active_chat_per_sid (errJobActive di bawah)
	if active, err := chatActiveJob(ctx, tx, s.OrgID, sid); err != nil {
		logDB("chatSend", "select jobs aktif", err)
		errCode(w, 500, "db_error", "Gagal membaca data, coba lagi")
		return
	} else if active != 0 {
		errCode(w, 409, "chat_busy", "Agent masih menjawab pesan sebelumnya.")
		return
	}
	var msgID int64
	if err := tx.QueryRow(ctx, `INSERT INTO chat_messages (session_id, org_id, role, content) VALUES ($1::uuid, $2, 'user', $3) RETURNING id`,
		sid, s.OrgID, msg).Scan(&msgID); err != nil {
		logDB("chatSend", "insert chat_messages", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE chat_sessions SET title = CASE WHEN title = '' THEN $3 ELSE title END, last_message_at = now()
		WHERE id=$1::uuid AND org_id=$2`, sid, s.OrgID, trunc(msg, chatTitleLen)); err != nil {
		logDB("chatSend", "update chat_sessions", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	lim := planLimits(s.Plan)
	params := map[string]any{
		"sid": sid, "message": msg, "message_id": msgID,
		"limits":   map[string]int{"runs": lim.Runs, "details": lim.Details, "watches": lim.Watches},
		"app_url":  a.appURL(""),
		"org_name": orgName, "plan": s.Plan, "role": s.Role, "verified": s.Verified || s.Guest,
	}
	if cctx != nil {
		params["context"] = cctx
	}
	jobID, err := startJobIn(ctx, tx, s.OrgID, s.Plan, &s.UserID, "chat", 1, params, 0)
	if errors.Is(err, errJobActive) {
		errCode(w, 409, "chat_busy", "Agent masih menjawab pesan sebelumnya.")
		return
	}
	if replyJobErr(w, err) {
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE chat_messages SET job_id=$2 WHERE id=$1`, msgID, jobID); err != nil {
		logDB("chatSend", "update chat_messages job_id", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		logDB("chatSend", "commit", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "job": jobID, "sid": sid})
}

// splitSteps: baris log job menjadi daftar langkah (baris kosong dibuang).
func splitSteps(text string) []string {
	out := []string{}
	for _, line := range strings.Split(text, "\n") {
		if l := strings.TrimSpace(line); l != "" {
			out = append(out, l)
		}
	}
	return out
}

// GET /chat/poll?job=: {steps, done, error, answer}. Job yang tidak ada atau bukan milik org dibalas done
// dengan error "job tidak ada" (sama seperti versi legacy), bukan 404.
func (a *App) chatPoll(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	ctx := r.Context()
	id, _ := strconv.ParseInt(strings.TrimSpace(r.URL.Query().Get("job")), 10, 64)
	var status string
	var result []byte
	var jerr *string
	err := a.db.QueryRow(ctx, `SELECT status, result, error FROM jobs WHERE org_id=$1 AND id=$2 AND kind='chat'`, s.OrgID, id).Scan(&status, &result, &jerr)
	if err != nil {
		if !errors.Is(err, errNoRows) {
			logDB("chatPoll", "select jobs", err)
		}
		writeJSON(w, 200, map[string]any{"done": true, "error": "job tidak ada", "steps": []string{}, "answer": ""})
		return
	}
	steps := []string{}
	if text, err := a.jobLogText(ctx, id); err == nil {
		steps = splitSteps(text)
	} else {
		logDB("chatPoll", "job_logs", err)
	}
	done := status != "queued" && status != "running"
	out := map[string]any{"job": id, "status": status, "done": done, "steps": steps, "answer": "", "error": ""}
	if done {
		var res struct {
			Answer    string  `json:"answer"`
			Model     string  `json:"model"`
			ReportIDs []int64 `json:"report_ids"`
		}
		if len(result) > 0 {
			json.Unmarshal(result, &res)
		}
		out["answer"] = res.Answer
		if res.Model != "" {
			out["model"] = res.Model
		}
		if len(res.ReportIDs) > 0 {
			out["report_ids"] = res.ReportIDs
		}
		switch {
		case status == "cancelled":
			out["error"] = "Dihentikan."
		case jerr != nil && *jerr != "":
			out["error"] = *jerr
		case status == "failed":
			out["error"] = "Asisten gagal menjawab, coba lagi."
		}
	}
	writeJSON(w, 200, out)
}

// POST /chat/stop {job}: minta worker berhenti; job yang masih antre langsung dibatalkan dan kuotanya dikembalikan.
// job boleh angka atau string angka (frontend menyimpan id sebagai string).
func (a *App) chatStop(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct{ Job json.RawMessage }
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	id := jsonInt(in.Job)
	if id == 0 {
		errCode(w, 400, "validation", "job tidak valid")
		return
	}
	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		logDB("chatStop", "begin", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	defer tx.Rollback(ctx)
	var status string
	var refunded bool
	var created time.Time
	err = tx.QueryRow(ctx, `UPDATE jobs SET cancel_requested=true,
		status      = CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
		finished_at = CASE WHEN status='queued' THEN now() ELSE finished_at END,
		error       = CASE WHEN status='queued' THEN 'Dihentikan.' ELSE error END
		WHERE org_id=$1 AND id=$2 AND kind='chat' AND status IN ('queued','running')
		RETURNING status, refunded, created_at`, s.OrgID, id).Scan(&status, &refunded, &created)
	if err != nil {
		if errors.Is(err, errNoRows) { // sudah selesai, atau bukan milik org
			writeJSON(w, 200, map[string]any{"ok": false})
			return
		}
		logDB("chatStop", "update jobs", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	if status == "cancelled" && !refunded {
		if err := refundIn(ctx, tx, s.OrgID, created.UTC().Format("2006-01"), "chat", 1); err != nil {
			logDB("chatStop", "refund usage", err)
			errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
			return
		}
		if _, err := tx.Exec(ctx, `UPDATE jobs SET refunded=true WHERE id=$1`, id); err != nil {
			logDB("chatStop", "mark refunded", err)
			errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		logDB("chatStop", "commit", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "status": status})
}

// GET /chat/sessions: 30 sesi org terbaru yang sudah berisi pesan.
func (a *App) chatSessions(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	rows := a.query(r.Context(), w, `SELECT id, title, last_message_at, created_at FROM chat_sessions
		WHERE org_id=$1 AND last_message_at IS NOT NULL ORDER BY last_message_at DESC LIMIT 30`, s.OrgID)
	if rows == nil {
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, title string
		var last, created time.Time
		if rows.Scan(&id, &title, &last, &created) != nil {
			continue
		}
		out = append(out, map[string]any{"id": id, "title": title, "last_message_at": last, "created_at": created})
	}
	writeJSON(w, 200, map[string]any{"sessions": out})
}

// GET /chat/messages?sid=: pesan sesi milik org urut id (maksimal 200) plus id job chat yang masih berjalan.
func (a *App) chatMessages(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	ctx := r.Context()
	sid := strings.TrimSpace(r.URL.Query().Get("sid"))
	if !uuidRe.MatchString(sid) {
		errCode(w, 400, "validation", "sid tidak valid")
		return
	}
	var title string
	if err := a.db.QueryRow(ctx, `SELECT title FROM chat_sessions WHERE id=$1::uuid AND org_id=$2`, sid, s.OrgID).Scan(&title); err != nil {
		if !errors.Is(err, errNoRows) {
			logDB("chatMessages", "select chat_sessions", err)
			errCode(w, 500, "db_error", "Gagal membaca data, coba lagi")
			return
		}
		errCode(w, 404, "not_found", "Sesi tidak ada.")
		return
	}
	rows := a.query(ctx, w, `SELECT id, role, content, created_at, job_id FROM chat_messages
		WHERE org_id=$1 AND session_id=$2::uuid ORDER BY id LIMIT 200`, s.OrgID, sid)
	if rows == nil {
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var role, content string
		var created time.Time
		var job *int64
		if rows.Scan(&id, &role, &content, &created, &job) != nil {
			continue
		}
		out = append(out, map[string]any{"id": id, "role": role, "content": content, "created_at": created, "job_id": job})
	}
	var active any
	if id, err := chatActiveJob(ctx, a.db, s.OrgID, sid); err != nil {
		logDB("chatMessages", "select jobs aktif", err)
	} else if id != 0 {
		active = id
	}
	writeJSON(w, 200, map[string]any{"sid": sid, "title": title, "messages": out, "active_job": active})
}

// POST /chat/sessions/delete {sid}: hapus sesi milik org beserta pesannya; job chat sesi itu yang masih berjalan
// diminta berhenti (yang antre langsung dibatalkan, kuotanya dikembalikan scheduler).
func (a *App) chatDeleteSession(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	var in struct{ Sid string }
	if err := readJSON(r, &in); err != nil {
		errCode(w, 400, "validation", "Body JSON tidak valid.")
		return
	}
	sid := strings.TrimSpace(in.Sid)
	if !uuidRe.MatchString(sid) {
		errCode(w, 400, "validation", "sid tidak valid")
		return
	}
	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		logDB("chatDelete", "begin", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE jobs SET cancel_requested=true,
		status      = CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
		finished_at = CASE WHEN status='queued' THEN now() ELSE finished_at END,
		error       = CASE WHEN status='queued' THEN 'Dihentikan.' ELSE error END
		WHERE org_id=$1 AND kind='chat' AND status IN ('queued','running') AND params->>'sid'=$2`, s.OrgID, sid); err != nil {
		logDB("chatDelete", "cancel jobs", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	ct, err := tx.Exec(ctx, `DELETE FROM chat_sessions WHERE id=$1::uuid AND org_id=$2`, sid, s.OrgID)
	if err != nil {
		logDB("chatDelete", "delete chat_sessions", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		logDB("chatDelete", "commit", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": ct.RowsAffected() > 0})
}

// GET /chat/suggestions?page=&report_id=: 3 sampai 5 pertanyaan pembuka sesuai konteks. Dengan report_id milik
// org: pertanyaan tentang laporan itu; page=prospects: tentang follow up; page=watch: tentang perubahan pantauan;
// selain itu contoh umum (plus satu tentang laporan terbaru org kalau ada).
func (a *App) chatSuggestions(w http.ResponseWriter, r *http.Request) {
	s := sess(r)
	ctx := r.Context()
	page := cleanPage(r.URL.Query().Get("page"))
	reportID, _ := strconv.ParseInt(strings.TrimSpace(r.URL.Query().Get("report_id")), 10, 64)
	out := map[string]any{"page": page}
	var ind, area string
	if reportID > 0 {
		if err := a.db.QueryRow(ctx, `SELECT industry, area FROM reports WHERE org_id=$1 AND id=$2`, s.OrgID, reportID).Scan(&ind, &area); err != nil {
			if !errors.Is(err, errNoRows) {
				logDB("chatSuggestions", "select reports", err)
			}
			reportID = 0 // bukan milik org: diabaikan
		}
	}
	var list []string
	switch {
	case reportID > 0:
		out["report_id"], out["industry"], out["area"] = reportID, ind, area
		list = []string{
			fmt.Sprintf("Siapa 5 pemain terkuat %s di %s?", ind, area),
			fmt.Sprintf("Apa celah pasar untuk %s di %s?", ind, area),
			fmt.Sprintf("Prospek mana di %s yang paling layak dihubungi minggu ini?", area),
			"Buatkan draf pesan WhatsApp untuk prospek dengan skor tertinggi di laporan ini.",
			fmt.Sprintf("Bandingkan %s dengan wilayah lain yang sudah diriset.", area),
		}
	case page == "prospects":
		list = []string{
			"Prospek mana yang jatuh tempo follow up hari ini?",
			"Siapa saja yang belum pernah dihubungi dan skornya di atas 60?",
			"Buatkan draf WhatsApp singkat untuk prospek berstatus tertarik.",
			"Urutkan prospek yang paling layak dihubungi minggu ini.",
		}
	case page == "watch":
		list = []string{
			"Apa yang berubah di wilayah yang dipantau sejak riset sebelumnya?",
			"Pesaing baru mana yang perlu diwaspadai?",
			"Wilayah mana yang paling banyak berubah bulan ini?",
		}
	default:
		list = []string{
			"Kompetitor coffee shop di Kemang siapa saja?",
			"Riset pasar agency di Gading Serpong.",
			"Wilayah mana yang paling menjanjikan untuk buka cabang baru?",
		}
		var lind, larea string
		if err := a.db.QueryRow(ctx, `SELECT industry, area FROM reports WHERE org_id=$1 ORDER BY id DESC LIMIT 1`, s.OrgID).Scan(&lind, &larea); err == nil {
			list = append([]string{fmt.Sprintf("Ringkas laporan %s di %s yang terbaru.", lind, larea)}, list...)
		} else if !errors.Is(err, errNoRows) {
			logDB("chatSuggestions", "select laporan terbaru", err)
		}
		list = append(list, "Apa saja yang bisa kamu bantu?")
	}
	if len(list) > 5 {
		list = list[:5]
	}
	out["suggestions"] = list
	writeJSON(w, 200, out)
}
