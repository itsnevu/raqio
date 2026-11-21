# Verifikasi redesign RAQIO

Preview lokal berjalan di http://localhost:3000. Competitor Scraping tetap dilayani di http://localhost:3002.

- Homepage, perbandingan, kedua detail produk, Tentang, Kontak, Privasi, dan Syarat diuji pada 390, 768, 1024, dan 1440 px. Seluruh halaman HTTP 200 tanpa overflow horizontal atau permintaan aset gagal.
- Axe WCAG AA pada 390 dan 1440 melaporkan nol pelanggaran. Navigasi keyboard pada tab dan perpindahan form kontak ikut diuji.
- Lint, typecheck, dan build Next.js marketing lulus. Lighthouse homepage mencatat Performance 97 mobile dan 100 desktop, Accessibility dan SEO 100 pada keduanya.
- Alur riset Competitor Scraping lulus 3/3 tes browser pada port 3002.
- Port 3001 tidak aktif saat pengecekan. Tautan WA-Suite memakai konfigurasi lingkungan.

Pembanding sebelum redesign ada di docs/redesign/v2-before. Screenshot tema gelap dan laporan Lighthouse berada di folder ini. Kartu produk memakai HTML/CSS dan halaman siap dipakai sambil foto dipilih.
