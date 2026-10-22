import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/logo.dart';

/// Layar pembuka: logo di atas hitam, dengan garis progres tipis. Tampil saat sesi tersimpan dimuat,
/// menyambung dari splash native (Android: drawable/launch_background, iOS: LaunchScreen hitam).
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: RaqioColors.bg,
      body: Column(
        children: [
          const Expanded(child: Center(child: RaqioLogo(markSize: 56, fontSize: 64))),
          Padding(
            padding: const EdgeInsets.fromLTRB(60, 0, 60, 48),
            child: Column(
              children: [
                const SizedBox(
                  width: 120,
                  child: LinearProgressIndicator(backgroundColor: RaqioColors.sunk, color: RaqioColors.text, minHeight: 2),
                ),
                const SizedBox(height: 16),
                Text('PETA PASAR INDUSTRI APA PUN', style: Theme.of(context).textTheme.labelSmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
