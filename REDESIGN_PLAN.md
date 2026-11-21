# Rencana redesign RAQIO

## Temuan
- Port 3000 memuat landing dan UI produk Next.js 15. Middleware memvalidasi sesi dengan cookie dan Next meneruskan endpoint data ke API Go di 8080. PostgreSQL menyimpan sesi, organisasi, job dan laporan. Worker Python mengambil job dari PostgreSQL. Konfigurasi scraper, API dan frontend memiliki batas environment sendiri.
- Identitas RAQIO memakai hitam #000000, panel #0A0A0A, putih #FFFFFF, teks #E5E5E5, amber #FFB020, oranye #FF8A3D, dan merah koral #FF5A4E. Logo berasal dari aset RAQIO yang ada.
- Referensi ALIF memakai Newsreader dan Instrument Sans, heading sekitar 78px, body sekitar 21px, fotografi lebar dan transisi bagian yang lega. RAQIO memakai tipografi serif dengan komposisi split yang berbeda, permukaan hangat, gambar orisinal dan cuplikan produk berbasis HTML.
- Snapshot awal tersedia di docs/redesign/before. Port 3001 tidak menjawab saat pengambilan baseline. Fitur WA-Suite dirujuk dari sumber proyek yang terpisah.

## Struktur dan urutan
1. Pindahkan frontend produk, auth, proteksi route dan proxy dari apps/web ke apps/scraping, port dev 3002. API Go dan worker Python tetap di lokasi layanan yang sudah terpisah. Perbarui wiring lokal, CI, Compose, dan e2e yang mengacu ke frontend produk. Tidak ada migrasi database.
2. Buat apps/web sebagai Next.js marketing saja, port 3000, dengan halaman utama dan dua detail produk. CTA aplikasi melalui environment. Copy Indonesia terpusat untuk perluasan bahasa.
3. Tambahkan foto orisinal, poster dan loop terkompresi. Verifikasi build, lint, dimensi browser, navigasi, aksesibilitas dan Lighthouse dari build produksi lokal.
