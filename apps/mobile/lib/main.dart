import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/client.dart';
import 'app.dart';
import 'theme.dart';

/// Alamat API Go. Ganti saat build: `flutter run --dart-define=API_URL=https://raqio.example.com`.
/// Default 10.0.2.2 = localhost dari emulator Android. iOS simulator: http://localhost:8080.
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:8080');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: RaqioColors.bg,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: RaqioColors.bg,
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  // Splash berlogo tampil dulu; sesi tersimpan dibaca di belakangnya.
  final api = ApiClient(baseUrl: apiUrl, store: _LazyPrefsStore());
  runApp(RaqioApp(api: api, ready: api.init()));
}

/// SharedPreferences dibuka saat pertama dibutuhkan, supaya runApp tidak menunggu.
class _LazyPrefsStore implements TokenStore {
  final Future<SharedPreferences> _prefs = SharedPreferences.getInstance();
  @override
  Future<String?> read() async => (await _prefs).getString(cookieName);
  @override
  Future<void> write(String? value) async {
    final p = await _prefs;
    if (value == null) {
      await p.remove(cookieName);
    } else {
      await p.setString(cookieName, value);
    }
  }
}
