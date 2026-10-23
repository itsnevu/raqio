package main

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"testing"
)

func TestRenderTemplateAndAddr(t *testing.T) {
	vars := map[string]string{"nama": "Kopi A", "rating": "4.5"}
	if got := renderTemplate("Halo {nama}, rating {rating} {tidak_ada}", vars); got != "Halo Kopi A, rating 4.5 {tidak_ada}" {
		t.Fatalf("render: %q", got)
	}
	p := Place{"whatsapp": "https://wa.me/6281234567890", "phone": "0812", "instagram": "https://instagram.com/kopi.a/?hl=id", "emails": []any{"x@kopi.id"}}
	if addrFor("whatsapp", p) != "6281234567890" || addrFor("instagram", p) != "kopi.a" || addrFor("email", p) != "x@kopi.id" {
		t.Fatalf("addr: %q %q %q", addrFor("whatsapp", p), addrFor("instagram", p), addrFor("email", p))
	}
	if addrFor("whatsapp", Place{"phone": "021555"}) != "" || igHandle("@bad handle") != "" {
		t.Fatal("alamat tidak valid harus kosong")
	}
	if !strings.Contains(gapSentence(Place{"lead_reasons": []any{"tanpa website"}}), "website") {
		t.Fatal("celah website")
	}
}

func TestUnsubToken(t *testing.T) {
	a := &App{secret: []byte("rahasia-tes-yang-panjang-sekali-32")}
	tok := a.unsubToken("org-1", "x@y.id")
	org, addr, ok := a.parseUnsub(tok)
	if !ok || org != "org-1" || addr != "x@y.id" {
		t.Fatalf("parse: %v %q %q", ok, org, addr)
	}
	if _, _, ok := a.parseUnsub(tok[:len(tok)-2] + "zz"); ok {
		t.Fatal("tanda tangan rusak harus ditolak")
	}
}

