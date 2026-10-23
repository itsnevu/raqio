# Audit Raqio, 21 Oktober 2026

Cakupan: skema Postgres dan migrasi, backend Go (`apps/api`), worker Python (`services/scraper`), frontend Next.js (`apps/web`), deploy (`deploy/`), dependency. Dikerjakan oleh tiga pemeriksa paralel (backend+DB, frontend, keamanan) ditambah pemeriksaan dependency dan statistik DB. Temuan yang muncul di lebih dari satu pemeriksa digabung. Path relatif terhadap root repo.

Tingkat: **K** kritis, **T** tinggi, **S** sedang, **R** rendah.

## Status perbaikan (21 Oktober 2026, malam)

Seluruh temuan di bagian 1 sampai 3 sudah dikerjakan dalam satu putaran oleh lima pelaksana paralel, lalu diverifikasi gabungan. Hasil verifikasi akhir:

| Bagian | Verifikasi |
|---|---|
| Go API | gofmt dan vet bersih, seluruh unit + 20an tes integrasi lolos di Go 1.25 (termasuk race job aktif, refund kuota, idempotensi Xendit, lockout backoff, API key terikat membership, CSRF, SSRF guard, outbox webhook, SSE delta, migrasi 007 idempoten) |
| Worker Python | ruff bersih, 108 tes lolos (STOP requeue, fencing, file hasil, klasifikasi error, safe_url, batas 2 MB, Postgres integrasi) |
| Frontend | tsc bersih dengan noUncheckedIndexedAccess, ESLint + jsx-a11y bersih, 51 tes vitest, next build sukses, npm audit produksi 0 kerentanan |
| Deploy | compose produksi dan dev valid, Caddyfile valid, image API 22 MB nonroot terbangun, backup age diuji nyata |
| End to end | Chromium headless: auto tamu, login, market, pantau, prospek, pengaturan, asisten, CSP nonce, logout; API langsung: docs, metrics, limiter tamu, CSRF 403 |

Yang tersisa dan sengaja ditunda:
- Tes komponen React berbasis DOM (logika sudah dipindah ke lib dan dites murni).
- Verifikasi workflow CI dan Dependabot di GitHub baru terjadi pada push pertama.
- Chromium di container worker dengan cap_drop ALL belum diuji menjalankan Playwright.
- Endpoint POST /chat/sid belum ada di backend (klien jatuh ke randomUUID).
- Thread gmaps.details yang timeout dibiarkan daemon; jangka panjang detail dijalankan sebagai subprocess.
- Advisori npm yang tersisa hanya di devDependencies (vitest 3, braces lewat eslint-config-next).

Perubahan belum di-commit (122 file). Rincian per area ada di laporan masing-masing pelaksana, ringkasnya: safety.go, store.go, outbox.go, migrasi 007, worker.py dengan fencing dan file hasil, netutil.safe_url, apps/web dipecah ke lib/market, components/market, components/shell dengan klien API bertipe dan CSP nonce, compose dengan empat network dan hardening, CI dengan govulncheck, pip-audit, npm audit, integrasi Postgres, dan build image.

## Ringkasan eksekutif

Fondasinya sudah benar: semua query terparameter, semua handler memfilter `org_id` dari sesi, sesi dan token dikelola rapi, API hanya di balik Caddy, kuota dikurangi atomik. Masalahnya ada di tiga tempat:

1. **Dependency dan runtime tertinggal.** Next.js 15.3.3 punya 1 kerentanan kritis dan 2 tinggi (npm audit, perbaikan tersedia di 15.5.x tanpa major bump). Go 1.23 sudah lewat masa dukungan. Requirements Python tidak dipin.
2. **Jalur legacy Python dan fitur baru belum setara dengan standar inti.** Proxy ke `app.py` melewati isolasi tenant dan kuota. Webhook, SMTP, dan enrichment website rawan SSRF dan injeksi header. Cache laporan lintas org menyalin kontak hasil "Cek kontak" berbayar org lain.
3. **Ketahanan operasional.** Race kuota dan job ganda, aktivasi invoice tidak idempoten, loop latar belakang tidak aman untuk 2 replika API, deploy membatalkan job yang sedang jalan, polling frontend bisa macet permanen.

