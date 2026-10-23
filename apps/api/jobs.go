package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"
	"unicode/utf8"
)

// ---------- paket dan kuota ----------

type Limits struct {
	Runs     int `json:"runs"`     // riset per bulan (termasuk riset ulang pantauan)
	Details  int `json:"details"`  // "Cek kontak" per bulan
	Watches  int `json:"watches"`  // wilayah yang dipantau sekaligus
	Areas    int `json:"areas"`    // maks wilayah per perbandingan
	Members  int `json:"members"`  // anggota tim
	Chats    int `json:"chats"`    // pesan ke asisten per bulan
	Outreach int `json:"outreach"` // pesan kampanye (WA, IG, email) per bulan
	Queue    int `json:"queue"`    // riset yang boleh antre/berjalan sekaligus
}

func planLimits(plan string) Limits {
	switch plan {
	case "pro":
		return Limits{Runs: 60, Details: 600, Watches: 15, Areas: 6, Members: 3, Chats: 300, Queue: 6, Outreach: 1000}
	case "team":
		return Limits{Runs: 300, Details: 3000, Watches: 60, Areas: 8, Members: 15, Chats: 1500, Queue: 12, Outreach: 5000}
	case "guest": // mode tamu: cukup untuk mencoba, org dihapus setelah GUEST_TTL
		return Limits{Runs: 2, Details: 10, Watches: 0, Areas: 2, Members: 1, Chats: 3, Queue: 2, Outreach: 0}
	default: // free
		return Limits{Runs: 5, Details: 30, Watches: 1, Areas: 3, Members: 1, Chats: 20, Queue: 3, Outreach: 50}
	}
}

func period() string { return time.Now().UTC().Format("2006-01") }

// planPriority: prioritas antrean worker untuk job riset (angka kecil diambil duluan). Paket berbayar
// mendahului free/tamu supaya org free tidak menahan org yang membayar di worker tunggal.
// Jenis lain tetap: cek kontak -5 (menyela), pantauan dan riset-ulang peringkat 10 (mengalah).
func planPriority(plan string) int {
	switch plan {
	case "team":
		return -2
	case "pro":
		return -1
	}
	return 0
}

func (a *App) usageThisMonth(ctx context.Context, org string) (map[string]int, error) {
	rows, err := a.db.Query(ctx, `SELECT kind, count FROM usage WHERE org_id=$1 AND period=$2`, org, period())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{"market_run": 0, "market_detail": 0, "chat": 0}
	for rows.Next() {
		var k string
		var n int
		if err := rows.Scan(&k, &n); err != nil {
			return nil, err
		}
		out[k] = n
	}
	return out, rows.Err()
}

// quotaError: kuota habis (bukan kegagalan DB). Handler membalas 402 dengan code quota_exceeded.
type quotaError struct{ msg string }

func (e *quotaError) Error() string { return e.msg }

// quotaMax: batas bulanan untuk jenis kuota; ok=false kalau kind tidak dikenal.
func quotaMax(plan, kind string) (int, bool) {
	lim := planLimits(plan)
	switch kind {
	case "market_run":
		return lim.Runs, true
	case "market_detail":
		return lim.Details, true
	case "chat":
		return lim.Chats, true
	case "outreach":
		return lim.Outreach, true
	}
	return 0, false
}

// consume menaikkan meteran kalau masih di bawah kuota; n = jumlah unit (perbandingan 3 wilayah = 3 run).
func (a *App) consume(ctx context.Context, org, plan, kind string, n int) error {
	return consumeIn(ctx, a.db, org, plan, kind, n)
}

