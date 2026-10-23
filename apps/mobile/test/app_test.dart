// Alur masuk dan beranda dengan server palsu: cookie dari Set-Cookie dipakai di request berikutnya,
// sama seperti browser di web.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:raqio_mobile/api/client.dart';
import 'package:raqio_mobile/app.dart';
import 'package:raqio_mobile/screens/settings_screen.dart';

class FakeServer {
  final List<http.Request> seen = [];
  int logins = 0;
  int guests = 0;
  bool claimed = false;
  bool get _guestSession => seen.isNotEmpty && (seen.last.headers['Cookie'] ?? '').contains('guest1') && !claimed;

  http.Response _json(Object body, {int status = 200, Map<String, String>? headers}) =>
      http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json', ...?headers});

  Future<http.Response> handle(http.Request r) async {
    seen.add(r);
    final cookie = r.headers['Cookie'] ?? '';
    final authed = cookie.contains('raqio_session=tok123') || cookie.contains('raqio_session=guest1');
    switch ('${r.method} ${r.url.path}') {
      case 'POST /auth/login':
        logins++;
        final b = jsonDecode(r.body) as Map;
        if (b['password'] != 'rahasia123') return _json({'error': 'Email atau password salah.'}, status: 401);
        return _json({'ok': true}, headers: {'set-cookie': 'raqio_session=tok123; Path=/; HttpOnly; Max-Age=604800'});
      case 'POST /auth/guest':
        guests++;
        return _json({'ok': true, 'guest': true, 'expires_in_hours': 24}, headers: {'set-cookie': 'raqio_session=guest1; Path=/; HttpOnly'});
      case 'POST /auth/claim-guest':
        final b = jsonDecode(r.body) as Map;
        if (b['email'] == 'ada@test.id') return _json({'ok': true, 'existing': true});
        claimed = true;
        return _json({'ok': true, 'org': 'Tim Baru'});
      case 'POST /auth/logout':
        return _json({'ok': true}, headers: {'set-cookie': 'raqio_session=; Path=/; Max-Age=0'});
      case 'GET /market/reports':
        if (!authed) return _json({'error': 'Belum login.'}, status: 401);
        return _json([
          {'id': 1, 'industry': 'coffee shop', 'area': 'kemang jakarta', 'created': '2026-10-21T11:52:06Z'}
        ]);
      case 'GET /org/settings':
        return _json({'offer': '', 'goals': {}});
      case 'GET /log':
        return _json({'running': false, 'log': '', 'started': null, 'stopped': false});
      case 'GET /prospects/data':
        return _json({'items': [], 'statuses': []});
      case 'GET /watch/data':
        return _json([]);
      case 'GET /auth/me':
        if (_guestSession) return _json({'email': 'tamu@raqio.local', 'role': 'owner', 'plan': 'guest', 'verified': true, 'guest': true, 'limits': {'runs': 1, 'details': 5, 'watches': 0, 'members': 1}});
        return _json({'email': 'a@test.id', 'role': 'owner', 'plan': 'free', 'verified': true, 'guest': false, 'limits': {'runs': 5, 'details': 30, 'watches': 1, 'members': 1}});
      case 'GET /org':
        return _json({'name': 'Agensi A', 'plan': 'free', 'members': [{'email': 'a@test.id', 'role': 'owner'}], 'usage': {'market_run': 1}, 'limits': {'runs': 5, 'details': 30, 'watches': 1, 'members': 1}});
    }
    return _json({'error': 'tidak ada: ${r.url.path}'}, status: 404);
  }
}

