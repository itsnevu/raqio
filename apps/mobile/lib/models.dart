// Model data dari API Go. Bentuk JSON sama dengan yang dipakai web (lihat apps/api/openapi.yaml).
import 'biz.dart' show clean;

double? _d(Object? v) => v is num ? v.toDouble() : null;
int? _i(Object? v) => v is num ? v.toInt() : null;
String _s(Object? v) => v?.toString() ?? '';
List<String> _strs(Object? v) => v is List ? v.map((e) => e.toString()).toList() : const [];

class Lead {
  Lead({required this.status, this.note = '', this.remind = '', this.updated = ''});

  factory Lead.fromJson(Map<String, dynamic> j) =>
      Lead(status: _s(j['status']), note: _s(j['note']), remind: _s(j['remind']), updated: _s(j['updated']));

  final String status;
  final String note;
  final String remind;
  final String updated;
}

const leadStatuses = ['baru', 'dihubungi', 'tertarik', 'deal', 'tolak'];
const leadLabel = {
  'baru': 'Baru',
  'dihubungi': 'Dihubungi',
  'tertarik': 'Tertarik',
  'deal': 'Deal',
  'tolak': 'Tidak jadi',
};

/// Satu bisnis di laporan. Menyimpan map mentah supaya field baru dari worker tidak hilang,
/// dan supaya hasil "Cek kontak" bisa digabung dengan `merge`.
class Place {
  Place.fromJson(Map<String, dynamic> j) : raw = Map<String, dynamic>.from(j);

  final Map<String, dynamic> raw;

  String get key => _s(raw['key']).isNotEmpty ? _s(raw['key']) : (_s(raw['place_id']).isNotEmpty ? _s(raw['place_id']) : _s(raw['maps_url']));
  String get name => clean(raw['name']);
  String get category => clean(raw['category']);
  String get address => clean(raw['address']);
  String get mapsUrl => _s(raw['maps_url']);
  double? get rating => _d(raw['rating']);
  int get reviews => _i(raw['reviews']) ?? 0;
  double? get reviewsPerMonth => _d(raw['reviews_per_month']);
  String get phone => _s(raw['phone']);
  String get website => _s(raw['website']);
  String get instagram => _s(raw['instagram']);
  bool get instagramShared => raw['instagram_shared'] == true;
  List<String> get emails => _strs(raw['emails']);
  double? get distKm => _d(raw['dist_km']);
  int get branches => _i(raw['branches_in_area']) ?? 0;
  int? get leadScore => _i(raw['lead_score']);
  List<String> get leadReasons => _strs(raw['lead_reasons']);
  bool get detailed => raw['_detailed'] == true;
  Lead? get lead => raw['lead'] is Map ? Lead.fromJson(Map<String, dynamic>.from(raw['lead'] as Map)) : null;

  // field tambahan di papan prospek
  String get industry => _s(raw['industry']);
  String get area => _s(raw['area']);
  int? get reportId => _i(raw['report_id']);

  void merge(Map<String, dynamic> j) => raw.addAll(j);
}

class ReportRow {
  ReportRow({required this.id, required this.industry, required this.area, required this.created});

  factory ReportRow.fromJson(Map<String, dynamic> j) =>
      ReportRow(id: _i(j['id']) ?? 0, industry: _s(j['industry']), area: _s(j['area']), created: _s(j['created']));

  final int id;
  final String industry;
  final String area;
  final String created;
}

class Summary {
  Summary.fromJson(Map<String, dynamic> j)
      : businesses = _i(j['businesses']) ?? 0,
        capped = j['capped'] == true,
        avgRating = _d(j['avg_rating']),
        medianReviews = _i(j['median_reviews']) ?? 0,
        totalReviews = _i(j['total_reviews']) ?? 0,
        top3Share = _i(j['top3_share']) ?? 0;

  final int businesses;
  final bool capped;
  final double? avgRating;
  final int medianReviews;
  final int totalReviews;
  final int top3Share;
}

class Digital {
  Digital.fromJson(Map<String, dynamic> j)
      : sampled = _i(j['sampled']) ?? 0,
        website = _i(j['website']) ?? 0,
        instagram = _i(j['instagram']) ?? 0,
        whatsapp = _i(j['whatsapp']) ?? 0,
        phone = _i(j['phone']) ?? 0;

  final int sampled;
  final int website;
  final int instagram;
  final int whatsapp;
  final int phone;
}

List<(String, int)> _buckets(Object? v) => v is List
    ? v.whereType<List>().where((b) => b.length >= 2).map((b) => (b[0].toString(), _i(b[1]) ?? 0)).toList()
    : const [];

List<Place> _places(Object? v) =>
    v is List ? v.whereType<Map>().map((e) => Place.fromJson(Map<String, dynamic>.from(e))).toList() : const [];