// consumeIn: versi yang bisa dipakai di dalam transaksi. Baris pertama bulan itu juga ditolak kalau n > max
// (INSERT ... SELECT ... WHERE), bukan hanya cabang DO UPDATE. kind tak dikenal dan n <= 0 ditolak di Go.
func consumeIn(ctx context.Context, q querier, org, plan, kind string, n int) error {
	max, known := quotaMax(plan, kind)
	if !known || n <= 0 {
		return &quotaError{"Jenis kuota tidak dikenal."}
	}
	if n > max {
		return &quotaError{fmt.Sprintf("Kuota %s paket %s bulan ini sudah habis (%d). Upgrade paket atau tunggu bulan depan.", kindLabel(kind), plan, max)}
	}
	var ok bool
	err := q.QueryRow(ctx, `
		INSERT INTO usage (org_id, period, kind, count)
		SELECT $1::uuid, $2::text, $3::text, $4::int WHERE $4::int <= $5::int
		ON CONFLICT (org_id, period, kind) DO UPDATE SET count = usage.count + $4::int
		WHERE usage.count + $4::int <= $5::int
		RETURNING true`, org, period(), kind, n, max).Scan(&ok)
	if err != nil || !ok {
		if err != nil && !errors.Is(err, errNoRows) {
			logDB("consume", "insert usage", err)
		}
		return &quotaError{fmt.Sprintf("Kuota %s paket %s bulan ini sudah habis (%d). Upgrade paket atau tunggu bulan depan.", kindLabel(kind), plan, max)}
	}
	return nil
}

// refund mengembalikan n unit kuota bulan berjalan (job gagal final atau dibatalkan).
func (a *App) refund(ctx context.Context, org, kind string, n int) error {
	return refundIn(ctx, a.db, org, period(), kind, n)
}

func refundIn(ctx context.Context, q querier, org, per, kind string, n int) error {
	if n <= 0 {
		return nil
	}
	_, err := q.Exec(ctx, `UPDATE usage SET count = GREATEST(count - $4, 0) WHERE org_id=$1 AND period=$2 AND kind=$3`, org, per, kind, n)
	return err
}

func kindLabel(k string) string {
	return map[string]string{"market_run": "riset", "market_detail": "cek kontak", "chat": "pesan asisten", "outreach": "pesan kampanye"}[k]
}

// quotaKindOf: jenis kuota yang dipakai sebuah jenis job.
func quotaKindOf(jobKind string) string {
	switch jobKind {
	case "market_detail", "ig_profile":
		return "market_detail"
	case "chat":
		return "chat"
	case "campaign_send":
		return "outreach"
	}
	return "market_run"
}

// refundableKinds: jenis job yang kuotanya dikembalikan scheduler saat failed/cancelled final.
const refundableKinds = `('market_run','market_compare','market_detail','chat')`

// jobUnits: berapa unit kuota yang dipakai sebuah job (compare = jumlah wilayah).
func jobUnits(kind string, params []byte) int {
	if kind == "market_compare" {
		var p struct {
			Areas []string `json:"areas"`
		}
		if json.Unmarshal(params, &p) == nil && len(p.Areas) > 0 {
			return len(p.Areas)
		}
	}
	return 1
}

// ---------- antrian ----------

type Job struct {
	ID       int64           `json:"id"`
	Kind     string          `json:"kind"`
	Status   string          `json:"status"`
	Params   json.RawMessage `json:"params"`
	Log      string          `json:"log"`
	Result   json.RawMessage `json:"result,omitempty"`
	Error    *string         `json:"error"`
	Created  time.Time       `json:"created_at"`
	Started  *time.Time      `json:"started_at"`
	Finished *time.Time      `json:"finished_at"`
}

// errJobActive: index unik jobs_one_active_chat_per_sid menolak job chat kedua untuk sesi yang sama.
var errJobActive = errors.New("masih ada job yang berjalan")

// queueFullError: antrean riset org sudah penuh (batas planLimits.Queue). Handler membalas 409 queue_full.
type queueFullError struct{ limit int }

func (e *queueFullError) Error() string {
	return fmt.Sprintf("Antrean riset penuh (maksimal %d sekaligus). Tunggu satu riset selesai dulu.", e.limit)
}

