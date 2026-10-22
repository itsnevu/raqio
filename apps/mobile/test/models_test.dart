import 'package:flutter_test/flutter_test.dart';
import 'package:raqio_mobile/models.dart';

void main() {
  test('Place: key fallback, lead, merge hasil cek kontak', () {
    final p = Place.fromJson({'maps_url': 'https://maps/x', 'name': 'Toko A ·', 'reviews': 12, 'rating': 4.5});
    expect(p.key, 'https://maps/x');
    expect(p.name, 'Toko A');
    expect(p.lead, isNull);
    expect(p.detailed, isFalse);
    p.merge({'phone': '0812', 'website': 'https://a.id', '_detailed': true, 'lead': {'status': 'dihubungi', 'note': 'n'}});
    expect(p.detailed, isTrue);
    expect(p.website, 'https://a.id');
    expect(p.lead!.status, 'dihubungi');
    expect(p.lead!.note, 'n');
    expect(Place.fromJson({'key': 'k', 'place_id': 'p', 'name': 'x'}).key, 'k');
    expect(Place.fromJson({'place_id': 'p', 'maps_url': 'm', 'name': 'x'}).key, 'p');
  });

  test('Report: bucket dan daftar bisnis', () {
    final r = Report.fromJson({
      'id': 7,
      'industry': 'kopi',
      'area': 'kemang',
      'created': '2026-01-01T00:00:00Z',
      'summary': {'businesses': 2, 'top3_share': 50, 'capped': true},
      'digital': {'sampled': 1, 'website': 100, 'instagram': 0, 'whatsapp': 0, 'phone': 100},
      'insights': ['x', 'y'],
      'ai_strategy': null,
      'rating_buckets': [
        ['4.5+', 1],
        ['<4', 1]
      ],
      'size_buckets': [],
      'all': [
        {'place_id': 'a', 'name': 'A'},
        'bukan map',
      ],
    });
    expect(r.id, 7);
    expect(r.summary.capped, isTrue);
    expect(r.ratingBuckets, [('4.5+', 1), ('<4', 1)]);
    expect(r.all.length, 1);
    expect(r.aiStrategy, isNull);
    expect(r.insights, ['x', 'y']);
  });

  test('JobLog: tahap, id laporan, baris terakhir', () {
    final j = JobLog.fromJson({
      'running': false,
      'stopped': false,
      'started': 1,
      'status': 'done',
      'log': '\$ market.py\n18:00 [1/5] cari\n18:01 [4/5] susun\nREPORT_ID=3\nREPORT_PG_ID=42\n\n[selesai, exit code 0]\n',
    });
    expect(j.step, 4);
    expect(j.reportId, 42);
    expect(j.lastLine, 'REPORT_PG_ID=42');
    expect(JobLog.fromJson({'running': true, 'log': ''}).step, 0);
    expect(JobLog.fromJson({'running': true, 'log': 'REPORT_ID=3'}).reportId, isNull); // id SQLite bukan id laporan
  });

  test('WatchItem: perubahan dan total', () {
    final w = WatchItem.fromJson({
      'industry': 'kopi',
      'area': 'kemang',
      'report_id': 1,
      'created': '2026-02-01T00:00:00Z',
      'prev_created': '2026-01-01T00:00:00Z',
      'businesses': 10,
      'watch': {'every_days': 7, 'last_run': null},
      'changes': {
        'new': [
          {'name': 'Baru', 'reviews': 3}
        ],
        'gone': [],
        'rating_up': [],
        'rating_down': [
          {'name': 'Turun', 'delta': -0.2}
        ],
        'reviews_jump': [],
      },
    });
    expect(w.watch!.everyDays, 7);
    expect(w.totalChanges, 2);
    expect(w.changes!['rating_down']!.first.raw['delta'], -0.2);
    expect(WatchItem.fromJson({'industry': 'a', 'area': 'b', 'watch': null, 'changes': null}).totalChanges, 0);
  });

  test('Org dan Me', () {
    final o = Org.fromJson({
      'name': 'Tim',
      'plan': 'pro',
      'members': [
        {'email': 'a@x.id', 'role': 'owner'}
      ],
      'usage': {'market_run': 3},
      'limits': {'runs': 60, 'details': 600, 'watches': 15, 'members': 3},
    });
    expect(o.members, ['a@x.id']);
    expect(o.usage['market_run'], 3);
    expect(o.limits.runs, 60);
    final me = Me.fromJson({'email': 'a@x.id', 'role': 'owner', 'plan': 'free', 'verified': true, 'limits': {}});
    expect(me.verified, isTrue);
    expect(me.limits.runs, 0);
  });
}
