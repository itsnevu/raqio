# Fase 0 — rencana upgrade WA Suite dan Raqio

Tanggal pemeriksaan: 17 November 2026, WIB. Status: rencana untuk persetujuan, belum ada implementasi fitur. Baseline WA Suite `d8e48f2`, Raqio `853f7fe`.

## Hasil pemeriksaan awal

Kedua aplikasi harus diperlakukan sebagai satu alur: riset → prospek → kampanye → antrean WA → penerimaan gateway → ack pengantaran → balasan pelanggan → transisi prospek. Saat ini hubungan tersebut belum tersedia. Raqio memiliki antrean Postgres, heartbeat, retry, outbox notifikasi, pembatasan organisasi, dan metrik; kemampuan itu dipertahankan dan diperluas, bukan dibuat ulang. WA Suite memakai Express, Baileys, better-sqlite3, cookie session, WebSocket, serta frontend HTML/CSS/JavaScript. SQLite sudah memakai WAL. Antrean WA masih berada di memori.

Temuan yang perlu diluruskan: WA Suite belum mempunyai kolom status pengiriman berlapis, bukan sekadar mempunyai kolom `sent` yang salah. Raqio justru menulis `campaign_recipients.status='sent'` setelah pemanggilan provider. Perbaikan semantik penerimaan/pengantaran harus mencakup keduanya. HTTP sukses dan ID pesan Baileys tidak membuktikan perangkat penerima sudah menerima pesan.

## Baseline yang sudah dieksekusi

| Pemeriksaan | Hasil |
| --- | --- |
| WA `node --regexp-interpret-all scripts/verify-ai-final.mjs` | Gagal pada suite hardening: 11 pemeriksaan lolos, 1 gagal pada pemeriksaan pola sumber reconnect WebSocket. Suite AI 1–6 sebelumnya lolos, termasuk screenshot browser. Runner berhenti sebelum langkah terakhirnya. |
| WA `verify-ai-security`, `verify-ai-profile`, `verify-ai-rules`, `verify-module-guide` | Semua lolos ketika dijalankan tersendiri. |
| WA `verify-phase1` sampai `verify-phase5`, `verify-phase345`, `verify-inbox`, `verify-wa1`, `verify-qr-dialog` | Semua lolos. Fixture database terisolasi; tidak mengirim WhatsApp nyata. |
| Raqio API `go test -count=1 ./...` | `ok github.com/raqio/api 43.593s`, exit 0. Postgres lokal tersedia; harness integrasi menggunakan database `raqio_test`, bukan database aplikasi. |
| Raqio API `go vet ./...` | Lolos, exit 0. |
| Web `npm test` | 17 file, 103 test lolos, exit 0. |
| Web `npm run typecheck` | Lolos. |
| Web `npm run lint` | Gagal: 2 error `react/no-unescaped-entities` pada `app/terms/page.tsx:42`; 2 warning gambar pada halaman peringkat wilayah. |
| Python `python -m pytest tests -q -ra` | Seluruh 196 test yang terkoleksi lolos, exit 0. Termasuk fixture Postgres terpisah. |
| Python `python -m ruff check .` | `All checks passed!`, exit 0. |
| Playwright Raqio | Run pertama: 5 lolos, 15 gagal. Sesudah restart frontend agar memuat konfigurasi: 18 lolos, 1 gagal, 1 dilewati. Sisa kegagalan: pembuatan API key demo 403 karena akun belum terverifikasi. Pantauan laporan dilewati karena laporan demo kosong. Lihat `PHASE-0-EVIDENCE.md`. |
| Flutter | Tidak dijalankan: executable `flutter` tidak tersedia pada PATH. |

`pytest` dan `ruff` semula belum terpasang; dipasang dari `requirements-dev.txt` yang sudah ada. Dependensi E2E dipasang menggunakan `npm ci` dari lockfile yang sudah ada. Tidak ada dependency produk baru. Build produksi, audit kerentanan, test race, simulasi crash nyata, pengiriman eksternal, restore backup, dan staging belum dibuktikan pada Fase 0.

## Pemetaan kode dan perubahan

