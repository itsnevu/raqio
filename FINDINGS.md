# Temuan Fase 0

Tanggal: 17 November 2026. Tidak diperbaiki pada tahap perencanaan.

- F0-R01 — Web lint merah: `apps/web/app/terms/page.tsx:42` memiliki dua tanda kutip tidak di-escape (`react/no-unescaped-entities`). Dua warning `no-img-element` pada halaman peringkat wilayah. Reproduksi: `cd apps/web; npm run lint`.
- F0-R02 — Sesi API diterima tetapi frontend lokal mengarahkan kembali ke login. File secret API/web sama dan token dari `/auth/guest` cocok dengan HMAC secret file, tetapi GET `/market` dengan cookie itu menghasilkan 307 ke `/login?next=%2Fmarket`. Terselesaikan sebagai masalah runtime: restart frontend tanpa perubahan kode membuat 3/3 test tamu lolos dan full E2E naik dari 5 ke 18 test lolos. Konfigurasi yang dibuat sesudah frontend startup harus diikuti restart.
- F0-R03 — Fixture E2E membuat demo hanya di kelompok login; kelompok lain memanggil login tanpa memastikan demo ada terlebih dahulu. Run database kosong dapat gagal 401 bergantung urutan worker. CI mempunyai seed terpisah; prosedur lokal harus menyebut seed. Jangan mengubah password akun existing demi test.
- F0-R04 — Guard SSRF gateway menolak semua IP privat/loopback. Adapter WA Suite lokal memerlukan service allowlist yang eksplisit, bukan bypass global.
- F0-R05 — E2E yang ada mengizinkan riset hanya mengantre atau ditolak kuota dan masih dianggap sukses. Ini belum membuktikan riset menghasilkan laporan. Tambahkan test deterministik sampai laporan selesai dalam batch CI.
- F0-R06 — CI build web memakai `AUTH_SECRET=ci-only-not-secret`, berbeda persyaratan minimal API. Evaluasi validasi terpadu sebelum mengaktifkan fail-fast lintas layanan.
- F0-R07 — SMTP dan Xendit kosong dalam konfigurasi lokal yang dibuat saat startup. Halaman yang tersedia bukan bukti email atau pembayaran berfungsi. Mailpit/stub termasuk scope fase berikutnya.
- F0-R08 — E2E akhir masih gagal pada pembuatan API key demo: expected 200, received 403. API mewajibkan email terverifikasi; seed lokal `ensureDemo()` tidak memverifikasi akun, sedangkan CI melakukan seed database terpisah. Jangan melemahkan guard produksi agar test hijau. Uji Mailpit atau fixture verified terisolasi diperlukan.

Temuan state machine, provider acceptance versus delivery, isolasi tenant, dan integrasi gateway termasuk scope utama rencana; hasil audit ini belum membuktikan kebocoran tenant pada endpoint Raqio tertentu.