// checkQueueIn: batasi jumlah pencarian (market_run/market_compare) yang antre atau berjalan per org sesuai
// paket. Harus dipanggil di dalam transaksi: advisory lock transaksi per org menutup balapan dua request yang
// menghitung bersamaan (pengganti index unik jobs_one_active_per_org yang dihapus migrasi 009).
func checkQueueIn(ctx context.Context, q querier, org, plan string) error {
	if _, err := q.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('job_queue:' || $1::text, 0))`, org); err != nil {
		return err
	}
	var n int
	if err := q.QueryRow(ctx, `SELECT count(*) FROM jobs WHERE org_id=$1 AND status IN ('queued','running')
		AND kind IN ('market_run','market_compare')`, org).Scan(&n); err != nil {
		return err
	}
	if lim := planLimits(plan).Queue; n >= lim {
		return &queueFullError{lim}
	}
	return nil
}

func (a *App) enqueue(ctx context.Context, org string, user *string, kind string, params any, priority int) (int64, error) {
	return enqueueIn(ctx, a.db, org, user, kind, params, priority)
}

func enqueueIn(ctx context.Context, q querier, org string, user *string, kind string, params any, priority int) (int64, error) {
	p, _ := json.Marshal(params)
	var id int64
	err := q.QueryRow(ctx, `INSERT INTO jobs (org_id, user_id, kind, params, priority) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		org, user, kind, p, priority).Scan(&id)
	if uniqueViolationOn(err, "jobs_one_active_chat_per_sid") {
		return 0, errJobActive
	}
	return id, err
}

// startJob: potong kuota dan antrekan job dalam SATU transaksi. Kalau antrean riset org penuh atau kuota habis,
// tidak ada yang tersimpan. units = jumlah unit kuota (compare = jumlah wilayah).
// Mengembalikan *quotaError, *queueFullError, errJobActive (chat), atau error DB.
func (a *App) startJob(ctx context.Context, org, plan string, user *string, kind string, units int, params any, priority int) (int64, error) {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	id, err := startJobIn(ctx, tx, org, plan, user, kind, units, params, priority)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return id, nil
}

// startJobIn: isi startJob di dalam transaksi pemanggil, untuk handler yang perlu menulis baris lain
// (mis. pesan chat) dalam transaksi yang sama dengan kuota dan job.
func startJobIn(ctx context.Context, q querier, org, plan string, user *string, kind string, units int, params any, priority int) (int64, error) {
	if kind == "market_run" || kind == "market_compare" {
		if err := checkQueueIn(ctx, q, org, plan); err != nil {
			return 0, err
		}
	}
	if err := consumeIn(ctx, q, org, plan, quotaKindOf(kind), units); err != nil {
		return 0, err
	}
	return enqueueIn(ctx, q, org, user, kind, params, priority)
}

// replyJobErr: terjemahkan error startJob ke respons HTTP. Return true kalau sudah dibalas.
func replyJobErr(w http.ResponseWriter, err error) bool {
	var qe *quotaError
	var qf *queueFullError
	switch {
	case err == nil:
		return false
	case errors.Is(err, errJobActive):
		errCode(w, 409, "job_running", "Masih ada proses yang berjalan")
	case errors.As(err, &qf):
		errCode(w, 409, "queue_full", qf.Error())
	case errors.As(err, &qe):
		errCode(w, 402, "quota_exceeded", qe.msg)
	default:
		logDB("startJob", "consume+enqueue", err)
		errCode(w, 500, "db_error", "Gagal menyimpan, coba lagi")
	}
	return true
}

func (a *App) getJob(ctx context.Context, org string, id int64) (*Job, error) {
	j := &Job{}
	err := a.db.QueryRow(ctx, `SELECT id, kind, status, params, result, error, created_at, started_at, finished_at FROM jobs WHERE org_id=$1 AND id=$2`, org, id).
		Scan(&j.ID, &j.Kind, &j.Status, &j.Params, &j.Result, &j.Error, &j.Created, &j.Started, &j.Finished)
	return j, err
}

// waitJob menunggu job selesai (untuk endpoint yang frontend-nya menunggu sinkron, mis. Cek kontak).
func (a *App) waitJob(ctx context.Context, org string, id int64, max time.Duration) (*Job, error) {
	deadline := time.Now().Add(max)
	for {
		j, err := a.getJob(ctx, org, id)
		if err != nil {
			return nil, err
		}
		if j.Status == "done" || j.Status == "failed" || j.Status == "cancelled" {
			return j, nil
		}
		if time.Now().After(deadline) {
			return j, fmt.Errorf("timeout")
		}
		select {
		case <-ctx.Done():
			return j, ctx.Err()
		case <-time.After(700 * time.Millisecond):
		}
	}
}