| Area | Kode yang ada | Rencana tambahan/perluasan |
| --- | --- | --- |
| Media WA | `src/index.js`, `src/routes.js`, `src/db.js`, `src/wa.js`, `public/index.html`, `public/phase345.js` | Registry UUID media, endpoint pembuat URL, validator HMAC terikat user, join otorisasi, download aman, backfill dan laporan mismatch. |
| Antrean/kuota/status WA | `src/wa.js`, `src/limits.js`, `src/db.js`, `src/config.js` | `src/outboundQueue.js`, `src/quotaLedger.js`, `src/messageStatus.js`; migrasi idempoten serta adapter kompatibel pemanggil lama. |
| Retensi/backup WA | `src/index.js`, `src/backup.js`, `src/db.js` | `src/mediaRetention.js`, soft delete dan GC terpisah, cap byte per nomor, enkripsi backup dan latihan restore. |
| Gateway/integrasi WA | `src/index.js`, `src/routes.js`, `src/auth.js`, `src/wa.js`, `src/config.js` | `src/gateway/*`: autentikasi mesin, `/v1/outbound`, HMAC event, outbox callback, retry/DLQ, SSRF guard. |
| Operasional WA | `src/index.js`, `src/config.js`, `src/loginGuard.js` | Readiness, capability matrix yang tidak membocorkan rahasia, trace ID, metrik, alarm. |
| Adapter Raqio | `services/scraper/outreach.py`, `worker.py`, `apps/api/campaigns.go`, `apps/api/openapi.yaml` | Adapter berada pada Python sebagai pemilik jalur kirim; Go memvalidasi konfigurasi dan menerima webhook. Kontrak lintas bahasa berupa schema/fixture versi sama. |
| State prospek Raqio | `apps/api/market.go`, `campaigns.go`, `services/scraper/agent.py`, `outreach.py`, migrasi `leads` | Transisi kanonik dalam fungsi database Postgres, wrapper Go/Python, audit transisi dan inbox event idempoten. Semua writer memakai aturan yang sama. |
| Isolasi organisasi | `apps/api/auth.go`, `rbac.go`, `market.go`, `store.go`, `chat.go`, `campaigns.go`, `rank.go`, `report.go` | Inventaris endpoint lengkap; query ber-scope wajib, webhook credential ber-scope, audit jalur publik, test daftar/detail seluruh objek. |
| Konfigurasi/dev Raqio | `apps/api/main.go`, `mail.go`, `billing.go`, `ops.go`, `dev.ps1`, `deploy/compose.dev.yml`, `.env.example` per layanan | Mailpit, payment stub dev, startup validation, sinkronisasi konfigurasi, capability/readiness dan uji pengiriman lokal. |
| UI WA | `public/index.html`, `dashboard.css`, `style-extra.css`, `phase345.js`, `ai.js`, `module-guide.js`, `sw.js` | Status pesan, retry, viewer aman, inbox/shortcut/density, dashboard dan banner, token desain dan tema. |
| UI Raqio | `apps/web/app/{market,prospects,settings,campaigns,p/[token]}`, `components/market/Progress.tsx`, `RunForm.tsx`, `components/Shell.tsx`, `components/shell/*`, `lib/useJobStream.ts`, `lib/biz.ts`, `lib/campaigns.ts` | Onboarding, progres, papan prospek dengan keyboard, audit publik, mikrocopy, state kosong/error dan aksesibilitas. |
| Hardening | WA `passwords.js`, `auth.js`, `loginGuard.js`, konfigurasi Baileys; Raqio `auth.go`, `safety.go`, `csp.ts` | Argon2 dengan migrasi saat login, rotasi/revoke, CSRF, MIME sniffing, CSP, enkripsi kredensial serta rotasi kunci. |
| CI/bukti | WA `scripts/phase-harness.mjs`, `verify-*.mjs`; Raqio `.github/workflows/ci.yml`, `apps/api/*_test.go`, scraper `tests/`, web test, `e2e/` | Regression red→green, contract fixture, container integration, crash/replay, screenshot 360px/desktop, restore drill dan staging gate. |

## Keputusan arsitektur yang diajukan, belum diterapkan

