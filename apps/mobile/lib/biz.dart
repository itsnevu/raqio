// Logika bisnis yang sama dengan web (apps/web/lib/biz.ts dan market/page.tsx), supaya angka dan
// kesimpulan di HP identik dengan di browser.
import 'models.dart';

const defaultOffer = 'meningkatkan penjualan lewat kehadiran online';

/// Buang karakter area pribadi Unicode dan titik tengah di akhir (sisa scraping).
String clean(Object? s) =>
    (s?.toString() ?? '').replaceAll(RegExp('[-]'), '').replaceAll(RegExp(r'\s*·\s*$'), '').trim();

/// 1.500.000 -> "1,5 jt", 12.000 -> "12 rb", 999 -> "999".
String fmtNum(num? n) {
  if (n == null) return '-';
  if (n >= 1e6) return '${(n / 1e6).toStringAsFixed(1).replaceAll('.', ',')} jt';
  if (n >= 1e4) return '${(n / 1e3).round()} rb';
  final s = n.round().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write('.');
    buf.write(s[i]);
  }
  return buf.toString();
}

/// Desimal gaya Indonesia: 4.7 -> "4,7".
String dec(Object? x) => x == null ? '-' : x.toString().replaceAll('.', ',');

String fmtDate(String iso, {bool withTime = false}) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  final base = '${d.day} ${months[d.month - 1]} ${d.year}';
  if (!withTime) return base;
  return '$base, ${d.hour.toString().padLeft(2, '0')}.${d.minute.toString().padLeft(2, '0')}';
}

String _digits(String phone) => phone.replaceAll(RegExp(r'\D'), '');

/// Tautan WhatsApp hanya untuk nomor HP Indonesia (62 8xx), bukan telepon kantor.
String waOf(Place p) {
  var d = _digits(p.phone);
  if (d.startsWith('0')) d = '62${d.substring(1)}';
  return d.startsWith('628') && d.length >= 10 && d.length <= 15 ? 'https://wa.me/$d' : '';
}

String fmtPhone(Place p) {
  var d = _digits(p.phone);
  if (d.isEmpty) return '';
  if (d.startsWith('62')) d = '0${d.substring(2)}';
  final m = RegExp(r'^(\d{4})(\d{4})(\d+)$').firstMatch(d);
  return m == null ? d : '${m.group(1)}-${m.group(2)}-${m.group(3)}';
}

String host(String url) {
  final u = Uri.tryParse(url);
  if (u == null || u.host.isEmpty) return url;
  return u.host.replaceFirst(RegExp(r'^www\.'), '');
}

String short(String name) => clean(name).split(RegExp(r'\s[-|@·,(]\s?')).first.trim();

/// null = belum dicek detail, jadi jangan disimpulkan tidak punya website.
List<String>? gapsOf(Place p) {
  if (!p.detailed) return null;
  final g = <String>[];
  if (p.website.isEmpty) g.add('tanpa website');
  if (p.instagram.isEmpty || p.instagramShared) g.add('IG tidak ditemukan');
  if (p.reviews < 100) g.add('review sedikit');
  if (p.rating != null && p.rating! < 4.3) g.add('rating ${p.rating}');
  return g;
}

bool isGem(Place p) => (p.rating ?? 0) >= 4.7 && p.reviews >= 15 && p.reviews < 300;
bool isWeak(Place p) => p.rating != null && p.rating! < 4.3 && p.reviews >= 150;

bool isProspect(Place p, {bool rival = false}) {
  if (rival) return false;
  final g = gapsOf(p);
  return g != null && g.isNotEmpty && p.reviews <= 800 && (waOf(p).isNotEmpty || p.instagram.isNotEmpty);
}

