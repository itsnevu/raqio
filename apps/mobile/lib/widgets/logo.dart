import 'package:flutter/material.dart';

import '../theme.dart';

/// Logo asli Raqio, sama dengan aset web dan ikon aplikasi.
class RaqioMark extends StatelessWidget {
  const RaqioMark({super.key, this.size = 32});
  final double size;

  @override
  Widget build(BuildContext context) => Image.asset(
        'assets/branding/raqio-logo.png',
        width: size,
        height: size,
        fit: BoxFit.contain,
        excludeFromSemantics: true,
      );
}

/// Tanda + kata "raqio", seperti brand di bilah atas web.
class RaqioLogo extends StatelessWidget {
  const RaqioLogo({super.key, this.markSize = 32, this.fontSize = 25});
  final double markSize;
  final double fontSize;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          RaqioMark(size: markSize),
          SizedBox(width: markSize * 0.45),
          Text('raqio',
              style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w500, letterSpacing: -fontSize * 0.04, color: RaqioColors.text, height: 1)),
        ],
      );
}
