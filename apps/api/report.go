package main

import (
	"math"
	"sort"
	"strings"
)

// Place adalah satu bisnis di laporan; disimpan longgar sebagai map supaya bentuk JSON dari worker tidak terkunci.
type Place = map[string]any

func str(p Place, k string) string {
	if v, ok := p[k].(string); ok {
		return v
	}
	return ""
}

func num(p Place, k string) float64 {
	switch v := p[k].(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case int64:
		return float64(v)
	}
	return 0
}

func hasNum(p Place, k string) bool {
	_, ok := p[k].(float64)
	return ok
}

// leadKey sama persis dengan market.lead_key di Python.
func leadKey(p Place) string {
	if k := str(p, "place_id"); k != "" {
		return k
	}
	return str(p, "maps_url")
}

func pairKey(industry, area string) string {
	return strings.ToLower(strings.TrimSpace(industry)) + "|" + strings.ToLower(strings.TrimSpace(area))
}

func placesOf(rep map[string]any) []Place {
	raw, _ := rep["all"].([]any)
	out := make([]Place, 0, len(raw))
	for _, x := range raw {
		if p, ok := x.(Place); ok {
			out = append(out, p)
		}
	}
	return out
}

// reportChanges: port dari market.report_changes.
func reportChanges(prev, cur map[string]any) map[string][]Place {
	old := map[string]Place{}
	for _, p := range placesOf(prev) {
		old[leadKey(p)] = p
	}
	newM := map[string]Place{}
	out := map[string][]Place{"new": {}, "gone": {}, "rating_up": {}, "rating_down": {}, "reviews_jump": {}}
	for _, p := range placesOf(cur) {
		k := leadKey(p)
		newM[k] = p
		q, ok := old[k]
		if !ok {
			out["new"] = append(out["new"], p)
			continue
		}
		dr := math.Round((num(p, "rating")-num(q, "rating"))*10) / 10
		if dr >= 0.1 && num(q, "rating") > 0 {
			out["rating_up"] = append(out["rating_up"], withDelta(p, dr))
		} else if dr <= -0.1 && num(q, "rating") > 0 {
			out["rating_down"] = append(out["rating_down"], withDelta(p, dr))
		}
		jump := num(p, "reviews") - num(q, "reviews")
		if jump >= math.Max(10, 0.1*num(q, "reviews")) {
			out["reviews_jump"] = append(out["reviews_jump"], withDelta(p, jump))
		}
	}
	for k, p := range old {
		if _, ok := newM[k]; !ok {
			out["gone"] = append(out["gone"], p)
		}
	}
	for k := range out {
		sort.SliceStable(out[k], func(i, j int) bool {
			return math.Abs(deltaOr(out[k][i])) > math.Abs(deltaOr(out[k][j]))
		})
	}
	return out
}

func withDelta(p Place, d float64) Place {
	c := make(Place, len(p)+1)
	for k, v := range p {
		c[k] = v
	}
	c["delta"] = d
	return c
}

func deltaOr(p Place) float64 {
	if hasNum(p, "delta") {
		return num(p, "delta")
	}
	return num(p, "reviews")
}