String draft(Place p, {required String industry, required String area, String? offer}) {
  final r = p.leadReasons;
  final g = gapsOf(p) ?? const [];
  final praise = (p.rating ?? 0) >= 4.5
      ? 'rating ${dec(p.rating)} dari ${p.reviews} ulasan di Google Maps, keren banget!'
      : 'sudah ${p.reviews} ulasan di Google Maps.';
  final String why;
  if (g.contains('tanpa website') || r.contains('tanpa website')) {
    why = 'Saya lihat belum ada website atau katalog online, padahal banyak calon pelanggan cek dulu di Google sebelum datang.';
  } else if (g.contains('IG tidak ditemukan') || r.contains('IG tidak ditemukan')) {
    why = 'Saya belum menemukan Instagram resminya, padahal banyak pelanggan cari referensi di sana.';
  } else if (g.contains('review sedikit') || p.reviews < 100) {
    why = 'Ulasannya masih bisa ditambah supaya lebih sering muncul di pencarian.';
  } else {
    why = 'Masih ada ruang untuk tampil lebih menonjol dibanding pesaing sekitar.';
  }
  final o = (offer == null || offer.isEmpty) ? defaultOffer : offer;
  return 'Halo kak, salam kenal. Saya lihat ${short(p.name)} punya $praise $why '
      'Kebetulan saya bantu bisnis $industry di sekitar $area untuk $o. Boleh saya kirim contoh singkatnya? Terima kasih 🙏';
}

final selfWords = RegExp(
    r'agency|agensi|marketing|digital|web ?dev|website|branding|design|desain|seo|advertis|iklan|konsultan|freelance|software|studio kreatif|creative',
    caseSensitive: false);

class Reason {
  const Reason(this.big, this.unit, this.text, this.meta);
  final String big;
  final String unit;
  final String text;
  final String meta;
}

class Verdict {
  const Verdict({required this.headline, required this.why, required this.next, required this.nextDetail, required this.reasons});
  final String headline;
  final String why;
  final String next;
  final String nextDetail;
  final List<Reason> reasons;
}

