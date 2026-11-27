import 'package:flutter/material.dart';

/// Tema gelap Raqio, token yang sama dengan situs (apps/site) dan Competitor Scraping:
/// tinta #0A0A0F, permukaan #111119/#181822, garis #242430, aksen ungu, sudut 6px (kontrol) dan 12px (kartu).
class RaqioColors {
  static const bg = Color(0xFF0A0A0F);
  static const panel = Color(0xFF111119);
  static const sunk = Color(0xFF181822);
  static const line = Color(0xFF242430);
  static const text = Color(0xFFF5F5F7);
  static const muted = Color(0xFF9A9AA8);
  static const faint = Color(0xFF7D7D89); // 80% --fg-muted di atas tinta, tetap >= 4.5:1
  static const good = Color(0xFFA78BFA); // dulu amber; dipakai sebagai aksen, sekarang --highlight
  static const bad = Color(0xFFFF5A4E);
  static const warn = Color(0xFFFF6B4A);
  static const accent = Color(0xFF6C4CF1); // --accent-primary, tombol utama dan fokus
  static const card = Color(0xFFDCEBD5); // pastel hijau, hanya untuk kartu
}

const _control = BorderRadius.all(Radius.circular(6));
const _cardRadius = BorderRadius.all(Radius.circular(12));

ThemeData raqioTheme() {
  const scheme = ColorScheme.dark(
    surface: RaqioColors.panel,
    onSurface: RaqioColors.text,
    primary: RaqioColors.text,
    onPrimary: RaqioColors.bg,
    secondary: RaqioColors.good,
    onSecondary: RaqioColors.bg,
    error: RaqioColors.bad,
    outline: RaqioColors.line,
    surfaceContainerHighest: RaqioColors.sunk,
  );
  const sharp = RoundedRectangleBorder(borderRadius: _control);
  return ThemeData(
    useMaterial3: true,
    fontFamily: 'Figtree',
    colorScheme: scheme,
    scaffoldBackgroundColor: RaqioColors.bg,
    dividerColor: RaqioColors.line,
    appBarTheme: const AppBarTheme(
      backgroundColor: RaqioColors.bg,
      foregroundColor: RaqioColors.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      shape: Border(bottom: BorderSide(color: RaqioColors.line)),
      titleTextStyle: TextStyle(fontFamily: 'Figtree', color: RaqioColors.text, fontSize: 18, fontWeight: FontWeight.w400, letterSpacing: -0.3),
    ),
    cardTheme: const CardThemeData(
      color: RaqioColors.panel,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(side: BorderSide(color: RaqioColors.line), borderRadius: _cardRadius),
    ),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: RaqioColors.panel,
      contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      border: OutlineInputBorder(borderSide: BorderSide(color: RaqioColors.line), borderRadius: _control),
      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: RaqioColors.line), borderRadius: _control),
      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: RaqioColors.accent, width: 1.5), borderRadius: _control),
      labelStyle: TextStyle(color: RaqioColors.muted, fontSize: 13),
      hintStyle: TextStyle(color: RaqioColors.faint),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: RaqioColors.text,
        foregroundColor: RaqioColors.bg,
        shape: sharp,
        textStyle: const TextStyle(fontFamily: 'Figtree', fontWeight: FontWeight.w700, letterSpacing: 0.6, fontSize: 12),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: RaqioColors.text,
        side: const BorderSide(color: RaqioColors.line),
        shape: sharp,
        textStyle: const TextStyle(fontFamily: 'Figtree', fontWeight: FontWeight.w700, letterSpacing: 0.6, fontSize: 12),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: RaqioColors.muted, shape: sharp, textStyle: const TextStyle(fontFamily: 'Figtree', fontSize: 14)),
    ),
    chipTheme: const ChipThemeData(
      backgroundColor: Colors.transparent,
      selectedColor: RaqioColors.text,
      side: BorderSide(color: RaqioColors.line),
      shape: RoundedRectangleBorder(borderRadius: _control),
      labelStyle: TextStyle(fontFamily: 'Figtree', fontSize: 12, color: RaqioColors.muted),
      secondaryLabelStyle: TextStyle(fontFamily: 'Figtree', fontSize: 12, color: RaqioColors.bg),
      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: RaqioColors.bg,
      indicatorColor: RaqioColors.sunk,
      indicatorShape: sharp,
      labelTextStyle: const WidgetStatePropertyAll(TextStyle(fontFamily: 'Figtree', fontSize: 11, letterSpacing: 0.6, color: RaqioColors.muted)),
      iconTheme: const WidgetStatePropertyAll(IconThemeData(color: RaqioColors.text)),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        shape: const WidgetStatePropertyAll(RoundedRectangleBorder(borderRadius: _control)),
        side: const WidgetStatePropertyAll(BorderSide(color: RaqioColors.line)),
        textStyle: const WidgetStatePropertyAll(TextStyle(fontFamily: 'Figtree', fontSize: 13)),
        backgroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? RaqioColors.text : Colors.transparent),
        foregroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? RaqioColors.bg : RaqioColors.muted),
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(backgroundColor: RaqioColors.panel, shape: sharp),
    snackBarTheme: const SnackBarThemeData(backgroundColor: RaqioColors.text, contentTextStyle: TextStyle(fontFamily: 'Figtree', color: RaqioColors.bg), shape: sharp),
    dividerTheme: const DividerThemeData(color: RaqioColors.line, space: 1, thickness: 1),
    textTheme: const TextTheme(
      headlineMedium: TextStyle(fontSize: 30, fontWeight: FontWeight.w400, letterSpacing: -0.8, height: 1.1, color: RaqioColors.text),
      titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.w400, letterSpacing: -0.4, color: RaqioColors.text),
      titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: RaqioColors.text),
      bodyMedium: TextStyle(fontSize: 15, color: RaqioColors.text, height: 1.43),
      bodySmall: TextStyle(fontSize: 12, color: RaqioColors.muted, height: 1.4),
      labelSmall: TextStyle(fontSize: 11, color: RaqioColors.muted, letterSpacing: 0.8),
    ),
  );
}

/// Label kapital berspasi seperti di web.
class Label extends StatelessWidget {
  const Label(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) =>
      Text(text.toUpperCase(), style: Theme.of(context).textTheme.labelSmall);
}

/// Kotak bergaris tipis, pengganti Card dengan padding standar.
class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.color});
  final Widget child;
  final EdgeInsets padding;
  final Color? color;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: padding,
        decoration: BoxDecoration(color: color ?? RaqioColors.panel, border: Border.all(color: RaqioColors.line), borderRadius: _cardRadius),
        child: child,
      );
}

class Badge2 extends StatelessWidget {
  const Badge2(this.text, {super.key, this.color = RaqioColors.muted});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(border: Border.all(color: color), borderRadius: const BorderRadius.all(Radius.circular(4))),
        child: Text(text, style: TextStyle(fontSize: 10.5, color: color)),
      );
}
