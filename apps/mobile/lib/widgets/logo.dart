import 'package:flutter/material.dart';

import '../theme.dart';

/// Tanda Raqio: empat lingkaran berbentuk wajik, tiga terhubung leher metaball, satu berdiri sendiri.
/// Geometri sama dengan apps/site/components/ui/Logo.tsx (viewBox 5 8 69 68). Digambar sebagai vektor
/// supaya tajam di semua ukuran dan bisa diwarnai (terang di tema gelap, tinta di permukaan terang).
class RaqioMark extends StatelessWidget {
  const RaqioMark({super.key, this.size = 32, this.color = RaqioColors.text});
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: CustomPaint(size: Size(size * 69 / 68, size), painter: _MarkPainter(color)),
      );
}

class _MarkPainter extends CustomPainter {
  const _MarkPainter(this.color);
  final Color color;

  static const _nodes = [Offset(17, 42), Offset(40, 20), Offset(62, 42), Offset(40, 64)];

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.height / 68);
    canvas.translate(-5, -8);
    final paint = Paint()
      ..color = color
      ..isAntiAlias = true;
    for (final c in _nodes) {
      canvas.drawCircle(c, 11, paint);
    }
    final necks = Path()
      ..moveTo(41.81, 30.85)
      ..quadraticBezierTo(50.01, 31.99, 51.15, 40.19)
      ..lineTo(60.19, 31.15)
      ..quadraticBezierTo(51.99, 30.01, 50.85, 21.81)
      ..close()
      ..moveTo(50.85, 62.19)
      ..quadraticBezierTo(51.99, 53.99, 60.19, 52.85)
      ..lineTo(51.15, 43.81)
      ..quadraticBezierTo(50.01, 52.01, 41.81, 53.15)
      ..close();
    canvas.drawPath(necks, paint);
  }

  @override
  bool shouldRepaint(_MarkPainter oldDelegate) => oldDelegate.color != color;
}

/// Tanda + kata "Raqio", sama dengan logo di situs dan aplikasi web.
class RaqioLogo extends StatelessWidget {
  const RaqioLogo({super.key, this.markSize = 28, this.fontSize = 22, this.color = RaqioColors.text});
  final double markSize;
  final double fontSize;
  final Color color;

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Raqio',
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            RaqioMark(size: markSize, color: color),
            SizedBox(width: markSize * 0.3),
            ExcludeSemantics(
              child: Text('Raqio',
                  style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w500, letterSpacing: -fontSize * 0.02, color: color, height: 1)),
            ),
          ],
        ),
      );
}