/// Kesimpulan bahasa awam, port dari market/page.tsx (verdict dan verdictRival).
Verdict verdict(Report r, {bool rival = false}) {
  final s = r.summary;
  final d = r.digital;
  final n = s.businesses;
  final all = r.all;
  final cap = s.capped ? '+' : '';
  final noWeb = d.sampled > 0 ? 100 - d.website : null;
  final noIg = d.sampled > 0 ? 100 - d.instagram : null;

  if (rival) {
    final leaders = r.leaders.take(3).toList();
    final top = leaders.isEmpty ? null : leaders.first;
    final weak = all.where(isWeak).toList();
    final crowd = s.top3Share >= 50
        ? 'dikuasai ${top != null ? top.name : "beberapa nama besar"}'
        : s.top3Share >= 30
            ? 'punya beberapa pesaing kuat, tapi belum ada yang menguasai'
            : 'tidak punya pemimpin jelas, semua pesaing masih kecil';
    final String edge;
    if (weak.isNotEmpty) {
      edge = '${weak.length} pesaing ramai tapi ratingnya rendah (mis. ${weak.first.name}). Pelanggan mereka tidak puas, itu yang paling gampang direbut.';
    } else if (noIg != null && noIg >= 30) {
      edge = '$noIg% pesaing tidak aktif di Instagram. Kalau kamu rajin posting, kamu langsung lebih terlihat.';
    } else if (noWeb != null && noWeb >= 30) {
      edge = '$noWeb% pesaing tidak punya website. Website yang rapi sudah jadi pembeda.';
    } else if ((s.avgRating ?? 0) >= 4.5) {
      edge = 'Semua pesaing ratingnya tinggi (rata-rata ${dec(s.avgRating)}). Sulit menang lewat rating, harus lewat spesialisasi atau harga.';
    } else {
      edge = 'Rating rata-rata pesaing ${dec(s.avgRating)}. Layanan yang lebih baik saja sudah cukup untuk menonjol.';
    }
    return Verdict(
      headline: 'Kamu punya $n$cap pesaing ${r.industry} di ${r.area}. Pasar ini $crowd.',
      why: edge,
      next: top != null ? 'Pelajari ${leaders.map((l) => l.name).join(", ")}.' : 'Belum ada pesaing yang menonjol.',
      nextDetail: top != null
          ? 'Buka Maps dan Instagram mereka, catat harga, paket, dan apa yang dipuji pelanggan di ulasan. Lalu tentukan satu hal yang kamu bisa lebih baik.'
          : 'Ini kesempatan jadi yang pertama rapi di wilayah ini.',
      reasons: [
        Reason('$n$cap', 'pesaing', s.top3Share >= 50 ? '${s.top3Share}% ulasan dipegang 3 teratas, mereka yang harus dikejar' : '3 teratas cuma pegang ${s.top3Share}% ulasan, posisi teratas masih terbuka', 'seberapa ramai'),
        Reason(s.avgRating != null ? dec(s.avgRating) : '-', 'rating pesaing', (s.avgRating ?? 0) >= 4.5 ? 'standar tinggi, kamu harus minimal 4,5 untuk dilirik' : 'standar biasa saja, layanan bagus langsung menonjol', 'standar kualitas'),
        Reason('${weak.length}', 'pesaing rapuh', weak.isNotEmpty ? 'ramai tapi rating rendah, pelanggannya bisa direbut' : 'tidak ada yang rapuh, menang lewat pembeda', 'celah yang bisa diambil'),
      ],
    );
  }

  final nPros = all.where((p) => isProspect(p)).length;
  final weak = all.where(isWeak).length;
  final small = r.sizeBuckets.where((b) => b.$1 == '<50').map((b) => b.$2).firstOrNull ?? 0;
  final pctSmall = n > 0 ? (small / n * 100).round() : 0;
  final top = r.leaders.isEmpty ? null : r.leaders.first;
  final crowd = s.top3Share >= 50
      ? 'dikuasai ${top != null ? short(top.name) : "satu dua nama besar"}'
      : s.top3Share >= 30
          ? 'ramai, ada beberapa nama besar tapi tidak ada yang menguasai'
          : 'ramai dan merata, belum ada yang dominan';
  String? gap;
  final String gapWhy;
  final String offerHint;
  if (noWeb != null && noWeb >= 30) {
    gap = 'website';
    gapWhy = '$noWeb% belum punya website';
    offerHint = 'bikin website atau katalog online';
  } else if (noIg != null && noIg >= 30) {
    gap = 'Instagram';
    gapWhy = '$noIg% belum terlihat aktif di Instagram';
    offerHint = 'kelola dan rapikan Instagram';
  } else if (pctSmall >= 40) {
    gap = 'ulasan';
    gapWhy = '$pctSmall% masih punya kurang dari 50 ulasan';
    offerHint = 'bantu dapat ulasan dan tampil di Google';
  } else if (weak > 0) {
    gap = 'layanan';
    gapWhy = '$weak bisnis ramai tapi ratingnya rendah';
    offerHint = 'perbaiki layanan dan reputasi';
  } else {
    gap = null;
    gapWhy = 'hampir semua sudah rapi secara digital';
    offerHint = 'tawarkan sesuatu yang benar-benar beda';
  }
  final sat = noWeb != null && noWeb < 15
      ? 'Hampir semua sudah punya website (${d.website}%), jadi jualan "bikin website" akan sulit laku di sini.'
      : '';
  final why = gap != null
      ? 'Celah paling besar ada di $gap: $gapWhy. $sat'.trim()
      : '${gapWhy[0].toUpperCase()}${gapWhy.substring(1)}. $sat'.trim();
  return Verdict(
    headline: 'Pasar ${r.industry} di ${r.area} $crowd.',
    why: why,
    next: nPros > 0 ? 'Hubungi $nPros bisnis yang punya celah itu.' : 'Belum ada bisnis yang cocok dihubungi.',
    nextDetail: nPros > 0
        ? 'Tawarkan jasa $offerHint. Mulai dari yang ratingnya tinggi tapi ${gap ?? "digitalnya"} masih kosong, mereka paling gampang diyakinkan.'
        : 'Coba cek detail lebih banyak bisnis (tombol Cek kontak), atau cari wilayah lain.',
    reasons: [
      Reason('$n$cap', 'bisnis', s.top3Share >= 50 ? 'tapi ${s.top3Share}% ulasan dipegang 3 teratas saja' : s.top3Share >= 30 ? '3 teratas memegang ${s.top3Share}% ulasan, sisanya kecil-kecil' : 'ulasan tersebar, 3 teratas cuma ${s.top3Share}%', 'seberapa ramai pasarnya'),
      Reason(s.avgRating != null ? dec(s.avgRating) : '-', 'rating rata-rata', (s.avgRating ?? 0) >= 4.5 ? 'pelanggan di sini terbiasa puas, rating di bawah 4,5 terlihat kalah' : 'masih banyak yang bisa dikalahkan lewat layanan lebih baik', 'standar kualitas'),
      Reason('$nPros', 'bisa dihubungi', gap != null ? 'punya celah $gap dan ada nomor WhatsApp atau IG' : 'punya celah dan ada kontaknya', 'peluang untukmu'),
    ],
  );
}