// ---------- log job ----------
//
// Worker baru menulis per baris ke job_logs (INSERT INTO job_logs(job_id, seq, line)); kolom jobs.log tetap ada
// untuk worker lama. API memilih job_logs kalau ada barisnya, kalau tidak jatuh ke jobs.log.

// jobLogText: seluruh log sebuah job, urut seq.
func (a *App) jobLogText(ctx context.Context, jobID int64) (string, error) {
	var text string
	err := a.db.QueryRow(ctx, `SELECT CASE WHEN EXISTS (SELECT 1 FROM job_logs l WHERE l.job_id=j.id)
			THEN (SELECT string_agg(rtrim(l.line, E'\n') || E'\n', '' ORDER BY l.seq) FROM job_logs l WHERE l.job_id=j.id)
			ELSE j.log END FROM jobs j WHERE j.id=$1`, jobID).Scan(&text)
	return text, err
}

// jobLogStreamV2: GET /log/stream?job=<id>  (tanpa job = job riset terbaru org).
// Tiap detik hanya membaca baris job_logs dengan seq > terakhir (delta), bukan seluruh log. Maksimal sseMaxPerOrg
// stream aktif per org; lebih dari itu 429. Event "log" tiap ada tambahan/perubahan status, "done" lalu tutup.
func (a *App) jobLogStreamV2(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		errCode(w, 500, "no_streaming", "streaming tidak didukung")
		return
	}
	s := sess(r)
	if !sseStreams.acquire(s.OrgID) {
		errCode(w, 429, "too_many_streams", "Maksimal 3 stream log sekaligus per org. Tutup tab lain dulu.")
		return
	}
	defer sseStreams.release(s.OrgID)

	ctx := r.Context()
	var jobID int64
	if q := r.URL.Query().Get("job"); q != "" {
		jobID, _ = strconv.ParseInt(q, 10, 64)
	} else {
		a.db.QueryRow(ctx, `SELECT id FROM jobs WHERE org_id=$1 AND kind IN ('market_run','market_compare') ORDER BY id DESC LIMIT 1`, s.OrgID).Scan(&jobID)
	}

	w.Header().Set("Content-Type", "text/event-stream")
	// no-transform: proxy (Next dev, Caddy) tidak boleh mengompresi stream ini; gzip menahan event sampai koneksi ditutup
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(200)
	fl.Flush()
	if jobID == 0 {
		fmt.Fprint(w, "event: done\ndata: {\"status\":\"none\"}\n\n")
		fl.Flush()
		return
	}

	deadline := time.Now().Add(30 * time.Minute)
	var lastSeq, legacyRunes int
	var lastStatus string
	sent := 0
	for time.Now().Before(deadline) {
		var status, delta, legacy string
		var jerr *string
		var maxSeq int
		err := a.db.QueryRow(ctx, `SELECT j.status, j.error,
			coalesce((SELECT string_agg(rtrim(l.line, E'\n') || E'\n', '' ORDER BY l.seq) FROM job_logs l WHERE l.job_id=j.id AND l.seq > $3::int), ''),
			coalesce((SELECT max(l.seq) FROM job_logs l WHERE l.job_id=j.id), 0),
			CASE WHEN EXISTS (SELECT 1 FROM job_logs l WHERE l.job_id=j.id) THEN '' ELSE substring(j.log from $4::int) END
			FROM jobs j WHERE j.org_id=$1 AND j.id=$2`, s.OrgID, jobID, lastSeq, legacyRunes+1).
			Scan(&status, &jerr, &delta, &maxSeq, &legacy)
		if err != nil {
			fmt.Fprint(w, "event: done\ndata: {\"status\":\"none\"}\n\n")
			fl.Flush()
			return
		}
		if legacy != "" {
			delta += legacy
			legacyRunes += utf8.RuneCountInString(legacy)
		}
		if maxSeq > lastSeq {
			lastSeq = maxSeq
		}
		if delta != "" || status != lastStatus || sent == 0 {
			payload, _ := json.Marshal(map[string]any{"job": jobID, "status": status, "append": delta, "error": jerr})
			fmt.Fprintf(w, "event: log\ndata: %s\n\n", payload)
			fl.Flush()
			lastStatus, sent = status, sent+1
		}
		if status != "queued" && status != "running" {
			fmt.Fprintf(w, "event: done\ndata: {\"job\":%d,\"status\":%q}\n\n", jobID, status)
			fl.Flush()
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Second):
		}
	}
}

