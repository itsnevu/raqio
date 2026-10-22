# Raqio Mobile

App Android dan iOS untuk Raqio. Memakai **API, akun, org, kuota, dan data yang sama dengan web**: tidak ada backend
terpisah. App login ke `/auth/login`, menyimpan cookie sesi `raqio_session`, dan mengirimnya di setiap request.

```powershell
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:8080     # emulator Android ke API di laptop
flutter run --dart-define=API_URL=http://localhost:8080    # iOS simulator
flutter run --dart-define=API_URL=https://raqio.example.com   # produksi
```

- `lib/api/client.dart`: klien HTTP, cookie sesi, pemetaan error API.
- `lib/models.dart`: model data sesuai `apps/api/openapi.yaml`.
- `lib/biz.dart`: logika skor, celah, draf WhatsApp, dan kesimpulan laporan. Port langsung dari `apps/web/lib/biz.ts`
  dan `market/page.tsx`; `test/biz_test.dart` menjaga paritasnya dengan tes web.
- `lib/screens/`: Masuk, Daftar, Riset, Laporan, panel detail bisnis, Prospek, Pantau, Akun.

Verifikasi: `flutter analyze --fatal-infos` dan `flutter test`. Build debug Android mengizinkan HTTP polos
(`android/app/src/debug/AndroidManifest.xml`); build release hanya HTTPS.