class Report {
  Report.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']) ?? 0,
        industry = _s(j['industry']),
        area = _s(j['area']),
        created = _s(j['created']),
        summary = Summary.fromJson(Map<String, dynamic>.from(j['summary'] as Map? ?? const {})),
        digital = Digital.fromJson(Map<String, dynamic>.from(j['digital'] as Map? ?? const {})),
        all = _places(j['all']),
        leaders = _places(j['leaders']),
        insights = _strs(j['insights']),
        aiStrategy = j['ai_strategy'] is List ? _strs(j['ai_strategy']) : null,
        ratingBuckets = _buckets(j['rating_buckets']),
        sizeBuckets = _buckets(j['size_buckets']);

  final int id;
  final String industry;
  final String area;
  final String created;
  final Summary summary;
  final Digital digital;
  final List<Place> all;
  final List<Place> leaders;
  final List<String> insights;
  final List<String>? aiStrategy;
  final List<(String, int)> ratingBuckets;
  final List<(String, int)> sizeBuckets;
}

class JobLog {
  JobLog.fromJson(Map<String, dynamic> j)
      : running = j['running'] == true,
        log = _s(j['log']),
        stopped = j['stopped'] == true,
        started = _i(j['started']),
        status = _s(j['status']);

  final bool running;
  final String log;
  final bool stopped;
  final int? started;
  final String status;

  /// Tahap 1..5 dari baris "[n/5]" terakhir di log; 0 kalau belum mulai.
  int get step {
    final m = RegExp(r'\[(\d)/5\]').allMatches(log).lastOrNull;
    return m == null ? 0 : int.parse(m.group(1)!);
  }

  int? get reportId {
    final m = RegExp(r'REPORT_PG_ID=(\d+)').allMatches(log).lastOrNull;
    return m == null ? null : int.parse(m.group(1)!);
  }

  String get lastLine {
    final lines = log.trim().split('\n').where((l) => l.trim().isNotEmpty && !l.startsWith('[selesai')).toList();
    return lines.isEmpty ? '' : lines.last;
  }
}

class WatchInfo {
  WatchInfo.fromJson(Map<String, dynamic> j)
      : everyDays = _i(j['every_days']) ?? 7,
        lastRun = j['last_run']?.toString();
  final int everyDays;
  final String? lastRun;
}

class WatchItem {
  WatchItem.fromJson(Map<String, dynamic> j)
      : industry = _s(j['industry']),
        area = _s(j['area']),
        reportId = _i(j['report_id']) ?? 0,
        created = _s(j['created']),
        prevCreated = j['prev_created']?.toString(),
        businesses = _i(j['businesses']) ?? 0,
        watch = j['watch'] is Map ? WatchInfo.fromJson(Map<String, dynamic>.from(j['watch'] as Map)) : null,
        changes = j['changes'] is Map
            ? (j['changes'] as Map).map((k, v) => MapEntry(k.toString(), _places(v)))
            : null;

  final String industry;
  final String area;
  final int reportId;
  final String created;
  final String? prevCreated;
  final int businesses;
  final WatchInfo? watch;
  final Map<String, List<Place>>? changes;

  int get totalChanges => changes?.values.fold<int>(0, (a, b) => a + b.length) ?? 0;
}

class Limits {
  Limits.fromJson(Map<String, dynamic> j)
      : runs = _i(j['runs']) ?? 0,
        details = _i(j['details']) ?? 0,
        watches = _i(j['watches']) ?? 0,
        members = _i(j['members']) ?? 0;
  final int runs;
  final int details;
  final int watches;
  final int members;
}

class Me {
  Me.fromJson(Map<String, dynamic> j)
      : email = _s(j['email']),
        role = _s(j['role']),
        plan = _s(j['plan']),
        verified = j['verified'] == true,
        limits = Limits.fromJson(Map<String, dynamic>.from(j['limits'] as Map? ?? const {}));
  final String email;
  final String role;
  final String plan;
  final bool verified;
  final Limits limits;
}

class Org {
  Org.fromJson(Map<String, dynamic> j)
      : name = _s(j['name']),
        plan = _s(j['plan']),
        members = (j['members'] as List? ?? const []).map((m) => _s((m as Map)['email'])).toList(),
        usage = (j['usage'] as Map? ?? const {}).map((k, v) => MapEntry(k.toString(), _i(v) ?? 0)),
        limits = Limits.fromJson(Map<String, dynamic>.from(j['limits'] as Map? ?? const {}));
  final String name;
  final String plan;
  final List<String> members;
  final Map<String, int> usage;
  final Limits limits;
}

class Settings {
  Settings.fromJson(Map<String, dynamic> j)
      : offer = _s(j['offer']),
        goals = (j['goals'] as Map? ?? const {}).map((k, v) => MapEntry(k.toString(), v.toString()));
  final String offer;
  final Map<String, String> goals;
}
