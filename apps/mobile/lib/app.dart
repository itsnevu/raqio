import 'package:flutter/material.dart';

import 'api/client.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'theme.dart';

/// Akses ApiClient dari mana saja: `ApiScope.of(context)`.
class ApiScope extends InheritedNotifier<ApiClient> {
  const ApiScope({super.key, required ApiClient api, required super.child}) : super(notifier: api);

  /// Aman dipanggil dari initState: instance klien tidak pernah berganti, jadi tidak perlu dependency.
  static ApiClient of(BuildContext context) {
    final scope = context.getInheritedWidgetOfExactType<ApiScope>();
    assert(scope != null, 'ApiScope tidak ditemukan di atas widget ini');
    return scope!.notifier!;
  }
}

class RaqioApp extends StatelessWidget {
  const RaqioApp({super.key, required this.api});
  final ApiClient api;

  @override
  Widget build(BuildContext context) {
    return ApiScope(
      api: api,
      child: MaterialApp(
        title: 'Raqio',
        theme: raqioTheme(),
        debugShowCheckedModeBanner: false,
        home: ListenableBuilder(
          listenable: api,
          builder: (context, _) => api.loggedIn ? const HomeShell() : const LoginScreen(),
        ),
      ),
    );
  }
}

/// Tampilkan pesan singkat di bawah layar.
void toast(BuildContext context, String msg) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(msg), duration: const Duration(seconds: 3)));
}

/// Jalankan aksi tanpa hasil; true kalau sukses, false kalau gagal (pesannya ditampilkan sebagai toast).
Future<bool> guardOk(BuildContext context, Future<void> Function() fn) async {
  try {
    await fn();
    return true;
  } on ApiException catch (e) {
    if (context.mounted) toast(context, e.message);
    return false;
  }
}

/// Jalankan aksi API; kalau gagal, tampilkan pesannya sebagai toast dan kembalikan null.
Future<T?> guard<T>(BuildContext context, Future<T> Function() fn) async {
  try {
    return await fn();
  } on ApiException catch (e) {
    if (context.mounted) toast(context, e.message);
    return null;
  }
}
