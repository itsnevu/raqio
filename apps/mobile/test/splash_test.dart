import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:raqio_mobile/api/client.dart';
import 'package:raqio_mobile/app.dart';
import 'package:raqio_mobile/screens/splash_screen.dart';
import 'package:raqio_mobile/widgets/logo.dart';

void main() {
  testWidgets('splash berlogo tampil sampai sesi dibaca, minimal durasi tertentu', (tester) async {
    final store = MemoryStore()..write('tok');
    final api = ApiClient(baseUrl: 'http://api.test', store: store);
    await tester.pumpWidget(RaqioApp(api: api, ready: api.init(), splashMinimum: const Duration(seconds: 2)));
    await tester.pump();
    expect(find.byType(SplashScreen), findsOneWidget);
    expect(find.byType(RaqioMark), findsOneWidget);
    expect(find.text('raqio'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(SplashScreen), findsOneWidget, reason: 'belum lewat durasi minimum');
    await tester.pump(const Duration(seconds: 2));
    await tester.pump();
    expect(find.byType(SplashScreen), findsNothing);
    expect(find.byType(Scaffold), findsWidgets);
  });
}
