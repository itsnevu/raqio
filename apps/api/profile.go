package main

import (
	"encoding/json"
	"errors"
	"slices"
)

// businessProfile: profil bisnis pengguna di org_settings.profile. Hanya field ini yang disimpan.
type businessProfile struct {
	Kind      string   `json:"kind,omitempty"`
	Name      string   `json:"name,omitempty"`
	Customers string   `json:"customers,omitempty"`
	Area      string   `json:"area,omitempty"`
	Strengths string   `json:"strengths,omitempty"`
	Avoid     string   `json:"avoid,omitempty"`
	Solves    []string `json:"solves,omitempty"`
}

var (
	profileKinds  = []string{"usaha", "perorangan", "agensi"}
	profileSolves = []string{"website", "instagram", "ulasan", "layanan", "maps"}
)

// clean memotong panjang teks, membuang solves ganda, dan menolak nilai di luar daftar.
func (p businessProfile) clean() ([]byte, error) {
	if p.Kind != "" && !slices.Contains(profileKinds, p.Kind) {
		return nil, errors.New("Jenis profil tidak valid.")
	}
	solves := []string{}
	for _, v := range p.Solves {
		if !slices.Contains(profileSolves, v) {
			return nil, errors.New("Pilihan masalah yang bisa dibantu tidak valid.")
		}
		if !slices.Contains(solves, v) {
			solves = append(solves, v)
		}
	}
	p.Solves = solves
	p.Name, p.Customers, p.Area = trunc(p.Name, 120), trunc(p.Customers, 200), trunc(p.Area, 200)
	p.Strengths, p.Avoid = trunc(p.Strengths, 300), trunc(p.Avoid, 200)
	return json.Marshal(p)
}