// ---------- loop latar belakang ----------

// scheduler: tiap 5 menit satu putaran (hanya satu replika yang memegang advisory lock).
func (a *App) scheduler(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(5 * time.Minute):
		}
		if release, ok := a.tryLock(ctx, lockScheduler); ok {
			a.schedulerRound(ctx)
			release()
		}
	}
}

// schedulerRound: paket kedaluwarsa, job yang worker-nya mati, refund kuota job gagal, riset ulang pantauan,
// alarm job gagal beruntun, pengingat lead harian.
func (a *App) schedulerRound(ctx context.Context) {
	a.expirePlans(ctx)
	// job 'running' yang worker-nya mati (heartbeat > 10 menit): antrikan ulang selama attempts < max_attempts, sisanya failed.
	a.execLog(ctx, `UPDATE jobs SET status='queued', error='worker tidak merespons', run_after=now(), locked_by=NULL
		WHERE status='running' AND heartbeat_at < now() - interval '10 minutes' AND attempts < max_attempts`)
	a.execLog(ctx, `UPDATE jobs SET status='failed', error='worker tidak merespons', finished_at=now()
		WHERE status='running' AND heartbeat_at < now() - interval '10 minutes'`)
	a.refundFinishedJobs(ctx)
	a.rescheduleWatches(ctx)
	a.rankRefreshRound(ctx)
	a.warnExpiringPlans(ctx)
	a.notifyFinishedJobs(ctx)
	a.checkFailedJobs(ctx)
	a.leadDigestRound(ctx, time.Now())
}

