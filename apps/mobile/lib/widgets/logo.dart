import 'package:flutter/material.dart';

import '../theme.dart';

/// Tanda "R" Raqio, sama dengan logo.svg di web (viewBox 32x32, goresan 4, kaki amber).
class RaqioMark extends StatelessWidget {
  const RaqioMark({super.key, this.size = 22, this.color = RaqioColors.text});
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => CustomPaint(size: Size.square(size), painter: _MarkPainter(color));
}

class _MarkPainter extends CustomPainter {
  _MarkPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 32;
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4 * s;
    final path = Path()
      ..moveTo(5 * s, 29 * s)
      ..lineTo(5 * s, 3 * s)
      ..lineTo(18 * s, 3 * s)
      ..arcToPoint(Offset(18 * s, 19 * s), radius: Radius.circular(8 * s))
      ..lineTo(11 * s, 19 * s);
    canvas.drawPath(path, stroke);
    canvas.drawLine(Offset(17 * s, 19 * s), Offset(27 * s, 29 * s), Paint()
      ..color = RaqioColors.good
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4 * s);
  }

  @override
  bool shouldRepaint(covariant _MarkPainter old) => old.color != color;
}

/// Tanda + kata "raqio", seperti brand di bilah atas web.
class RaqioLogo extends StatelessWidget {
  const RaqioLogo({super.key, this.markSize = 22, this.fontSize = 25});
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
