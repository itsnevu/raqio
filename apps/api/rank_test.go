package main

import "testing"

// TestRankEligibility: ambang kelayakan peringkat publik — bisnis dengan ulasan < rankMinReviews tampil
// tanpa nomor peringkat (kelompok tengah), lonjakan ulasan ditandai dan selalu paling bawah, dan nomor
// peringkat hanya diberikan ke kelompok layak.
func TestRankEligibility(t *testing.T) {
	places := []Place{
		{"name": "Mapan", "rating": 4.8, "reviews": 400.0, "place_id": "a"},
		{"name": "Baru", "rating": 5.0, "reviews": 3.0, "place_id": "b"},
		{"name": "Biasa", "rating": 4.5, "reviews": 120.0, "place_id": "c"},
		{"name": "Spike", "rating": 4.9, "reviews": 500.0, "place_id": "s", "review_jump_pct": 80.0},
	}
	rows := raqioScores(places)
	if len(rows) != 4 {
		t.Fatalf("rows %d", len(rows))
	}
	if rows[0].Name != "Mapan" || rows[0].Rank != 1 || rows[0].TooFew || rows[0].Flagged {
		t.Fatalf("teratas harus Mapan rank 1: %+v", rows[0])
	}
	if rows[1].Name != "Biasa" || rows[1].Rank != 2 {
		t.Fatalf("kedua harus Biasa rank 2: %+v", rows[1])
	}
	if rows[2].Name != "Baru" || !rows[2].TooFew || rows[2].Rank != 0 {
		t.Fatalf("Baru (3 ulasan) harus too_few tanpa rank, di atas yang ditandai: %+v", rows[2])
	}
	if rows[3].Name != "Spike" || !rows[3].Flagged || rows[3].Rank != 0 {
		t.Fatalf("lonjakan ulasan harus paling bawah tanpa rank: %+v", rows[3])
	}
}

// TestNormIndustry: typo dan alias industri jatuh ke kunci yang sama supaya cache hasil instan tetap kena.
func TestNormIndustry(t *testing.T) {
	for _, pair := range [][2]string{
		{"coffe shop", "coffee shop"},
		{"Coffee Shop", "kedai kopi"},
		{"DOKTER gigi", "dentist"}, // "gigi" masuk grup dentist
		{"loundry kiloan", "laundry"},
	} {
		if normIndustry(pair[0]) != normIndustry(pair[1]) {
			t.Fatalf("%q dan %q harus satu kunci: %q vs %q", pair[0], pair[1], normIndustry(pair[0]), normIndustry(pair[1]))
		}
	}
	if normIndustry("jual beli ikan cupang") == normIndustry("sewa alat berat") {
		t.Fatal("industri tak dikenal yang berbeda tidak boleh disamakan")
	}
}

// TestPlanPriority: paket berbayar mendahului free di antrean worker (angka kecil diambil duluan).
func TestPlanPriority(t *testing.T) {
	if !(planPriority("team") < planPriority("pro") && planPriority("pro") < planPriority("free")) {
		t.Fatalf("urutan prioritas salah: team=%d pro=%d free=%d", planPriority("team"), planPriority("pro"), planPriority("free"))
	}
	if planPriority("guest") != planPriority("free") {
		t.Fatal("guest setara free")
	}
}
