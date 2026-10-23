# Uji beban (k6)

Skrip `k6-api.js` menguji jalur baca API lewat Next (login sekali per VU, lalu campuran `/auth/me`, `/market/reports`,
`/prospects/data`, `/watch/data`, `/watch/alerts`) dan laju pembuatan tamu. Tidak membuat job riset, jadi aman
dijalankan terhadap dev maupun staging.

```bash
# dari root repo, terhadap stack dev (Next di :3000)
docker run --rm -i --add-host=host.docker.internal:host-gateway \
  -e BASE=http://host.docker.internal:3000 -e USER=demo@raqio.local -e PASS=demo12345 \
  -e VUS=5 -e DURATION=30s grafana/k6 run - < deploy/loadtest/k6-api.js
```

Ambang bawaan: p95 latensi baca < 500 ms, error < 1%. Naikkan `VUS` bertahap (5, 20, 50) dan catat kapan p95 lewat ambang;
itu dasar untuk `RATE_LIMIT_PER_MINUTE`, `DB_MAX_CONNS`, dan jumlah replika API. Untuk worker, ukur lewat panel
"Durasi job" dan "Umur antrean tertua" di Grafana saat beberapa riset dijalankan bersamaan.

Catatan: 429 pada skenario `tamu` adalah perilaku yang benar (limiter tamu), dihitung di `raqio_guest_rejected`.

## Hasil terakhir (dev, 22 Oktober 2026)

5 VU selama 30 detik langsung ke API Go: 236 permintaan, p95 latensi baca 18 ms, 0% error, 25 permintaan dibatasi 429 (rate limit 300 per menit per IP), tidak ada 5xx di log API. Lewat Next dev angkanya lebih tinggi karena kompilasi on demand; ukur produksi dengan build standalone.
