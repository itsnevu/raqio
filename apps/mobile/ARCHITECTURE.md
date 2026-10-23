# Arsitektur Raqio Mobile dan hubungannya dengan web

Dokumen ini menjawab dua hal: **bagaimana hubungan aplikasi mobile dengan web**, dan **bagaimana aplikasi
mobile disusun** supaya isinya dan desainnya tetap sejalan dengan web.

## 1. Prinsip: mobile adalah klien kedua, bukan produk kedua

```
                    ┌───────────────┐
   apps/web ────────┤               ├──────── Postgres (reports, leads, jobs, chat, campaigns)
   (Next.js)        │  apps/api(Go) │
                    │  satu-satunya │──────── antrean job ────── services/scraper (worker Python)
   apps/mobile ─────┤  pintu data   │
   (Flutter)        └───────────────┘
```

- **Tidak ada backend khusus mobile.** Mobile memanggil endpoint Go yang sama dengan web
  (`/auth/*`, `/market/*`, `/prospects/*`, `/watch/*`, `/campaigns*`, `/chat*`, `/org*`, `/billing/*`,
  `/rank*`, `/stats`, `/business`, `/log`, `/jobs`, `/stop`).
- **Akun, org, kuota, dan data sama persis.** Login di HP = login di web. Sesi memakai cookie
  `raqio_session` yang sama; mobile menyimpannya di SharedPreferences dan mengirimnya sebagai header
  `Cookie`. Riset yang dijalankan dari HP muncul di web, status prospek yang digeser di web berubah di HP.
- **Logika domain diduplikasi secara sadar, dengan tes paritas.** Skor, celah, draf WhatsApp, dan
  kesimpulan laporan di `lib/biz.dart` adalah port langsung `apps/web/lib/biz.ts` + `market/page.tsx`;
  `test/biz_test.dart` menjaga angkanya identik. Yang tidak boleh diduplikasi: aturan kuota, status job,
  isi laporan — semuanya datang dari server.
- **Worker tidak tahu ada mobile.** Semua pekerjaan berat (scrape Maps, IG, kampanye otomatis, chat agent)
  tetap lewat antrean job di Postgres; mobile hanya memantau lewat `/log`, `/jobs`, `/chat/poll`.

## 2. Hubungan desain: token yang sama, idiom platform berbeda

Sumber kebenaran desain adalah `apps/web/app/globals.css`. Pemetaannya:

| Token web                | Flutter (`lib/theme.dart`)                  |
| ------------------------ | ------------------------------------------- |
| `--bg #000`              | `RaqioColors.bg`, `scaffoldBackgroundColor` |
| `--panel #0A0A0A`        | `RaqioColors.panel`, widget `Panel`         |
| `--sunk #151515`         | `RaqioColors.sunk`                          |
| `--line #262626`         | `RaqioColors.line`, semua border 1px        |
| `--text/muted/faint`     | `RaqioColors.text/muted/faint`              |
| `--good #FFB020` (amber) | `RaqioColors.good` (aksen, WhatsApp, OK)    |
| `--bad/--warn`           | `RaqioColors.bad/warn`                      |
| Albert Sans              | font bundel `assets/fonts`                  |
| sudut tajam (radius 0)   | `RoundedRectangleBorder(BorderRadius.zero)` |
| label kapital `.sub-h`   | widget `Label`                              |
| `.big-n` / `.key3`       | baris angka besar (`_Big`, `_Stat`)         |
| `.chip`                  | `ChoiceChip`/`FilterChip` bergaris          |

Idiom yang sengaja berbeda (bukan penyimpangan, tapi terjemahan ke platform):

| Web                                   | Mobile                                              |
| ------------------------------------- | --------------------------------------------------- |
| nav atas + menu "Lanjutan"            | bottom navigation 5 tab + layar Akun                |
| drawer kanan (panel bisnis, asisten)  | bottom sheet (panel bisnis), tab Asisten            |
| kanban drag & drop prospek            | tab per status + tombol "Pindah ke"                 |
| SSE `/log/stream`                     | polling `/log`, `/chat/poll` (hemat koneksi mobile) |
| ekspor CSV, cetak laporan             | tidak ada (bukan idiom HP; pakai web)               |
| tur driver.js                         | teks bantuan singkat di tiap layar                  |
| notifikasi browser                    | toast / badge di tab                                |

## 3. Peta halaman web ↔ layar mobile