// refundFinishedJobs: kembalikan kuota job (pasar dan chat) yang failed/cancelled final dan belum di-refund. Satu kali per job.
func (a *App) refundFinishedJobs(ctx context.Context) int {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		logDB("refund", "begin", err)
		return 0
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT id, org_id, kind, params, created_at FROM jobs
		WHERE status IN ('failed','cancelled') AND refunded=false AND kind IN `+refundableKinds+`
		ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED`)
	if err != nil {
		logDB("refund", "select jobs", err)
		return 0
	}
	type row struct {
		id      int64
		org     string
		kind    string
		params  []byte
		created time.Time
	}
	var list []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.org, &r.kind, &r.params, &r.created); err == nil {
			list = append(list, r)
		}
	}
	rows.Close()
	for _, r := range list {
		per := r.created.UTC().Format("2006-01")
		if err := refundIn(ctx, tx, r.org, per, quotaKindOf(r.kind), jobUnits(r.kind, r.params)); err != nil {
			logDB("refund", "update usage", err)
			return 0
		}
		if _, err := tx.Exec(ctx, `UPDATE jobs SET refunded=true WHERE id=$1`, r.id); err != nil {
			logDB("refund", "mark job", err)
			return 0
		}
	}
	if err := tx.Commit(ctx); err != nil {
		logDB("refund", "commit", err)
		return 0
	}
	if len(list) > 0 {
		slog.Info("kuota dikembalikan", "jobs", len(list))
	}
	return len(list)
}

// rescheduleWatches: riset ulang wilayah yang dipantau, satu job per org per putaran, prioritas rendah.
func (a *App) rescheduleWatches(ctx context.Context) {
	rows, err := a.db.Query(ctx, `
		SELECT w.org_id, w.industry, w.area, o.plan FROM watches w JOIN orgs o ON o.id=w.org_id
		WHERE (w.last_run IS NULL OR w.last_run < now() - (w.every_days || ' days')::interval)
		  AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.org_id=w.org_id AND j.status IN ('queued','running')
		                  AND j.kind IN ('market_run','market_compare','market_detail'))
		ORDER BY w.last_run NULLS FIRST`)
	if err != nil {
		logDB("scheduler", "select watches", err)
		return
	}
	seen := map[string]bool{}
	type row struct{ org, ind, area, plan string }
	var todo []row
	for rows.Next() {
		var r row
		if rows.Scan(&r.org, &r.ind, &r.area, &r.plan) == nil && !seen[r.org] {
			seen[r.org] = true
			todo = append(todo, r)
		}
	}
	rows.Close()
	for _, r := range todo {
		// tandai dulu supaya tidak dijadwalkan ulang kalau job gagal
		a.execLog(ctx, `UPDATE watches SET last_run=now() WHERE org_id=$1 AND lower(industry)=lower($2) AND lower(area)=lower($3)`, r.org, r.ind, r.area)
		_, err := a.startJob(ctx, r.org, r.plan, nil, "market_run", 1, map[string]any{"industry": r.ind, "area": r.area, "watch": true}, 10)
		var qe *quotaError
		var qf *queueFullError
		switch {
		case err == nil:
			slog.Info("pantau: riset ulang dijadwalkan", "org", r.org, "industry", r.ind, "area", r.area)
		case errors.As(err, &qe):
			slog.Info("pantau: kuota habis, dilewati bulan ini", "org", r.org, "industry", r.ind, "area", r.area)
		case errors.As(err, &qf):
			// antrean org penuh; dicoba putaran berikutnya
		default:
			logDB("scheduler", "startJob pantau", err)
		}
	}
}

// retentionLoop: hapus data lama (UU PDP: batasi penyimpanan data kontak bisnis dan jejak pengguna).
func (a *App) retentionLoop(ctx context.Context) {
	for {
		if release, ok := a.tryLock(ctx, lockRetention); ok {
			a.retentionRound(ctx)
			release()
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(6 * time.Hour):
		}
	}
}

func (a *App) retentionRound(ctx context.Context) {
	days := int(a.retention.Hours() / 24)
	if days < 1 {
		days = 1
	}
	a.execLog(ctx, `DELETE FROM reports WHERE created_at < now() - make_interval(days => $1)`, days)
	a.execLog(ctx, `DELETE FROM jobs WHERE finished_at < now() - interval '30 days'`) // job_logs ikut cascade
	a.execLog(ctx, `DELETE FROM sessions WHERE expires_at < now()`)
	a.execLog(ctx, `DELETE FROM tokens WHERE expires_at < now() - interval '7 days' OR used_at < now() - interval '7 days'`)
	a.execLog(ctx, `DELETE FROM login_attempts WHERE locked_until IS NULL OR locked_until < now() - interval '1 day'`)
	a.execLog(ctx, `DELETE FROM audit_log WHERE at < now() - interval '365 days'`)
	a.execLog(ctx, `UPDATE audit_log SET ip='' WHERE at < now() - interval '90 days' AND ip <> ''`)
	a.execLog(ctx, `DELETE FROM ig_profiles WHERE last_scraped < now() - make_interval(days => $1)`, days)
	a.execLog(ctx, `DELETE FROM leads l WHERE l.updated_at < now() - interval '365 days'
		AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.org_id=l.org_id AND r.created_at > now() - interval '365 days')`)
	a.execLog(ctx, `DELETE FROM webhook_outbox WHERE delivered_at < now() - interval '30 days'
		OR (delivered_at IS NULL AND attempts >= $1 AND created_at < now() - interval '30 days')`, outboxMaxAttempts)
	// sesi chat: yang kosong (tanpa pesan) lewat sehari, dan yang lebih tua dari retensi laporan (pesan ikut cascade)
	a.execLog(ctx, `DELETE FROM chat_sessions WHERE last_message_at IS NULL AND created_at < now() - interval '1 day'`)
	a.execLog(ctx, `DELETE FROM chat_sessions WHERE coalesce(last_message_at, created_at) < now() - make_interval(days => $1)`, days)
	a.purgeGuests(ctx)
}