Total 83 temuan unik: 1 kritis, 20 tinggi, 36 sedang, 26 rendah. Dua puluh satu teratas bisa diselesaikan dalam sekitar dua minggu kerja dan menutup hampir semua risiko nyata.

## 1. Kritis dan tinggi (kerjakan dulu, urut)

| # | Tk | Area | Temuan | Lokasi | Perbaikan |
|---|---|---|---|---|---|
| 1 | K | Dep | Next.js 15.3.3: 1 kritis + 2 tinggi menurut `npm audit` (image optimizer, content injection, postcss, sharp). Rute `/login` publik dan cookie tamu gratis memperluas permukaan serang | `apps/web/package.json` | Upgrade ke 15.5.x terbaru, rotasi `AUTH_SECRET`, `npm audit` di CI |
| 2 | T | Keamanan | Proxy legacy Python melewati tenant dan kuota: id chat berurutan, `/chat/poll?job=N` membaca jawaban org lain, sid `default` dipakai bersama, `/competitors` dan `/report` menampilkan ig.db global, `/ask` menjalankan agent LLM tanpa kuota dan bisa oleh viewer atau tamu | `apps/api/main.go:253`, `services/scraper/app.py:493,951,962,1055,1064` | Matikan rute legacy di produksi. Fitur IG sudah ada versi job worker-nya; pindahkan chat agent ke job dengan org_id, role analyst, kuota |
| 3 | T | Keamanan | SSRF lewat `webhook_url`: hanya cek prefix http(s), redirect diikuti, `testWebhook` jadi oracle jaringan internal (`legacy:8000`, `postgres`, `169.254.169.254`) | `apps/api/market.go:508`, `apps/api/alerts.go:243,319` | Wajib https, resolve DNS lalu tolak IP privat/loopback/link-local di `Dialer.Control`, `CheckRedirect` menolak, kirim lewat antrean |
| 4 | T | Keamanan | Injeksi header SMTP: Subject dirangkai mentah, nama org dan industry/area (setWatch tanpa `cleanField`, `cleanRe` masih mengizinkan CRLF) masuk ke Subject. Bisa jadi relay spam | `apps/api/mail.go:32`, `market.go:13,214`, `account.go:137`, `alerts.go:193` | Buang CR/LF di semua nilai header, `mime.QEncoding`, `cleanField` di setWatch, validasi `notify_email` dengan `mail.ParseAddress` |
| 5 | T | Keamanan | API key tetap hidup setelah pembuatnya dikeluarkan atau diturunkan perannya, dan key admin bisa membuat key baru | `apps/api/rbac.go:51`, `account.go:199` | JOIN memberships saat validasi key, role efektif = min(key, anggota), cabut key saat removeMember, deleteAccount, reset password |
| 6 | T | Keamanan | Mode tamu: limiter sebenarnya 5 per menit per IP (komentar bilang per jam), `fresh:true` melewati cache, tamu bisa membanjiri antrean worker dan membuat IP server diblokir Google | `apps/api/guest.go:21`, `market.go:111` | `newLimiter(1,5)` plus batas global tamu per jam, tamu tidak boleh `fresh`, prioritas job terendah, Turnstile bila disalahgunakan |
| 7 | T | Keamanan | Token reset, verifikasi, dan undangan tercetak di log bila `SMTP_HOST` kosong, dan compose produksi default-nya kosong | `apps/api/mail.go:28`, `deploy/compose.yml:33` | Redaksi token di log, tolak start produksi tanpa SMTP kecuali `DEV=1` |
| 8 | T | Backend | Race antara `activeJob`, `consume`, dan `enqueue`: dua POST bersamaan jadi dua job dan kuota terpotong ganda. Kuota tidak dikembalikan saat job gagal final | `apps/api/market.go:106,154,287` | Unique partial index `jobs(org_id) WHERE status IN ('queued','running')`, consume+enqueue satu transaksi, refund saat failed/cancelled |
| 9 | T | Backend | Aktivasi invoice Xendit tidak idempoten: SELECT di luar transaksi, UPDATE tanpa `status='pending'`, error diabaikan. Callback ganda memperpanjang paket dua kali. Token dibandingkan non-constant-time | `apps/api/billing.go:113,136-153` | `UPDATE invoices SET status='paid' WHERE external_id=$1 AND status='pending' RETURNING`, `subtle.ConstantTimeCompare` |
| 10 | T | Backend | Loop latar belakang tidak aman multi-replika: scheduler, alertLoop (tanpa SKIP LOCKED, `alerted=true` ditandai sebelum alert dibuat), migrate tanpa advisory lock | `jobs.go:131`, `alerts.go:92-112`, `db.go:17` | `pg_try_advisory_lock` per loop, `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING` |
| 11 | T | Backend | Error tulis diabaikan: register (membership gagal tapi commit), deleteAccount (`tx, _ :=`), reset/change password balas ok walau hash gagal, checkout (invoice id 0, `external_id` bentrok di detik sama), setWatch, switchOrg, acceptInvite. bcrypt error diabaikan (password >72 byte menyimpan hash kosong) | `auth.go:197,229,360`, `account.go:71,93`, `billing.go:70,77` | Helper `must(err)` yang log dan balas 500, cek semua `Exec`, tolak password >72 byte |
| 12 | T | Backend | `clientIP` mempercayai `X-Forwarded-For` paling kiri: bypass rate limit dan guestLimit, lockout email bisa dipakai mengunci akun korban | `auth.go:145,261-269` | Env `TRUSTED_PROXIES`, ambil IP dari kanan, lockout per (email, IP) dengan backoff, bcrypt dummy saat user tidak ada |
| 13 | T | DB | `jobs.log` di-append tiap 1,5 detik lalu dibaca penuh tiap detik oleh SSE dan `/log`: TOAST rewrite, dead tuple, I/O sebanding ukuran log kali jumlah klien | `worker.py:63`, `rbac.go:152`, `market.go:425` | Tabel `job_logs(job_id, seq, line)` atau SSE pakai `substring(log from $offset)` |
| 14 | T | DB | N+1 dan JSONB penuh (rata-rata 110 KB per laporan) dibaca untuk prospects, watchData, suggest, listReports. `latestReports` mengabaikan LIMIT | `market.go:319-337,404`, `alerts.go:361` | Satu query `row_number() OVER (PARTITION BY pasangan)`, simpan ringkasan dan diff di kolom terpisah, tabel places ternormalisasi |
| 15 | T | DB | FK tanpa index: `reports.job_id`, `watch_alerts.report_id/prev_report_id`, `audit_log.user_id`, `jobs.user_id`, `sessions.org_id`, `tokens.user_id/org_id`, `api_keys.created_by`, `memberships` dicari lewat `user_id` saja. Retention dan purge jadi seq scan | migrasi 001-006 | Migrasi 007 menambah index tersebut plus `(org_id, id DESC)` di reports dan index kolom waktu untuk retensi |
| 16 | T | Worker | SIGTERM membatalkan job yang sedang jalan secara permanen (`cancelled` final, kuota hangus). Setiap deploy membunuh riset pelanggan | `worker.py:125,164` | Saat STOP kembalikan job ke `queued` dengan `attempts-1`, atau grace period |
| 17 | T | Worker | Tidak ada fencing: worker lama yang dianggap mati tetap menulis report dan `finish` tanpa syarat. `insert_report` dan `finish` autocommit terpisah, crash di antaranya membuat laporan duplikat | `worker.py:42,85,170,192` | Kolom `locked_by` dicek di `finish` dan insert, bungkus dalam satu transaksi, unique `(job_id, lower(area))` |
| 18 | T | Worker | SQLite `ig.db` sebagai perantara: hasil dioper lewat regex stdout, multi-replika tanpa WAL/busy_timeout, compare mengambil laporan SQLite terbaru yang bisa milik org lain, kontak disimpan selamanya di luar retensi | `worker.py:166,193`, `market.py:37` | Subprocess menulis JSON ke file temp, WAL + busy_timeout, retensi SQLite, jangka panjang hapus SQLite |
| 19 | T | Frontend | Polling `/log` dan chat: setTimeout rekursif tanpa cleanup, tanpa catch, satu error memutus rantai permanen dan tombol Riset terkunci, closure basi, dobel di StrictMode | `app/market/page.tsx:202-235`, `app/page.tsx:127-141` | Hook `useJobStream` memakai SSE `/log/stream` yang sudah ada, AbortController di cleanup, backoff |
| 20 | T | Frontend | Data dimutasi in-place (`p.lead=`, `Object.assign`, `_power`) lalu render dipaksa lewat counter. `filtered` useMemo melihat referensi `all` yang sama, jadi filter "Follow up" dan "Prospek" basi setelah status lead diubah | `market/page.tsx:147,427,433`, `lib/biz.ts:143` | State immutable (useReducer), skor kekuatan di useMemo yang mengembalikan Map |
| 21 | T | Frontend | Open redirect: `?next=/\evil.com` lolos cek `//` lalu dinormalisasi browser | `app/login/page.tsx:55` | `new URL(next, location.origin).origin === location.origin` |
| 22 | T | Frontend | Jawaban LLM dirender lewat `dangerouslySetInnerHTML` dengan renderer regex buatan sendiri; replace berantai bisa menyisipkan tag ke dalam atribut. Prompt injection dari data scraping memperbesar risiko | `app/page.tsx:10-58,220` | react-markdown tanpa raw HTML, atau DOMPurify, plus tes payload |
| 23 | T | Frontend | ESLint tidak terpasang sama sekali; komentar `eslint-disable` adalah kode mati yang menutupi bug dependensi nyata (#19, #20). `next lint` deprecated | `apps/web/package.json` | ESLint 9 flat config, `next/core-web-vitals` + `jsx-a11y`, jalankan di CI |
| 24 | T | Frontend | Fetch tanpa cek `r.ok` lalu di-cast: settings kosong selamanya atau crash di `plans.map`, market crash di `verdict` saat respons `{error}`, prospects dan watch kosong tanpa penjelasan | `settings:48-52,81,110`, `market:188`, `prospects:36` | Klien API bertipe (`lib/api.gen.d.ts` sudah ada tapi tidak dipakai) yang melempar `ApiError`, state `{loading, error, data}` |
| 25 | T | Deploy | Image scraper berjalan sebagai root dengan Chromium dari image Playwright 1.47 (2024) yang membuka situs tidak tepercaya; `playwright` di pip tidak dipin; semua service di satu network | `services/scraper/Dockerfile`, `deploy/compose.yml` | `USER pwuser`, upgrade image dan pin pip, pisah network edge/app/data/legacy, `cap_drop: ALL`, `no-new-privileges` |

## 2. Sedang

**Database**
- Index tidak cocok query: `listReports` butuh `(org_id, id DESC)`; retensi memakai `created_at`, `finished_at`, `at` tanpa index; `igProfile` memfilter `params->>'username'` di luar partial index; cek heartbeat basi tanpa index (`market.go:46`, `jobs.go:139,180`, `ig.go:27`).
- Salinan cache menggandakan JSONB per klik tanpa dedupe, memicu webhook `report.done` dan diff kosong; `cached_from` tanpa FK (`alerts.go:343`). Kembalikan id salinan lama bila sudah ada.
- Constraint hilang: CHECK untuk `jobs.status/kind`, `leads.status`, `invoices.status`, `tokens.kind`, `orgs.plan`, batas atas `watches.every_days`, `usage.count >= 0`. Enum status lead ditulis di tiga tempat (Go dua kali, Python sekali).
- Bug laten `consume`: klausa kuota hanya berlaku di `DO UPDATE`, INSERT pertama bulan itu dengan `n > max` atau `kind` tak dikenal lolos (`jobs.go:56`).
- Batas anggota bisa dilewati: undangan pending tidak dihitung, `acceptInvite` dan register via undangan tidak mengecek batas (`account.go:124,171`, `auth.go:229`).
- Tidak ada `updated_at` di `reports`, `org_settings`, `orgs`, `users`, `invoices`, `watches`, `api_keys`.
- `putSettings` enam UPDATE terpisah: URL webhook tidak valid dibalas 400 setelah email dan telegram tersimpan (`market.go:501-524`).

**Backend**
- Error Query/Scan/`rows.Err` diabaikan dan hasil kosong dibalas 200 di belasan tempat (`market.go:35,56,189,329,380,458`, `auth.go:302,337`, `billing.go:162`, `jobs.go:45,156`).
- Goroutine tanpa batas: `go a.webhook` per laporan, `go notifyAlert`, `go a.db.Exec last_used_at` per request API key berebut pool 10 koneksi (`alerts.go:118,143`, `rbac.go:59`). Butuh outbox webhook + worker pool, throttle `last_used_at`.
- Timeout: `http.Server` tanpa `IdleTimeout` dan `WriteTimeout`; `checkout` memakai `http.DefaultClient`; `smtp.SendMail` sinkron tanpa timeout di register/forgot/invite; `detail` menahan request 90 detik polling 700 ms; tidak ada `statement_timeout`.
- SSE tanpa batas koneksi: tiap stream query tiap detik sampai 30 menit, tamu pun bisa (`rbac.go:130-185`). Batasi 3 per org, atau LISTEN/NOTIFY.
- Verifikasi email tidak pernah dipaksa: pre-account takeover (daftar dengan email korban, buat API key, korban reset password, key penyerang tetap hidup). Wajibkan verifikasi untuk checkout, undangan, API key, webhook; cabut key saat verifikasi pertama dan reset.
- Kebocoran intelijen lewat cache dan suggest: `/market/suggest` menampilkan pasangan industri+wilayah yang diriset org lain ke semua user termasuk tamu; `copyCachedReport` menyalin telepon, website, IG, email hasil "Cek kontak" berbayar org asal, plus `cached_from` membocorkan id (`alerts.go:334-364`). Cache hanya data dasar Maps, buang field detail, suggest dari kurasi atau ambang minimal 3 org.
- Token bot Telegram bocor ke log lewat `*url.Error` (`alerts.go:215`).
- `trunc` memotong byte bukan rune: UTF-8 rusak, Postgres menolak, error ikut diabaikan (`main.go:176`).
- Validasi input: `readJSON` error diabaikan hampir di semua handler, industry/area tidak dinormalisasi (cache dan dedupe meleset, nilai berawalan `-` merusak argparse), `detail.Key` boleh kosong, undangan hanya cek ada `@`.
- SSRF dan ReDoS di enrichment website worker: tanpa filter IP, redirect diikuti, ukuran respons tak dibatasi, `EMAIL_RE` kuadratik (`competitor_website_monitor.py:26-72`, `netutil.py:25`). Website listing bisa dibuat penyerang.
- Go 1.23 sudah EOL; `x/crypto` 0.28 (ada 0.58), pgx 5.7.1 (ada 5.11). Tambah `govulncheck` di CI.
- Hak hapus dan retensi PDP: audit_log menyimpan IP 365 hari setelah user dihapus, org bisa tanpa owner, `ig.db`, `ig_profiles`, `leads` tidak kena retensi, backup 14 hari menyimpan data yang sudah dihapus.
- Backup `pg_dump` tidak terenkripsi, di host yang sama, berisi hash password dan webhook_secret.

**Worker**
- Batas wilayah tidak konsisten: `market.py` memotong ke 6, `worker.py` ke 8, paket team membayar 8 (`market.py:658`, `worker.py:182`).
- Retry mengulang error permanen ("Tidak ada hasil dari Google Maps") sampai 3 kali 25 menit; `started_at` tidak di-reset; `do_market_detail` in-process tanpa timeout, heartbeat, atau cek cancel.
- `do_market_detail` read-modify-write JSONB penuh tanpa `FOR UPDATE`, hanya `all` diperbarui sehingga `prospects` dan `leaders` basi; `created_at` dari jam Python; loop utama hanya menangkap `OperationalError`.

**Frontend**
- Komponen raksasa: `market/page.tsx` 823 baris berisi 10 komponen plus logika domain, `Shell.tsx` 481 baris. Pecah ke `lib/market/verdict.ts` (fungsi murni, bisa dites), hook `useReport`, `components/market/*`. Hapus trik `document.getElementById("runbtn").click()`.
- Duplikasi: helper POST ada 4 versi, daftar path publik di 3 tempat, SVG brand dua kali, token tema dua kali dengan `!important` dan tema light yang tidak pernah dipasang.
- Fetch berulang: Nav mengunduh seluruh `/prospects/data` hanya untuk badge, `/auth/me` dua kali, `/market/watches` setiap buka laporan. Butuh endpoint ringan dan cache bersama (SWR atau React Query).
- Semua halaman `"use client"` tanpa streaming atau `loading.tsx`: waterfall JS lalu fetch. Prospects, watch, settings bisa server component.
- Render berlebih: objek `api` di Shell tidak di-useMemo (semua konsumen render ulang tiap toast), `verdict()` dan 9 filter dihitung tiap ketikan, `draft()` per baris tiap render, tabel tanpa virtualisasi.
- Aksesibilitas: input hanya placeholder (belasan), elemen klik berupa `span`/`div`/`th` tanpa keyboard, drawer tanpa `role="dialog"` dan focus trap (isi tetap bisa di-Tab saat tertutup), toast dan status tanpa `aria-live`, `outline: none` tanpa `:focus-visible`.
- Mobile: papan prospek hanya drag-and-drop HTML5 (tidak jalan di layar sentuh), tabel 9 kolom scroll ganda, tooltip tanpa padanan sentuh.
- Konten salah: "Tanpa login." di halaman market, pesan developer tentang `OPENROUTER_API_KEY` tampil ke pengguna, link ke fitur legacy yang disembunyikan, `/login?msg=reset-ok` tidak pernah dibaca.
- Error boundary hanya satu dan menampilkan `error.message` mentah; tidak ada `global-error.tsx`, `not-found.tsx`, atau boundary per chart/drawer.
- Tes komponen tidak ada; `md()`, `verdict`, `keyPoints`, validasi `next`, dan polling belum dites.
- CSP: `'unsafe-inline'`, cdnjs diizinkan (gadget bypass CSP), `img-src https:` luas, tanpa `base-uri`, `object-src 'none'`, `form-action`. Ganti ke nonce di middleware.
- CSV formula injection: sel berawalan `= + - @` dari data scraping dieksekusi Excel (`lib/biz.ts:147`). Prefix `'`.
- `/metrics`, `/docs`, `/openapi.yaml` publik tanpa sesi; Swagger UI dari cdnjs tanpa SRI di origin yang sama dengan cookie.

## 3. Rendah

- CSRF: hanya `Sec-Fetch-Site` bila ada, Origin tidak dicek walau komentar bilang dicek, `/auth/login`, `/auth/guest`, `/auth/logout` tidak dicek, `readJSON` tidak memeriksa Content-Type (login CSRF lewat `text/plain`).
- `igRun` tanpa `requireRole("analyst")` (`main.go:252`); viewer bisa menghabiskan kuota cek kontak.
- Placeholder `AUTH_SECRET` di `.env.example` (43 karakter) lolos cek minimal 16; web tidak memvalidasi secret sama sekali.
- Postgres dan Redis dev ter-bind di 0.0.0.0 tanpa password berarti.
- Deploy: tag image mengambang tanpa digest, api/web/worker tanpa healthcheck, `restart`, dan batas resource; Dockerfile web menyalin node_modules dev ke runtime (pakai `output: "standalone"`); HSTS tanpa `includeSubDomains`.
- Undangan: `issueToken` membatalkan token undangan email itu lintas org (org B bisa membatalkan undangan org A), hasil `consumeToken` diabaikan (race pemakaian ganda), `telegram_chat` bebas diisi (bot bisa spam chat orang lain), `webhook_secret` kosong berarti HMAC kunci kosong.
- Data tumbuh tanpa batas: audit_log tiap POST 365 hari, `ig_profiles.history`, `jobs.result` compare penuh.
- Nilai hard-coded: paket dan harga di kode, ambang lead 40 di Go dan Python, angka "2 riset, 24 jam", "5 riset dan 30 cek kontak", "tiap 7 hari" ditulis manual di frontend (ambil dari `/billing/plans` atau `/auth/me`).
- Format error tidak konsisten ("db", "antrian", "bad json" vs kalimat ramah), kegagalan upstream dibalas 400 bukan 502, data tidak ada dibalas 200.
- Kode duplikat Go: scan watches, query job terbaru, laporan sebelumnya, cek peran ganda, `reportChanges` Go dan Python harus dijaga sinkron.
- Observability: handler balas "db" tanpa log error aslinya, scheduler melewati watch yang kuotanya habis tanpa log, belum ada metrik durasi job dan kegagalan webhook.
- Frontend: state filter/sort/q tidak di URL, draf dilacak per indeks (pindah baris setelah sort), forgot/reset tanpa state busy, `href="#"` dengan `target="_blank"`, driver.js diimpor statis ke semua halaman, iframe asisten memuat seluruh app dan tetap hidup, font Geist dirujuk tapi tidak dimuat, `NEXT_PUBLIC_LEGACY` dibaca saat build, localStorage offer/sid tidak per org dan tidak dibersihkan saat logout, link eksternal tanpa `rel` dan href tanpa validasi skema.
- `vitest` 2.1.8 punya CVE (dev saja), Dependabot belum ada.

## 4. Yang sudah benar

- Semua query Go terparameter; satu-satunya f-string SQL di Python hanya menyusun placeholder.
- Semua handler memfilter `org_id` dari sesi: report, detail (dicek lagi di worker), lead, watch, compare, log, alerts, API key, invoices.
- Sesi: id acak 24 byte di DB, HMAC constant-time di Go dan JS, cookie HttpOnly SameSite=Lax Secure di produksi, cek membership dan `deleted_at`. Logout, reset, ganti password, dan removeMember mencabut sesi.
- bcrypt cost 12; token 32 byte disimpan sha256, sekali pakai atomik, bermasa berlaku; `/auth/forgot` tidak membocorkan email.
- API key: hanya hash, ditampilkan sekali, prefix, revoke, maksimal 20, role tidak melebihi pembuat.
- `MaxBytesReader` 64 KB, RE2 aman ReDoS, subprocess tanpa shell, username IG divalidasi.
- Kuota atomik, rate limit per IP dan per org, callback Xendit wajib token dan cek jumlah, webhook HMAC dan secret di-mask.
- Rahasia tidak ada di git dan tidak ada di riwayat; API distroless nonroot, web `USER node`, hanya Caddy yang membuka port, header nosniff, X-Frame-Options, Referrer-Policy, frame-ancestors.
- Retensi untuk reports, jobs, sessions, tokens, audit, tamu; deleteAccount wajib password; RBAC undangan dan pengeluaran anggota konsisten.

## 5. Rencana kerja

**Minggu 1, tutup risiko nyata (#1 sampai #12)**
- Upgrade Next.js 15.5.x, Go 1.25, pgx, x/crypto; pin requirements Python; `npm audit`, `govulncheck`, `pip-audit`, Dependabot di CI.
- Matikan rute legacy di produksi (`SCRAPER_URL` kosong = 404), chat agent jadi job worker.
- SSRF guard bersama untuk webhook dan enrichment website; sanitasi header SMTP; validasi `notify_email`.
- API key terikat membership dan dicabut saat keluar/reset; limiter tamu per jam plus batas global; redaksi token di log.
- Transaksi dan unique index untuk job aktif, refund kuota, aktivasi invoice idempoten, advisory lock untuk loop, helper error yang tidak diam.
- `TRUSTED_PROXIES`, lockout per (email, IP).

**Minggu 2, ketahanan data dan worker (#13 sampai #18, sedang DB/worker)**
- Migrasi 007: index FK, `(org_id, id DESC)`, index kolom waktu, CHECK constraint, `updated_at`, tabel `job_logs`.
- Query laporan terbaru dengan window function, ringkasan dan diff disimpan terpisah, cache hanya data dasar Maps tanpa kontak berbayar, suggest dengan ambang.
- Worker: STOP mengembalikan job ke antrean, fencing `locked_by`, satu transaksi insert+finish, hasil subprocess lewat file JSON, klasifikasi error permanen, timeout di detail, batas wilayah 8.

**Minggu 3 dan 4, frontend (#19 sampai #24, sedang frontend)**
- ESLint + jsx-a11y di CI, klien API bertipe dari `api.gen.d.ts`, open redirect dan markdown aman.
- Ganti polling dengan SSE lewat hook, state immutable, pecah `market/page.tsx` dan `Shell.tsx`, error boundary per bagian, `loading.tsx`.
- Aksesibilitas dasar: label, `:focus-visible`, dialog, `aria-live`, keyboard untuk elemen klik, menu pindah status di mobile.
- CSP nonce, buang cdnjs, `/metrics` internal saja, CSV escape.

**Berkelanjutan**
- Outbox webhook dan notifikasi dengan worker pool; batas SSE; verifikasi email dipaksa untuk aksi sensitif.
- Retensi PDP lengkap (ig.db, ig_profiles, leads, anonimisasi IP), backup terenkripsi offsite, pisah network dan hardening container, pin image dengan digest, healthcheck dan restart policy.
- Paket dan harga ke tabel, angka kuota di frontend dari API, format error seragam, metrik job dan webhook.