| Web                 | Mobile                                            | Endpoint utama                                                        |
| ------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| `/` landing publik  | splash + layar Masuk (hero singkat)               | -                                                                      |
| `/login`, `?auto=1` | `login_screen` (+ tombol "Coba tanpa daftar")     | `/auth/login`, `/auth/guest`                                           |
| `/register`         | `register_screen`                                 | `/auth/register`                                                       |
| `/forgot`, `/reset` | `forgot_screen` (kirim email + form token)        | `/auth/forgot`, `/auth/reset`                                          |
| `/market`           | tab **Riset** (`market_screen`)                   | `/market/run`, `/market/reports`, `/market/suggest`, `/stats`, `/jobs`, `/log`, `/stop` |
| `/market` (mode Bandingkan) | mode Bandingkan + `compare_screen`        | `/market/compare/run`, `/market/compare`                               |
| laporan (ReportView)| `report_screen` (Ringkasan, Pemain, Prospek)      | `/market/report`, `/market/watch`, `/market/detail`                    |
| panel bisnis        | `place_sheet` (+ logo, bagian Instagram)          | `/market/lead`, `/market/detail`, `/business`, `/run`, `/logo/{key}`   |
| `/prospects`        | tab **Prospek** (`prospects_screen`)              | `/prospects/data`, `/market/lead`, `/org/settings` (offer)             |
| `/campaigns`, `/campaigns/[id]` | `campaigns_screen`, `campaign_detail_screen` | `/campaigns*`                                                 |
| `/chat` + fab asisten | tab **Asisten** (`chat_screen`)                 | `/chat/sid`, `/chat`, `/chat/poll`, `/chat/stop`, `/chat/sessions`, `/chat/messages`, `/chat/suggestions` |
| `/watch`            | tab **Pantau** (`watch_screen`, termasuk alert)   | `/watch/data`, `/watch/alerts`, `/watch/alerts/read`, `/market/watch`  |
| `/top`, `/top/[i]/[a]` | `rank_screen` (dari Riset/Akun)                | `/rank/pairs`, `/rank`                                                 |
| `/settings`         | tab **Akun** (`settings_screen`)                  | `/org`, `/org/settings`, `/org/sender`, `/org/invite`, `/org/remove-member`, `/billing/plans`, `/billing/invoices`, `/billing/checkout`, `/org/webhook/test`, `/auth/change-password`, `/auth/delete-account`, `/auth/resend-verify`, `/auth/claim-guest` |
| `/p/[token]`, `/audit/[token]` | dibuka di browser (tautan publik)      | -                                                                      |

## 4. Struktur kode mobile

```
lib/
  main.dart            titik masuk; API_URL lewat --dart-define
  app.dart             ApiScope (InheritedNotifier), toast, guard error
  theme.dart           token tema + widget dasar (Panel, Label, Badge2)
  biz.dart             logika domain (port biz.ts; dites paritas)
  models.dart          model JSON sesuai openapi.yaml (laporan, prospek, pantau,
                       kampanye, chat, billing, rank, org)
  chat.dart            helper murni asisten (parsing langkah 🔧, pesan error) — port lib/chat/steps.ts
  api/client.dart      satu klien HTTP: cookie sesi, pemetaan error, semua endpoint
  widgets/
    logo.dart          logo Raqio
    biz_avatar.dart    logo bisnis: /logo/{key} → favicon → inisial berwarna (port BizAvatar)
  screens/             satu file per layar (lihat peta di atas)
```

Pola state: tanpa paket state-management; `StatefulWidget` + `ApiScope.of(context)` cukup karena
tiap layar memuat datanya sendiri dan server adalah sumber kebenaran. `ApiClient` adalah
`ChangeNotifier` hanya untuk status login dan profil terakhir (`lastMe`).

## 5. Aliran yang perlu dipahami

- **Riset**: POST `/market/run` → kalau `cached` buka laporan langsung (tawarkan riset ulang `fresh`);
  kalau dapat `job`, poll `/log` tiap 2 detik, baca tahap `[n/5]`, selesai → `REPORT_PG_ID=` → buka laporan.
  Antrean terlihat lewat `/jobs` (label industri · wilayah).
- **Bandingkan**: POST `/market/compare/run {industry, areas[]}` → job yang sama; log memuat
  `[compare] wilayah i/n` untuk progres dan `COMPARE_DONE` sebagai penanda selesai → GET `/market/compare`.
- **Asisten**: sid dari POST `/chat/sid` (disimpan per org); POST `/chat {sid,message,context}` → `job`;
  poll `/chat/poll?job=` (backoff 1,2s→15s) membaca `steps[]` (baris `🔧 tool(args)`) sampai `done`,
  jawaban di `answer`. 409 = masih menjawab, 402 = kuota habis, 503 = dimatikan, pesan OPENROUTER/API key =
  belum dikonfigurasi. Riwayat: `/chat/sessions`, `/chat/messages?sid=`.
- **Kampanye**: buat lewat wizard (pilih prospek → saluran & mode → template + pratinjau debounce
  `/campaigns/preview`). Mode satu klik: GET `/campaigns/{id}/next` → buka wa.me / profil IG / mailto →
  POST `mark {recipient_id,status}`. Mode otomatis: worker yang mengirim; app cukup memuat ulang.
- **Cek kontak**: POST `/market/detail {report_id,key}` menjalankan scrape singkat (±15–90 detik) dan
  hasilnya digabung ke `Place.raw` (field `_detailed`).
- **Mode tamu**: POST `/auth/guest` membuat org sementara; bilah kuning menawarkan "Simpan akun"
  (POST `/auth/claim-guest`) — data riset tetap, paket jadi gratis.

## 6. Menjaga paritas ke depan

1. Ubah kontrak API? Perbarui `apps/api/openapi.yaml` → sesuaikan `lib/models.dart` dan `client.dart`.
2. Ubah logika skor/draf di `apps/web/lib/biz.ts`? Port ke `lib/biz.dart` dan samakan angka di
   `test/biz_test.dart` (nilai uji disalin dari tes web).
3. Ubah token warna di `globals.css`? Samakan `RaqioColors`.
4. Fitur web baru? Tambah barisnya di peta bagian 3 dokumen ini, lalu putuskan idiom mobile-nya
   (bukan selalu salinan 1:1 — lihat tabel bagian 2).

Verifikasi: `flutter analyze --fatal-infos` dan `flutter test` di `apps/mobile`.
