# Bukti eksekusi Fase 0

Tanggal: 17 November 2026 WIB. Ini catatan baseline sebelum implementasi, bukan bukti bahwa bug dalam rencana sudah diperbaiki. Tidak ada output red→green fitur baru yang diklaim.

## Output yang tercatat

Web Raqio (`apps/web`):

```text
npm test
Test Files  17 passed (17)
Tests       103 passed (103)
Duration    7.04s
exit 0

npm run typecheck
tsc --noEmit
exit 0

npm run lint
app/terms/page.tsx
42:99  error react/no-unescaped-entities
42:120 error react/no-unescaped-entities
app/top/[industry]/[area]/page.tsx
154:31 warning @next/next/no-img-element
155:46 warning @next/next/no-img-element
4 problems (2 errors, 2 warnings)
exit 1
```

API Raqio (`apps/api`), database dev Postgres di 127.0.0.1:5433 tersedia:

```text
go test -count=1 ./...
ok github.com/raqio/api 43.593s
exit 0

go vet ./...
exit 0
```

Worker (`services/scraper`):

```text
python -m pytest tests -o addopts= -q
196 passed in 20.52s
exit 0

python -m ruff check .
All checks passed!
exit 0
```

WA Suite:

```text
node --regexp-interpret-all scripts/verify-ai-final.mjs
syntax JavaScript dan inline HTML: exit 0
verify-ai1 ... verify-ai6: exit 0
verify-hardening: exit 1
RINGKASAN
PASS 1. nama file media aman
PASS 2. header aman pada /media
PASS 3. /media wajib login
PASS 4. otorisasi per objek
PASS 5. regex di worker
PASS 6. pesan terbaru pada chat panjang
FAIL 7. WebSocket menyambung ulang
PASS 8. satu socket per nomor
PASS 9. ketahanan proses dan shutdown
PASS 10. status basi direset dan append diproses
PASS 11. prioritas rule dan jalur lambat regex
PASS 12. push name terbaru dan jalur cepat rule slow
```

Bagian FAIL berasal dari assertion pola sumber pada `scripts/verify-hardening.mjs:344`; tidak boleh ditafsirkan sebagai bukti koneksi runtime pasti rusak. Log penuh lokal: `C:/Users/user/wa-suite/artifacts/ai/verify-hardening.mjs.log`. Test `/media wajib login` lama tidak mencakup isolasi kepemilikan file lintas nomor.

Test WA tambahan dijalankan tersendiri dan lolos: `verify-ai-security.mjs`, `verify-ai-profile.mjs`, `verify-ai-rules.mjs`, `verify-module-guide.mjs`, `verify-phase1.mjs`, `verify-phase2.mjs`, `verify-phase3.mjs`, `verify-phase4.mjs`, `verify-phase5.mjs`, `verify-phase345.mjs`, `verify-inbox.mjs`, `verify-wa1.mjs`, `verify-qr-dialog.mjs`. Semuanya menggunakan fixture; pengujian ini tidak membuktikan pengiriman WhatsApp sungguhan.

## E2E sebelum dan setelah pemuatan ulang konfigurasi

Perintah PowerShell dari `e2e/`:

```powershell
$env:E2E_BASE_URL='http://localhost:3002'
$env:E2E_API_URL='http://127.0.0.1:8080'
npx playwright test
```

Run pertama: `15 failed, 5 passed (3.3m)`, exit 1. Kegagalan dominan sesi frontend dan login demo yang belum dibuat saat kelompok test lain mulai. Bukti diagnosis tanpa mencetak secret:

```text
File secret sama: true
API token sesuai secret file: true
Halaman bersesi: 307 /login?next=%2Fmarket
Guest API: 200
```

Frontend sebelumnya dinyalakan sebelum `.env.local` dibuat. Restart proses Next pada port yang sama tanpa perubahan kode, lalu:

```text
npx playwright test tests/guest.spec.ts --workers=1
3 passed (4.9s)
exit 0

npx playwright test
1 failed
  settings.spec.ts:16: API key dibuat, dipakai sebagai bearer, lalu dicabut
  Expected: 200
  Received: 403
1 skipped
18 passed (12.4s)
exit 1
```

Kegagalan tersisa sesuai guard verified pada API dan akun demo lokal belum terverifikasi. Tidak dilakukan bypass guard atau perubahan status akun lewat database. Test toggle pantauan dilewati karena belum ada laporan demo. Test riset yang lolos mengizinkan job antre/ditolak/dihentikan; tidak membuktikan data scraping berhasil menjadi laporan. Test aksesibilitas login, riset, dan pengaturan lolos kriteria serious/critical yang diterapkan suite; ini belum audit penuh WCAG 2.1 AA.

Artefak lokal:

- Run pertama: `.dev-logs/phase0-e2e-first-report/index.html` dan `.dev-logs/phase0-e2e-first-results/`.
- Run akhir: `e2e/report/index.html` dan `e2e/test-results/`.
- Screenshot gagal akhir: `e2e/test-results/settings-pengaturan-API-ke-5ce1f-sebagai-bearer-lalu-dicabut-chromium/test-failed-1.png`.

## Verifikasi manual berbantuan browser

Chromium headless dengan sesi tamu fixture, tanpa pengiriman pesan nyata:

1. Buka `/market` Raqio dengan cookie tamu; sesudah restart frontend halaman tetap `/market` dan tampil. Screenshot desktop 1360×900 dan mobile 360×800 tersimpan.
2. Buka WA Suite tanpa sesi pada viewport 360×800; halaman login tampil dan screenshot tersimpan.
3. Readiness API pada pemeriksaan sebelumnya mengembalikan `{"status":"ready"}`; health WA `{"ok":true}`. Liveness bukan bukti SMTP/model/payment siap.

Output browser:

```text
Raqio guest: /market visible, screenshots desktop and 360px
WA Suite: login visible, screenshot 360px
exit 0
```

Screenshot: `.dev-logs/phase0-manual/raqio-market-desktop.png`, `raqio-market-360.png`, `wa-login-360.png`. Percobaan screenshot pertama memakai API `127.0.0.1` dengan web `localhost`, sehingga cookie berbeda host dan assertion gagal; diperbaiki pada skrip pemeriksaan dengan memakai `localhost` di keduanya, tanpa perubahan aplikasi.

## Batas bukti dan reproduksi

Pemeriksaan read-only database WA lokal menghasilkan `messageConversationNumberMismatch=0` dan `messagesWithMedia=79`, menggunakan join `messages.chat_id → chats.id` dan perbandingan `messages.number_id <> chats.number_id`. Ini hanya pemeriksaan konsistensi struktur lama; bukan audit registry UUID yang belum dibangun dan bukan bukti otorisasi URL sudah aman. Backfill dan audit ownership final wajib diulang pada PR media sebelum rilis.

Dependensi test yang sudah ada dipasang, tanpa perubahan manifest/lockfile. Test integrasi Go/Python membuat ulang database bernama test; jangan arahkan nama database test ke data pengguna. E2E menambah akun demo dan sesi tamu lokal. Flutter tidak tersedia, staging tidak tersedia, dan belum ada pengujian end-to-end antar kedua aplikasi karena kontraknya belum dibangun. Jangan menerjemahkan status baseline ini menjadi siap rilis.

Screenshot/log pengujian berada di direktori yang diabaikan Git agar tidak terunggah tanpa pemeriksaan data sensitif. Untuk review PR, lampirkan artefak yang sudah diperiksa atau reproduksi perintah di atas. Berkas kode produk tidak diubah; rollback Fase 0 hanya menghapus dokumen baru bila tidak dibutuhkan, tanpa rollback schema.
