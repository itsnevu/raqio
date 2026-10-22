// Paritas dengan apps/web/lib/biz.test.ts: angka dan kesimpulan di HP harus sama dengan di web.
import 'package:flutter_test/flutter_test.dart';
import 'package:raqio_mobile/biz.dart';
import 'package:raqio_mobile/models.dart';

Place biz([Map<String, dynamic> o = const {}]) => Place.fromJson({'name': 'Kopi Enak - Kemang', ...o});

void main() {
  group('waOf', () {
    test('nomor HP 08 jadi wa.me 628', () => expect(waOf(biz({'phone': '0812-3456-7890'})), 'https://wa.me/6281234567890'));
    test('nomor 62 langsung dipakai', () => expect(waOf(biz({'phone': '+62 812 3456 7890'})), 'https://wa.me/6281234567890'));
    test('telepon kantor 021 bukan WhatsApp', () => expect(waOf(biz({'phone': '021-5551234'})), ''));
    test('kosong kalau tidak ada telepon', () => expect(waOf(biz()), ''));
  });

  test('fmtPhone format 4-4-sisa dan 62 jadi 0', () => expect(fmtPhone(biz({'phone': '6281234567890'})), '0812-3456-7890'));

  group('gapsOf', () {
    test('null kalau belum dicek detail', () => expect(gapsOf(biz()), isNull));
    test('mendeteksi celah', () {
      expect(gapsOf(biz({'_detailed': true, 'reviews': 20, 'rating': 4.0})), ['tanpa website', 'IG tidak ditemukan', 'review sedikit', 'rating 4.0']);
    });
    test('akun IG bersama dianggap tidak ditemukan', () {
      expect(gapsOf(biz({'_detailed': true, 'website': 'https://x.id', 'instagram': 'brand', 'instagram_shared': true, 'reviews': 500, 'rating': 4.8})),
          ['IG tidak ditemukan']);
    });
  });

  group('klasifikasi', () {
    test('hidden gem', () => expect(isGem(biz({'rating': 4.8, 'reviews': 100})), isTrue));
    test('bukan gem kalau ulasan terlalu banyak', () => expect(isGem(biz({'rating': 4.8, 'reviews': 300})), isFalse));
    test('rapuh: ramai tapi rating rendah', () => expect(isWeak(biz({'rating': 4.1, 'reviews': 200})), isTrue));
    test('prospek butuh celah, ulasan <= 800, dan kontak', () {
      expect(isProspect(biz({'_detailed': true, 'reviews': 50, 'phone': '0812345678'})), isTrue);
      expect(isProspect(biz({'_detailed': true, 'reviews': 50})), isFalse);
      expect(isProspect(biz({'_detailed': true, 'reviews': 900, 'phone': '0812345678'})), isFalse);
    });
    test('mode pesaing tidak pernah prospek', () => expect(isProspect(biz({'_detailed': true, 'reviews': 50, 'phone': '0812345678'}), rival: true), isFalse));
  });

  group('teks', () {
    test('clean buang karakter PUA dan titik tengah', () => expect(clean('Kopi Enak ·'), 'Kopi Enak'));
    test('fmtNum gaya Indonesia', () {
      expect(fmtNum(999), '999');
      expect(fmtNum(1234), '1.234');
      expect(fmtNum(12000), '12 rb');
      expect(fmtNum(1500000), '1,5 jt');
      expect(fmtNum(null), '-');
    });
    test('draft menyebut nama pendek, pujian rating, dan celah', () {
      final d = draft(biz({'_detailed': true, 'rating': 4.7, 'reviews': 80, 'phone': '0812345678'}), industry: 'coffee shop', area: 'Kemang');
      expect(d, contains('Kopi Enak punya rating 4,7 dari 80 ulasan'));
      expect(d, contains('belum ada website'));
      expect(d, contains('coffee shop di sekitar Kemang'));
      expect(d, contains(defaultOffer));
    });
  });

  group('verdict', () {
    final report = Report.fromJson({
      'id': 1,
      'industry': 'kopi',
      'area': 'kemang',
      'created': '2026-01-01T00:00:00Z',
      'summary': {'businesses': 40, 'top3_share': 35, 'avg_rating': 4.6},
      'digital': {'sampled': 20, 'website': 30, 'instagram': 80, 'whatsapp': 70, 'phone': 90},
      'insights': ['a'],
      'rating_buckets': [],
      'size_buckets': [
        ['<50', 10],
        ['50-200', 20]
      ],
      'leaders': [
        {'name': 'Besar Coffee', 'rating': 4.8, 'reviews': 900}
      ],
      'all': [
        {'place_id': 'a', 'name': 'A', 'rating': 4.8, 'reviews': 60, '_detailed': true, 'phone': '0812345678'},
        {'place_id': 'b', 'name': 'B', 'rating': 4.1, 'reviews': 300},
      ],
    });
    test('mode klien: celah website dan jumlah prospek', () {
      final v = verdict(report);
      expect(v.headline, 'Pasar kopi di kemang ramai, ada beberapa nama besar tapi tidak ada yang menguasai.');
      expect(v.why, contains('Celah paling besar ada di website: 70% belum punya website'));
      expect(v.next, 'Hubungi 1 bisnis yang punya celah itu.');
      expect(v.reasons.map((r) => r.unit), ['bisnis', 'rating rata-rata', 'bisa dihubungi']);
      expect(v.reasons.last.big, '1');
    });
    test('mode pesaing: pesaing rapuh disebut', () {
      final v = verdict(report, rival: true);
      expect(v.headline, startsWith('Kamu punya 40 pesaing kopi di kemang.'));
      expect(v.why, contains('1 pesaing ramai tapi ratingnya rendah (mis. B)'));
      expect(v.next, 'Pelajari Besar Coffee.');
    });
  });
}
