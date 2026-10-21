package main

import "testing"

func TestLeadKey(t *testing.T) {
	if leadKey(Place{"place_id": "x", "maps_url": "u"}) != "x" {
		t.Fatal("place_id harus didahulukan")
	}
	if leadKey(Place{"maps_url": "u"}) != "u" {
		t.Fatal("fallback maps_url")
	}
	if leadKey(Place{}) != "" {
		t.Fatal("kosong")
	}
}

func TestReportChanges(t *testing.T) {
	prev := map[string]any{"all": []any{
		Place{"place_id": "a", "rating": 4.5, "reviews": 100.0},
		Place{"place_id": "b", "rating": 4.0, "reviews": 50.0},
		Place{"place_id": "gone", "rating": 4.0, "reviews": 5.0},
	}}
	cur := map[string]any{"all": []any{
		Place{"place_id": "a", "rating": 4.7, "reviews": 130.0}, // rating naik + makin ramai
		Place{"place_id": "b", "rating": 3.8, "reviews": 52.0},  // rating turun
		Place{"place_id": "new", "rating": 5.0, "reviews": 3.0},
	}}
	c := reportChanges(prev, cur)
	if len(c["new"]) != 1 || len(c["gone"]) != 1 || len(c["rating_up"]) != 1 || len(c["rating_down"]) != 1 || len(c["reviews_jump"]) != 1 {
		t.Fatalf("perubahan salah: %+v", map[string]int{"new": len(c["new"]), "gone": len(c["gone"]), "up": len(c["rating_up"]), "down": len(c["rating_down"]), "jump": len(c["reviews_jump"])})
	}
	if num(c["rating_down"][0], "delta") != -0.2 {
		t.Fatalf("delta rating turun: %v", c["rating_down"][0]["delta"])
	}
}

func TestPlanLimits(t *testing.T) {
	if planLimits("free").Runs >= planLimits("pro").Runs {
		t.Fatal("pro harus lebih besar dari free")
	}
	if planLimits("tidak-ada") != planLimits("free") {
		t.Fatal("paket tak dikenal jatuh ke free")
	}
}