1. Pertahankan SQLite untuk WA Suite: WAL + transaksi `BEGIN IMMEDIATE`, satu writer antrean aktif per instance database, lease durable dan heartbeat. `FOR UPDATE SKIP LOCKED` khusus Postgres; tidak digunakan di SQLite. Klaim ini tidak menjamin multi-host SQLite aman.
2. Pisahkan identitas message/job/event. Unique idempotency key wajib terikat credential/tenant dan menolak payload berbeda dengan key sama. Simpan snapshot payload, nomor, callback dan external reference yang tervalidasi.
3. Ledger reserve dan klaim job berjalan dalam transaksi konsisten. `date_key` ditetapkan memakai zona waktu bisnis yang eksplisit. Kompatibilitas kuota historis harus dibackfill; reserved tidak boleh dihitung ulang secara ganda saat restart.
4. Exactly-once delivery ke WhatsApp tidak dapat dijamin hanya dengan transaksi lokal: ada celah crash setelah provider menerima tetapi sebelum DB commit. Status ambigu wajib direkonsiliasi lewat ID provider, ack dan idempotency provider; jangan retry buta. Dokumentasikan kemampuan masing-masing adapter.
5. GatewayAdapter Python memakai metode `Send`, `ParseWebhook`, `VerifySignature` sesuai kontrak, dengan padanan handler Go. Rahasia mesin terpisah dari cookie browser. Callback ditandatangani atas body mentah + timestamp + event ID; jendela waktu dan replay protection wajib.
6. Gunakan fungsi transisi Postgres untuk semua penulis prospek lintas Go/Python; perubahan ke `deal` hanya tindakan manusia. Event lama/duplikat tidak menurunkan status. Balasan tanpa kecocokan tunggal masuk antrean tinjauan manusia.
7. Akses internal antarlayanan menggunakan allowlist service yang eksplisit. Guard SSRF Raqio saat ini menolak loopback/private; jangan membuka semua jaringan privat agar adapter localhost bekerja. Callback produksi tetap memakai validasi DNS/IP dan redirect yang ketat.
8. Token desain memiliki satu sumber versi dalam dokumentasi/berkas JSON yang divalidasi lalu dipetakan ke CSS masing-masing tanpa mengganti framework. UI menyembunyikan detail teknis yang tidak membantu operator.
9. Enkripsi Baileys harus mencakup material key selain kredensial utama. Karena sekarang tersimpan sebagai multi-file auth, perpindahan ke store terenkripsi perlu migrasi dua arah yang diuji dan kunci di luar database/backup.

ADR untuk keputusan di atas dibuat pada PR masing-masing di `docs/adr/`; Fase 0 belum menganggapnya keputusan yang disetujui.

## Urutan PR yang bisa direview sendiri

Setiap baris adalah satu batch/PR. PR antarrepo yang tergantung kontrak dirilis dengan feature flag nonaktif hingga pasangan tersedia. Tidak ada merge/publish otomatis dari rencana ini.

| Urutan | Judul PR | Repo | Bukti penerimaan utama |
| --- | --- | --- | --- |
| 01 | `fix(media): enforce signed ownership-scoped downloads` | WA | Test terlebih dahulu membuktikan akses lintas nomor; A→B 403, admin 200, tanpa sesi 401, signature/expiry/traversal 403; backfill mismatch dan containment Windows. |
| 02 | `feat(queue): persist outbound jobs and recover leases` | WA | Restart dan kill worker; satu job tidak diklaim dua worker; backoff, heartbeat, lease expiry, DLQ, konkurensi per nomor. ADR SQLite. |
| 03 | `fix(quota): reserve and settle sends atomically` | WA | Race pada slot terakhir; gagal terminal release; accepted commit; retry/restart tidak menggandakan kuota; batas tanggal. |
| 04 | `feat(messages): distinguish acceptance from delivery receipts` | WA | Ack delivered/read, ack duplikat/tidak berurutan, failed terminal, gateway ID, penanganan crash ambigu. |
| 05 | `fix(retention): delete media safely after database commit` | WA | Soft delete; crash sebelum/sesudah unlink; ENOENT; file bersama; orphan sweep dan cap byte. |
| 06 | `feat(ops): expose WA capabilities and queue telemetry` | WA | Readiness komponen kritis, model/gateway opsional, trace redaksi rahasia, alarm queue/lease. |
| 07 | `feat(dev): deliver local mail and simulate payments` | Raqio | Mailpit menerima email verify/reset/invite; stub invoice/webhook sukses/gagal/duplikat; login dev tetap tersedia. |
| 08 | `feat(gateway): add versioned outbound and signed callbacks` | WA | Bearer credential per nomor, E.164/template/vars, dedupe, HMAC, SSRF, outbox retry/DLQ; event masuk/status durable. |
| 09 | `feat(gateway): integrate WA Suite through provider adapters` | Raqio | Contract fixture Fonnte/Wablas/generic/WA, signature provider diverifikasi sesuai provider, callback replay/dedupe, outbox. |
| 10 | `refactor(leads): centralize audited prospect transitions` | Raqio | Seluruh writer Go/Python melewati state machine; E.164/external_ref; ambiguous review; deal manual; race dan event lama. |
| 11 | `fix(tenancy): enforce scoped access across resource endpoints` | Raqio | Matriks semua endpoint daftar/detail dan mutasi; API key, tamu, callback, ekspor, URL publik tidak bocor. |
| 12 | `feat(ui): show delivery progress and secure attachments` | WA | Status sesuai ack, retry idempoten, signed URL diperbarui, placeholder retensi, error 403 jelas, screenshot mobile/desktop. |
| 13 | `feat(inbox): improve navigation and operational visibility` | WA | Filter/density/shortcut tidak mengganggu input, unread, queue/quota/koneksi, banner, skeleton/error/undo yang aman. |
| 14 | `feat(onboarding): guide research and show job progress` | Raqio | Checklist sampai laporan berhasil, estimasi jujur, stop/reconnect, keyboard, screenshot. |
| 15 | `feat(prospects): add accessible board and public audit polish` | Raqio | Drag/drop dengan alternatif keyboard, transisi invalid ditolak, mobile 360px, metadata pratinjau. |
| 16 | `refactor(design): align shared tokens and dark theme` | Kedua repo, satu PR per repo | Kontrak token sama, kontras/fokus/aria-live, dark penuh, update realtime dibatch, stabilitas layout. |
| 17 | `fix(security): harden sessions uploads and credential storage` | Satu PR per repo; WA dipisah auth dan credential bila terlalu besar | Argon2/migrasi hash, CSRF, session rotation, rate limit, sniffing, CSP; migrasi encrypted Baileys dan key rotation. |
| 18 | `feat(backup): encrypt archives and verify restoration` | WA; Raqio restore regression terpisah | Restore isolated yang membuka data/sesi, integritas dan rotasi kunci; backup salah kunci gagal aman. |
| 19 | `feat(ci): gate integrated flows and staging evidence` | Satu PR per repo | Unit/integration/container/e2e/contract, crash/replay, restore, artefak screenshot/log dan metrik staging tersedia. |