func TestIntegrationCampaignManualFlow(t *testing.T) {
	e := setupIntegration(t)
	o := e.client()
	o.register("c@x.id", "C")
	e.app.db.Exec(context.Background(), `UPDATE orgs SET plan='pro' WHERE name='C'`)
	e.app.db.Exec(context.Background(), `UPDATE users SET email_verified_at=now() WHERE email='c@x.id'`)
	o.post("/auth/login", map[string]string{"email": "c@x.id", "password": "rahasia123"})
	_, me := o.get("/auth/me")
	org := me["org_id"].(string)

	insertReport(t, e, org, rep("kopi", "Kemang",
		Place{"place_id": "a", "name": "Kopi A", "rating": 4.6, "reviews": 120.0, "lead_score": 80.0, "whatsapp": "https://wa.me/6281111111111", "lead_reasons": []any{"tanpa website"}},
		Place{"place_id": "b", "name": "Kopi B", "rating": 4.1, "reviews": 40.0, "lead_score": 55.0, "phone": "6282222222222", "emails": []any{"b@kopi.id"}},
		Place{"place_id": "c", "name": "Kopi C", "rating": 3.9, "reviews": 10.0, "lead_score": 45.0}, // tanpa kontak
		Place{"place_id": "d", "name": "Kopi D", "rating": 4.9, "reviews": 900.0, "lead_score": 5.0}, // bukan prospek
	))
	o.post("/org/sender", map[string]string{"sender_name": "Budi", "sender_phone": "628999"})
	code, j := o.post("/org/sender", map[string]string{"sender_phone": "6289990000111"})
	o.must(200, code, j)
	o.post("/org/settings", map[string]string{"offer": "bikin website"})

	// pratinjau
	code, j = o.post("/campaigns/preview", map[string]any{"channel": "whatsapp", "lead_key": "a"})
	o.must(200, code, j)
	if !strings.Contains(j["rendered"].(string), "Kopi A") || !strings.Contains(j["rendered"].(string), "bikin website") || !strings.Contains(j["rendered"].(string), "/p/") {
		t.Fatalf("preview: %v", j["rendered"])
	}

	// buat kampanye WhatsApp manual dari filter skor >= 40
	code, j = o.post("/campaigns", map[string]any{"name": "WA Kemang", "channel": "whatsapp", "mode": "manual", "select": map[string]any{"min_score": 40}})
	o.must(200, code, j)
	cid := int64(j["id"].(float64))
	counts := j["counts"].(map[string]any)
	if counts["pending"].(float64) != 2 || counts["skipped"].(float64) != 1 {
		t.Fatalf("counts: %v", counts)
	}
	idStr := itoa(cid)

	// instagram auto ditolak
	code, j = o.post("/campaigns", map[string]any{"channel": "instagram", "mode": "auto", "select": map[string]any{"keys": []string{"a"}}})
	o.must(400, code, j)

	// mulai (manual): kuota outreach terpotong 2
	code, j = o.post("/campaigns/"+idStr+"/start", map[string]any{})
	o.must(200, code, j)
	_, orgInfo := o.get("/org")
	if u, ok := orgInfo["usage"].(map[string]any); !ok || u["outreach"].(float64) != 2 {
		t.Fatalf("usage outreach: %v", orgInfo["usage"])
	}

	// penerima berikutnya + tandai terkirim -> lead dihubungi
	code, j = o.get("/campaigns/" + idStr + "/next")
	o.must(200, code, j)
	rc := j["recipient"].(map[string]any)
	if !strings.HasPrefix(rc["link"].(string), "https://wa.me/6281111111111?text=") {
		t.Fatalf("link: %v", rc["link"])
	}
	code, j = o.post("/campaigns/"+idStr+"/mark", map[string]any{"recipient_id": rc["id"], "status": "sent"})
	o.must(200, code, j)
	var st string
	e.app.db.QueryRow(context.Background(), `SELECT status FROM leads WHERE org_id=$1 AND key='a'`, org).Scan(&st)
	if st != "dihubungi" {
		t.Fatalf("lead a: %q", st)
	}
	// balasan -> tertarik, lalu sent lagi tidak menurunkan
	o.post("/campaigns/"+idStr+"/mark", map[string]any{"recipient_id": rc["id"], "status": "replied"})
	e.app.db.QueryRow(context.Background(), `SELECT status FROM leads WHERE org_id=$1 AND key='a'`, org).Scan(&st)
	if st != "tertarik" {
		t.Fatalf("lead a setelah balasan: %q", st)
	}
	// penerima kedua dilewati -> kampanye selesai
	code, j = o.get("/campaigns/" + idStr + "/next")
	o.must(200, code, j)
	rc2 := j["recipient"].(map[string]any)
	code, j = o.post("/campaigns/"+idStr+"/mark", map[string]any{"recipient_id": rc2["id"], "status": "skipped"})
	o.must(200, code, j)
	code, j = o.get("/campaigns/" + idStr)
	o.must(200, code, j)
	if j["campaign"].(map[string]any)["status"] != "done" {
		t.Fatalf("status kampanye: %v", j["campaign"].(map[string]any)["status"])
	}
	recs := j["recipients"].([]any)
	if len(recs) != 3 {
		t.Fatalf("penerima: %d", len(recs))
	}

	// halaman audit publik dari token penerima pertama (tanpa sesi)
	auditURL := recs[0].(map[string]any)["audit_url"].(string)
	tok := auditURL[strings.LastIndex(auditURL, "/")+1:]
	resp, err := http.Get(e.srv.URL + "/audit/" + tok)
	if err != nil || resp.StatusCode != 200 {
		t.Fatalf("audit publik: %v %v", err, resp)
	}
	resp.Body.Close()
	if resp, _ := http.Get(e.srv.URL + "/audit/tidak-ada-token-ini"); resp.StatusCode != 404 {
		t.Fatalf("audit token salah: %d", resp.StatusCode)
	}

	// unsubscribe: alamat masuk daftar, kampanye baru melewatinya
	ut := e.app.unsubToken(org, "6281111111111")
	resp, _ = http.Get(e.srv.URL + "/u/" + ut)
	if resp.StatusCode != 200 {
		t.Fatalf("unsub: %d", resp.StatusCode)
	}
	code, j = o.post("/campaigns", map[string]any{"channel": "whatsapp", "mode": "manual", "select": map[string]any{"keys": []string{"a", "b"}}})
	o.must(200, code, j)
	if j["counts"].(map[string]any)["unsubscribed"].(float64) != 1 {
		t.Fatalf("unsubscribed: %v", j["counts"])
	}

	// tamu: kuota outreach 0 -> 402
	g := e.client()
	g.post("/auth/guest", map[string]string{})
	_, gme := g.get("/auth/me")
	insertReport(t, e, gme["org_id"].(string), rep("kopi", "Kemang", Place{"place_id": "z", "name": "Z", "rating": 4.0, "reviews": 50.0, "lead_score": 70.0, "whatsapp": "https://wa.me/6281100000000"}))
	code, j = g.post("/campaigns", map[string]any{"channel": "whatsapp", "select": map[string]any{"keys": []string{"z"}}})
	g.must(200, code, j)
	code, j = g.post("/campaigns/"+itoa(int64(j["id"].(float64)))+"/start", map[string]any{})
	g.must(402, code, j)
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }
