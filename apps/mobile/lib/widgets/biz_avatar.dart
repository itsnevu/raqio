// Logo bisnis supaya nama langsung dikenali, port components/BizAvatar.tsx:
// logo unduhan worker (/logo/{key}) -> favicon website (layanan favicon Google) -> inisial berwarna tetap per nama.
import 'package:flutter/material.dart';

import '../api/client.dart';
import '../biz.dart' show host;

const _palette = [Color(0xFFFFB020), Color(0xFF19D29C), Color(0xFF5B8DEF), Color(0xFFEF6B5F), Color(0xFFB388FF), Color(0xFFF28C28)];

String initialsOf(String name) {
  final words = name.replaceAll(RegExp(r'[^\p{L}\p{N} ]', unicode: true), ' ').split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
  final a = words.isNotEmpty ? words[0][0] : '?';
  final b = words.length > 1 ? words[1][0] : '';
  return (a + b).toUpperCase();
}

Color colorOf(String name) {
  var h = 0;
  for (final c in name.codeUnits) {
    h = (h * 31 + c) & 0xFFFFFFFF;
  }
  return _palette[h % _palette.length];
}

class BizAvatar extends StatefulWidget {
  const BizAvatar({super.key, required this.api, required this.name, this.website = '', this.logoKey = '', this.size = 34});
  final ApiClient api;
  final String name;
  final String website;
  final String logoKey;
  final double size;

  @override
  State<BizAvatar> createState() => _BizAvatarState();
}

class _BizAvatarState extends State<BizAvatar> {
  bool _broken = false;

  @override
  Widget build(BuildContext context) {
    final domain = widget.website.isNotEmpty ? host(widget.website) : '';
    final src = !_broken && widget.logoKey.isNotEmpty
        ? widget.api.logoUrl(widget.logoKey)
        : !_broken && domain.isNotEmpty
            ? 'https://www.google.com/s2/favicons?domain=${Uri.encodeQueryComponent(domain)}&sz=128'
            : '';
    if (src.isEmpty) {
      return Container(
        width: widget.size,
        height: widget.size,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: colorOf(widget.name), borderRadius: BorderRadius.circular(6)),
        child: Text(
          initialsOf(widget.name),
          style: TextStyle(color: const Color(0xFF0B0B0B), fontWeight: FontWeight.w800, fontSize: (widget.size * 0.42).clamp(9, 40).toDouble()),
        ),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: Image.network(
        src,
        width: widget.size,
        height: widget.size,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) {
          // gambar gagal: tandai rusak supaya build berikutnya memakai inisial
          if (!_broken) WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? setState(() => _broken = true) : null);
          return SizedBox(width: widget.size, height: widget.size);
        },
      ),
    );
  }
}
