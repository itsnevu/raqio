package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// TestIntegrationLeadDigest: lead jatuh tempo -> org_digest ditulis dan webhook lead.reminder masuk outbox lalu
// terkirim; tidak dikirim dua kali di hari yang sama; sebelum DIGEST_HOUR dan org tamu dilewati.
func TestIntegrationLeadDigest(t *testing.T) {
	t.Setenv("ALLOW_INSECURE_WEBHOOK", "1")
	t.Setenv("DIGEST_HOUR", "8")
	e := setupIntegration(t)
	o := e.client()
	o.register("dg@x.id", "DG")
	e.verifyUser(o, "dg@x.id")
	org := orgOf(t, o)
	hook := newHookServer("s")
	defer hook.srv.Close()
	code, j := o.post("/org/settings", map[string]string{"webhook_url": hook.srv.URL, "webhook_secret": "s"})
	o.must(200, code, j)
	ctx := context.Background()

	now := time.Now().In(jakarta)
	at := time.Date(now.Year(), now.Month(), now.Day(), 9, 0, 0, 0, jakarta) // 09:00 WIB hari ini
	today := at.Format("2006-01-02")
	yesterday := at.AddDate(0, 0, -1).Format("2006-01-02")
	tomorrow := at.AddDate(0, 0, 1).Format("2006-01-02")
	insertReport(t, e, org, rep("Kopi", "Kemang", Place{"place_id": "p1", "name": "Kopi A"}, Place{"place_id": "p2", "name": "Kopi B"}))
	for _, l := range []struct{ key, name, status, remind string }{
		{"p1", "Kopi A", "dihubungi", today}, {"p2", "Kopi B", "tertarik", yesterday},
		{"p3", "Deal C", "deal", today}, {"p4", "Nanti D", "baru", tomorrow},
	} {
		if _, err := e.app.db.Exec(ctx, `INSERT INTO leads (org_id, key, name, status, remind) VALUES ($1,$2,$3,$4,$5::date)`, org, l.key, l.name, l.status, l.remind); err != nil {
			t.Fatal(err)
		}
	}
	// org tamu dengan lead jatuh tempo: dilewati
	guestLimit = newLimiterRate(5.0/3600, 5)
	g := e.client()
	code, j = g.post("/auth/guest", map[string]string{})
	g.must(200, code, j)
	gorg := orgOf(t, g)
	e.app.db.Exec(ctx, `INSERT INTO leads (org_id, key, name, status, remind) VALUES ($1,'gp','Tamu','baru',$2::date)`, gorg, today)

	if n := e.app.leadDigestRound(ctx, time.Date(now.Year(), now.Month(), now.Day(), 7, 59, 0, 0, jakarta)); n != 0 {
		t.Fatalf("sebelum DIGEST_HOUR tidak boleh mengirim: %d", n)
	}
	if n := e.app.leadDigestRound(ctx, at); n != 1 {
		t.Fatalf("harus 1 org dikirim, dapat %d", n)
	}
	var payload []byte
	if err := e.app.db.QueryRow(ctx, `SELECT payload FROM webhook_outbox WHERE org_id=$1 AND event='lead.reminder'`, org).Scan(&payload); err != nil {
		t.Fatalf("outbox lead.reminder: %v", err)
	}
	var pl struct {
		Event string `json:"event"`
		Data  struct {
			Date    string       `json:"date"`
			Count   int          `json:"count"`
			Summary string       `json:"summary"`
			Leads   []digestLead `json:"leads"`
		} `json:"data"`
	}
	if err := json.Unmarshal(payload, &pl); err != nil {
		t.Fatal(err)
	}
	if pl.Event != "lead.reminder" || pl.Data.Date != today || pl.Data.Count != 2 || len(pl.Data.Leads) != 2 {
		t.Fatalf("payload: %s", payload)
	}
	// urut remind lalu nama: Kopi B (kemarin) dulu, lalu Kopi A (hari ini); industri/wilayah dari laporan
	l0, l1 := pl.Data.Leads[0], pl.Data.Leads[1]
	if l0.Key != "p2" || l0.Remind != yesterday || l1.Key != "p1" || l1.Status != "dihubungi" || l1.Industry != "Kopi" || l1.Area != "Kemang" {
		t.Fatalf("leads: %+v", pl.Data.Leads)
	}
	if !strings.HasPrefix(pl.Data.Summary, "2 prospek jatuh tempo hari ini: ") || !strings.Contains(pl.Data.Summary, "Kopi A (dihubungi, Kemang)") {
		t.Fatalf("summary: %q", pl.Data.Summary)
	}
	var nDigest, nGuest int
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM org_digest WHERE org_id=$1`, org).Scan(&nDigest)
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM org_digest WHERE org_id=$1`, gorg).Scan(&nGuest)
	if nDigest != 1 || nGuest != 0 {
		t.Fatalf("org_digest: org=%d tamu=%d", nDigest, nGuest)
	}
	if d, f := e.app.processOutbox(ctx); d != 1 || f != 0 || hook.count("lead.reminder") != 1 || hook.badSig != 0 {
		t.Fatalf("pengiriman webhook: delivered=%d failed=%d diterima=%d badSig=%d", d, f, hook.count("lead.reminder"), hook.badSig)
	}

	// hari yang sama: tidak dikirim lagi
	if n := e.app.leadDigestRound(ctx, at.Add(3*time.Hour)); n != 0 {
		t.Fatalf("dikirim dua kali di hari yang sama: %d", n)
	}
	var nOut int
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM webhook_outbox WHERE event='lead.reminder'`).Scan(&nOut)
	if nOut != 1 {
		t.Fatalf("outbox lead.reminder: %d baris", nOut)
	}
	// hari berikutnya: dikirim lagi (lead masih jatuh tempo, plus yang jatuh tempo besok)
	if n := e.app.leadDigestRound(ctx, at.AddDate(0, 0, 1)); n != 1 {
		t.Fatalf("hari berikutnya harus dikirim: %d", n)
	}
	e.app.db.QueryRow(ctx, `SELECT count(*) FROM webhook_outbox WHERE event='lead.reminder'`).Scan(&nOut)
	if nOut != 2 {
		t.Fatalf("outbox lead.reminder hari kedua: %d baris", nOut)
	}
	e.app.db.QueryRow(ctx, `SELECT payload FROM webhook_outbox WHERE event='lead.reminder' ORDER BY id DESC LIMIT 1`).Scan(&payload)
	json.Unmarshal(payload, &pl)
	if pl.Data.Count != 3 {
		t.Fatalf("hari kedua harus 3 lead: %d", pl.Data.Count)
	}
}

func TestDigestSummary(t *testing.T) {
	var leads []digestLead
	for i := 0; i < 12; i++ {
		leads = append(leads, digestLead{Key: "k", Name: "N", Status: "baru", Area: "A"})
	}
	s := digestSummary(leads)
	if !strings.HasPrefix(s, "12 prospek jatuh tempo hari ini: N (baru, A), ") || !strings.HasSuffix(s, "dan 2 lainnya.") {
		t.Fatalf("summary: %q", s)
	}
	if got := digestLine(digestLead{Key: "k", Status: "tertarik"}); got != "k (tertarik)" {
		t.Fatalf("tanpa nama dan wilayah: %q", got)
	}
	if digestHour() != 8 {
		t.Fatalf("DIGEST_HOUR default 8, dapat %d", digestHour())
	}
	t.Setenv("DIGEST_HOUR", "0")
	if digestHour() != 0 {
		t.Fatal("DIGEST_HOUR=0 harus diterima")
	}
	t.Setenv("DIGEST_HOUR", "25")
	if digestHour() != 8 {
		t.Fatal("DIGEST_HOUR tidak valid jatuh ke 8")
	}
}
