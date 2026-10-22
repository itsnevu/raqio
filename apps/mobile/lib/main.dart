import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/client.dart';
import 'app.dart';

/// Alamat API Go. Ganti saat build: `flutter run --dart-define=API_URL=https://raqio.example.com`.
/// Default 10.0.2.2 = localhost dari emulator Android. iOS simulator: http://localhost:8080.
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:8080');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final api = ApiClient(baseUrl: apiUrl, store: PrefsStore(prefs));
  await api.init();
  runApp(RaqioApp(api: api));
}