Judul yang melibatkan dua repo berarti dua PR terpisah dengan referensi pasangan; jangan menggabungkan dua repository ke dalam satu PR. Security dan UI memiliki sub-batch bila ukuran diff melampaui kemampuan review mandiri. Temuan di luar scope wajib masuk `FINDINGS.md`, bukan disisipkan diam-diam.

## Strategi test red → green

Pemetaan terhadap nomor persyaratan lampiran: 1→PR01; 2→PR02; 3→PR03; 4→PR04/09; 5→PR05; 6→PR06/07; 7→PR07; 8→PR06/09/19; 9→PR02/08/09; 10→PR09; 11→PR08; 12→PR08/09; 13→PR10; 14→PR11; 15–16→PR12; 17–20→PR13 (banner Raqio juga PR14); 21–22→PR14; 23–24→PR15; 25–29→PR12–16; 30→PR17; 31→PR18; 32→PR19. Double-submit CSRF, sniffing upload dan rotasi sesi harus memiliki test khusus di PR17; metrik rasio ack dan latensi kirim termasuk PR06/09/19. Tidak ada item yang dianggap selesai oleh pemetaan ini.

Untuk setiap bug, buat fixture minimal terlebih dahulu, jalankan terhadap implementasi lama, simpan command, commit SHA, output serta exit code gagal. Setelah implementasi, jalankan test yang sama dan simpan output lolos. Baseline gagal yang ada sekarang bukan pengganti regression test baru. Jam, jaringan provider, ack dan filesystem memakai fixture terkendali; test integrasi memakai database sementara. Verifikasi manual selalu mencantumkan akun/role fixture, URL, ukuran viewport, tindakan, hasil serta screenshot/log tanpa rahasia. Belum ada output green untuk perbaikan baru karena implementasi belum diizinkan.

## Dependency, rilis, dan rollback

Tidak ada dependency produk ditambahkan pada Fase 0. Kandidat berikut wajib dijelaskan per PR: implementasi Argon2 (alternatif native Node versus package Go/Node yang kompatibel runtime), sniffing MIME (signature parser terbatas versus library), AEAD/backup (crypto bawaan atau age yang sudah dipakai Raqio), dan testcontainers (alternatif Docker Compose/service CI). Mailpit adalah service dev terpisah. Hindari menambah library drag-and-drop jika pointer/keyboard native cukup.

Migrasi bersifat expand-first, backup sebelum migrasi, feature flag default nonaktif, canary per nomor/organisasi. Jangan menjalankan antrean lama dan baru sebagai dua pengirim aktif sekaligus. Rollback mematikan intake, menunggu/merekonsiliasi lease aktif, menahan callback di outbox, lalu kembali ke versi kompatibel schema; jangan drop ledger/outbox/registry untuk rollback. Kredensial terenkripsi memerlukan checkpoint serta rencana pemulihan kunci. Rilis produksi ditahan selama baseline relevan merah, backfill mismatch belum ditangani, restore belum diuji, atau staging belum memberi bukti metrik.

## Persetujuan yang diperlukan

Setujui rencana Fase 0 dan urutan batch sebelum PR implementasi pertama. Sumber kewajiban: lampiran pengguna, bagian Aturan Kerja dan penutup: “Jangan menulis kode fitur sebelum rencana disetujui” dan “Tunggu persetujuan sebelum menulis kode.” Persetujuan ini belum mencakup deploy produksi, pembelian layanan, atau pengiriman kampanye nyata.