void main() {
  late FakeServer server;
  late ApiClient api;

  setUp(() {
    server = FakeServer();
    api = ApiClient(baseUrl: 'http://api.test', store: MemoryStore(), client: MockClient(server.handle));
  });

  testWidgets('password salah menampilkan pesan dari server', (tester) async {
    await tester.pumpWidget(RaqioApp(api: api));
    expect(find.text('COBA TANPA DAFTAR'), findsOneWidget);
    await tester.enterText(find.byType(TextField).at(0), 'a@test.id');
    await tester.enterText(find.byType(TextField).at(1), 'salah');
    await tester.ensureVisible(find.text('MASUK'));
    await tester.tap(find.text('MASUK'));
    await tester.pumpAndSettle();
    expect(find.text('Email atau password salah.'), findsOneWidget);
    expect(api.loggedIn, isFalse);
  });

  testWidgets('login benar menyimpan cookie dan membuka beranda dengan laporan', (tester) async {
    await tester.pumpWidget(RaqioApp(api: api));
    await tester.enterText(find.byType(TextField).at(0), 'a@test.id');
    await tester.enterText(find.byType(TextField).at(1), 'rahasia123');
    await tester.ensureVisible(find.text('MASUK'));
    await tester.tap(find.text('MASUK'));
    await tester.pumpAndSettle();
    expect(api.loggedIn, isTrue);
    expect(find.text('Peta pasar industri apa pun.'), findsOneWidget);
    // daftar riset ada di bawah form; gulir dulu sampai terlihat
    await tester.scrollUntilVisible(find.text('coffee shop · kemang jakarta'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('coffee shop · kemang jakarta'), findsOneWidget);
    final reportsReq = server.seen.firstWhere((r) => r.url.path == '/market/reports');
    expect(reportsReq.headers['Cookie'], 'raqio_session=tok123');
  });

  testWidgets('sesi tersimpan langsung masuk beranda, keluar kembali ke login', (tester) async {
    await MemoryStore().write('x'); // bukan store milik api; hanya memastikan API-nya ada
    final store = MemoryStore()..write('tok123');
    api = ApiClient(baseUrl: 'http://api.test', store: store, client: MockClient(server.handle));
    await api.init();
    await tester.pumpWidget(RaqioApp(api: api));
    await tester.pumpAndSettle();
    expect(find.text('Peta pasar industri apa pun.'), findsOneWidget);
    expect(server.logins, 0);
    await tester.tap(find.text('AKUN'));
    await tester.pumpAndSettle();
    expect(find.text('Agensi A'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('KELUAR'), 200, scrollable: find.descendant(of: find.byType(SettingsScreen), matching: find.byType(Scrollable)).first);
    await tester.tap(find.text('KELUAR'));
    await tester.pumpAndSettle();
    expect(api.loggedIn, isFalse);
    expect(await store.read(), isNull);
    expect(find.text('COBA TANPA DAFTAR'), findsOneWidget);
  });

  test('401 di endpoint data menghapus sesi lokal', () async {
    final store = MemoryStore()..write('basi');
    api = ApiClient(baseUrl: 'http://api.test', store: store, client: MockClient(server.handle));
    await api.init();
    expect(api.loggedIn, isTrue);
    await expectLater(api.reports(), throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)));
    expect(api.loggedIn, isFalse);
    expect(await store.read(), isNull);
  });

  testWidgets('coba tanpa daftar: masuk sebagai tamu, lalu simpan akun dari Akun', (tester) async {
    await tester.pumpWidget(RaqioApp(api: api));
    expect(find.text('COBA TANPA DAFTAR'), findsOneWidget);
    await tester.tap(find.byKey(const Key('guest')));
    await tester.pumpAndSettle();
    expect(server.guests, 1);
    expect(api.loggedIn, isTrue);
    expect(find.text('Peta pasar industri apa pun.'), findsOneWidget);
    expect(find.textContaining('Mode tamu'), findsOneWidget, reason: 'bilah tamu tampil di beranda');
    await tester.tap(find.text('SIMPAN AKUN').first);
    await tester.pumpAndSettle();
    expect(find.text('Mode tamu'), findsOneWidget);
    final fields = find.descendant(of: find.byType(SettingsScreen), matching: find.byType(TextField));
    await tester.enterText(fields.at(0), 'Budi');
    await tester.enterText(fields.at(1), 'budi@test.id');
    await tester.enterText(fields.at(2), 'rahasia123');
    await tester.tap(find.widgetWithText(FilledButton, 'SIMPAN AKUN'));
    await tester.pumpAndSettle();
    expect(server.claimed, isTrue);
    expect(api.lastMe?.guest, isFalse);
    expect(find.textContaining('Mode tamu'), findsNothing, reason: 'bilah tamu hilang setelah akun tersimpan');
  });
}
