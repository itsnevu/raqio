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
  String get logoKey => _s(raw['logo_key']);
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

  /// Penanda selesai mode Bandingkan di log worker.
  bool get compareDone => log.contains('COMPARE_DONE');

  /// Progres mode Bandingkan: wilayah ke-i dari n yang sedang dikerjakan ("[compare] wilayah i/n: area").
  ({int i, int n, String area})? get compareProgress {
    final m = RegExp(r'\[compare\] wilayah (\d+)/(\d+): ([^\n]*)').allMatches(log).lastOrNull;
    if (m == null) return null;
    return (i: int.parse(m.group(1)!), n: int.parse(m.group(2)!), area: m.group(3)!.trim());
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
        members = _i(j['members']) ?? 0,
        chats = _i(j['chats']);
  final int runs;
  final int details;
  final int watches;
  final int members;

  /// Kuota jawaban asisten per bulan; null kalau server belum mengirimnya.
  final int? chats;
}

class Me {
  Me.fromJson(Map<String, dynamic> j)
      : email = _s(j['email']),
        role = _s(j['role']),
        plan = _s(j['plan']),
        verified = j['verified'] == true,
        guest = j['guest'] == true,
        limits = Limits.fromJson(Map<String, dynamic>.from(j['limits'] as Map? ?? const {}));
  final String email;
  final String role;
  final String plan;
  final bool verified;

  /// Org tamu: coba tanpa daftar, kuota kecil, hasil instan, dihapus otomatis setelah beberapa jam.
  final bool guest;
  final Limits limits;
}

class Member {
  Member.fromJson(Map<String, dynamic> j)
      : email = _s(j['email']),
        role = _s(j['role']);
  final String email;
  final String role;
}

class Org {
  Org.fromJson(Map<String, dynamic> j)
      : name = _s(j['name']),
        plan = _s(j['plan']),
        members = (j['members'] as List? ?? const [])
            .whereType<Map>()
            .map((m) => Member.fromJson(Map<String, dynamic>.from(m)))
            .toList(),
        usage = (j['usage'] as Map? ?? const {}).map((k, v) => MapEntry(k.toString(), _i(v) ?? 0)),
        limits = Limits.fromJson(Map<String, dynamic>.from(j['limits'] as Map? ?? const {}));
  final String name;
  final String plan;
  final List<Member> members;
  final Map<String, int> usage;
  final Limits limits;
}

/// GET /org/settings: jasa yang ditawarkan, tujuan per riset, dan saluran notifikasi pantauan.
class Settings {
  Settings.fromJson(Map<String, dynamic> j)
      : offer = _s(j['offer']),
        goals = (j['goals'] as Map? ?? const {}).map((k, v) => MapEntry(k.toString(), v.toString())),
        notifyEmail = _s(j['notify_email']),
        telegramChat = _s(j['telegram_chat']),
        webhookUrl = _s(j['webhook_url']),
        webhookSecretMasked = _s(j['webhook_secret_masked']),
        telegramBot = j['telegram_bot'] == true;
  final String offer;
  final Map<String, String> goals;
  final String notifyEmail;
  final String telegramChat;
  final String webhookUrl;
  final String webhookSecretMasked;
  final bool telegramBot;
}

/// POST /market/run: hasil instan (cached) atau id job yang harus dipantau.
class RunResult {
  RunResult.fromJson(Map<String, dynamic> j)
      : job = _i(j['job']),
        cached = j['cached'] == true,
        reportId = _i(j['report_id']),
        ageHours = _i(j['age_hours']) ?? 0;
  final int? job;
  final bool cached;
  final int? reportId;
  final int ageHours;
}

/// GET /jobs: antrean riset org (queued/running), untuk daftar tunggu di layar Riset.
class JobRow {
  JobRow.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']) ?? 0,
        kind = _s(j['kind']),
        status = _s(j['status']),
        label = (() {
          final p = j['params'] is Map ? Map<String, dynamic>.from(j['params'] as Map) : const <String, dynamic>{};
          final area = _s(p['area']).isNotEmpty ? _s(p['area']) : _strs(p['areas']).join('; ');
          return [_s(p['industry']), area].where((s) => s.isNotEmpty).join(' · ');
        })();
  final int id;
  final String kind;
  final String status;
  final String label;

  bool get activeRun => (kind == 'market_run' || kind == 'market_compare') && (status == 'queued' || status == 'running');
}

/// Saran pasangan industri+wilayah yang hasilnya instan (GET /market/suggest).
class Suggestion {
  Suggestion.fromJson(Map<String, dynamic> j)
      : industry = _s(j['industry']),
        area = _s(j['area']);
  final String industry;
  final String area;
}

/// GET /stats (publik): total data terkumpul, dipakai strip angka di layar Riset.
class PublicStats {
  PublicStats.fromJson(Map<String, dynamic> j)
      : businesses = _i(j['businesses']) ?? 0,
        reports = _i(j['reports']) ?? 0,
        pairs = _i(j['pairs']) ?? 0,
        runs = _i(j['runs']) ?? 0,
        details = _i(j['details']) ?? 0,
        chats = _i(j['chats']) ?? 0,
        logos = _i(j['logos']) ?? 0;
  final int businesses;
  final int reports;
  final int pairs;
  final int runs;
  final int details;
  final int chats;
  final int logos;
}

/// Satu wilayah di hasil Bandingkan (GET /market/compare).
class CompareArea {
  CompareArea.fromJson(Map<String, dynamic> j)
      : area = _s(j['area']),
        reportId = _i(j['report_id']) ?? 0,
        opportunity = _i(j['opportunity']) ?? 0,
        businesses = _i(j['businesses']) ?? 0,
        capped = j['capped'] == true,
        avgRating = _d(j['avg_rating']),
        reviewsPerBusiness = _d(j['reviews_per_business']) ?? 0,
        top3Share = _i(j['top3_share']) ?? 0,
        gems = _i(j['gems']) ?? 0,
        weak = _i(j['weak']) ?? 0,
        websitePct = _i(j['website_pct']) ?? 0,
        whatsappPct = _i(j['whatsapp_pct']) ?? 0,
        prospects = _i(j['prospects']) ?? 0;
  final String area;
  final int reportId;
  final int opportunity;
  final int businesses;
  final bool capped;
  final double? avgRating;
  final double reviewsPerBusiness;
  final int top3Share;
  final int gems;
  final int weak;
  final int websitePct;
  final int whatsappPct;
  final int prospects;
}

class Compare {
  Compare.fromJson(Map<String, dynamic> j)
      : industry = _s(j['industry']),
        areas = (j['areas'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => CompareArea.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        insights = _strs(j['insights']);
  final String industry;
  final List<CompareArea> areas;
  final List<String> insights;
}

/// Alert pantauan (GET /watch/alerts).
class WatchAlert {
  WatchAlert.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']) ?? 0,
        reportId = _i(j['report_id']) ?? 0,
        industry = _s(j['industry']),
        area = _s(j['area']),
        severity = _i(j['severity']) ?? 0,
        summary = _s(j['summary']),
        createdAt = _s(j['created_at']),
        readAt = j['read_at']?.toString();
  final int id;
  final int reportId;
  final String industry;
  final String area;
  final int severity;
  final String summary;
  final String createdAt;
  final String? readAt;
  bool get unread => readAt == null || readAt!.isEmpty;
}

// ---------- kampanye ----------

const campaignChannels = ['whatsapp', 'instagram', 'email'];
const channelLabel = {'whatsapp': 'WhatsApp', 'instagram': 'Instagram', 'email': 'Email'};
const campaignStatusLabel = {'draft': 'Draf', 'running': 'Berjalan', 'paused': 'Dijeda', 'done': 'Selesai'};
const recipientStatusLabel = {
  'pending': 'Menunggu',
  'sent': 'Terkirim',
  'skipped': 'Dilewati',
  'failed': 'Gagal',
  'replied': 'Dibalas',
  'unsubscribed': 'Minta berhenti',
};
const campaignVars = ['{nama}', '{wilayah}', '{industri}', '{celah}', '{rating}', '{ulasan}', '{jasa}', '{pengirim}', '{audit}'];

/// Mode otomatis hanya untuk WhatsApp (gateway) dan email; Instagram selalu satu klik.
bool canAuto(String channel) => channel != 'instagram';

class Campaign {
  Campaign.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']) ?? 0,
        name = _s(j['name']),
        channel = _s(j['channel']),
        mode = _s(j['mode']),
        subject = _s(j['subject']),
        template = _s(j['template']),
        throttleSec = _i(j['throttle_sec']) ?? 0,
        status = _s(j['status']),
        jobId = _i(j['job_id']),
        createdAt = _s(j['created_at']),
        counts = (j['counts'] as Map? ?? const {}).map((k, v) => MapEntry(k.toString(), _i(v) ?? 0));
  final int id;
  final String name;
  final String channel;
  final String mode;
  final String subject;
  final String template;
  final int throttleSec;
  final String status;
  final int? jobId;
  final String createdAt;
  final Map<String, int> counts;

  int get total => counts.values.fold(0, (a, b) => a + b);
  int get progressPct {
    final t = total;
    if (t == 0) return 0;
    final done = (counts['sent'] ?? 0) + (counts['replied'] ?? 0) + (counts['skipped'] ?? 0) + (counts['failed'] ?? 0) + (counts['unsubscribed'] ?? 0);
    return (done / t * 100).round();
  }
}

class Recipient {
  Recipient.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']) ?? 0,
        name = _s(j['name']),
        toAddr = _s(j['to_addr']),
        rendered = _s(j['rendered']),
        status = _s(j['status']),
        error = _s(j['error']),
        sentAt = j['sent_at']?.toString(),
        auditUrl = _s(j['audit_url']),
        link = _s(j['link']),
        subject = _s(j['subject']);
  final int id;
  final String name;
  final String toAddr;
  final String rendered;
  final String status;
  final String error;
  final String? sentAt;
  final String auditUrl;
  final String link;
  final String subject;
}

/// Template bawaan per saluran (GET /campaigns).
class CampaignTemplate {
  CampaignTemplate.fromJson(Map<String, dynamic> j)
      : subject = _s(j['Subject']),
        body = _s(j['Body']);
  final String subject;
  final String body;
}

/// Pratinjau wizard kampanye (POST /campaigns/preview).
class CampaignPreview {
  CampaignPreview.fromJson(Map<String, dynamic> j)
      : rendered = _s(j['rendered']),
        subject = _s(j['subject']),
        matched = _i(j['matched']) ?? 0,
        reachable = _i(j['reachable']) ?? 0,
        sampleName = j['sample'] is Map ? _s((j['sample'] as Map)['name']) : '';
  final String rendered;
  final String subject;
  final int matched;
  final int reachable;
  final String sampleName;
}

/// Penerima berikutnya mode satu klik (GET /campaigns/{id}/next).
class NextRecipient {
  NextRecipient.fromJson(Map<String, dynamic> j)
      : done = j['done'] == true,
        left = _i(j['left']) ?? 0,
        recipient = j['recipient'] is Map ? Recipient.fromJson(Map<String, dynamic>.from(j['recipient'] as Map)) : null;
  final bool done;
  final int left;
  final Recipient? recipient;
}

// ---------- billing ----------

class Plan {
  Plan.fromJson(Map<String, dynamic> j)
      : name = _s(j['name']),
        price = _i(j['price']) ?? 0,
        runs = _i(j['runs']) ?? 0,
        details = _i(j['details']) ?? 0,
        watches = _i(j['watches']) ?? 0,
        members = _i(j['members']) ?? 0;
  final String name;
  final int price;
  final int runs;
  final int details;
  final int watches;
  final int members;
}

class Invoice {
  Invoice.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']) ?? 0,
        plan = _s(j['plan']),
        amount = _i(j['amount']) ?? 0,
        status = _s(j['status']),
        url = _s(j['url']);
  final int id;
  final String plan;
  final int amount;
  final String status;
  final String url;
}

/// GET /org/sender: identitas pengirim kampanye dan gateway WhatsApp.
class Sender {
  Sender.fromJson(Map<String, dynamic> j)
      : senderName = _s(j['sender_name']),
        senderPhone = _s(j['sender_phone']),
        replyTo = _s(j['reply_to']),
        waProvider = _s(j['wa_provider']),
        waGatewayUrl = _s(j['wa_gateway_url']),
        waGatewayTokenMasked = _s(j['wa_gateway_token_masked']);
  final String senderName;
  final String senderPhone;
  final String replyTo;
  final String waProvider;
  final String waGatewayUrl;
  final String waGatewayTokenMasked;
}

// ---------- asisten ----------

class ChatSession {
  ChatSession.fromJson(Map<String, dynamic> j)
      : id = _s(j['id']),
        title = _s(j['title']),
        lastMessageAt = j['last_message_at']?.toString(),
        createdAt = _s(j['created_at']);
  final String id;
  final String title;
  final String? lastMessageAt;
  final String createdAt;
}

/// Satu baris riwayat (GET /chat/messages). `activeJob` = job sesi yang masih berjalan.
class ChatHistory {
  ChatHistory.fromJson(Map<String, dynamic> j)
      : messages = (j['messages'] as List? ?? const [])
            .whereType<Map>()
            .map((m) => (role: _s(m['role']), content: _s(m['content']), jobId: _i(m['job_id'])))
            .toList(),
        activeJob = _i(j['active_job']);
  final List<({String role, String content, int? jobId})> messages;
  final int? activeJob;
}

/// GET /chat/poll?job=
class ChatPoll {
  ChatPoll.fromJson(Map<String, dynamic> j)
      : done = j['done'] == true,
        steps = _strs(j['steps']),
        answer = _s(j['answer']),
        error = _s(j['error']);
  final bool done;
  final List<String> steps;
  final String answer;
  final String error;
}

// ---------- Instagram ----------

/// GET /business?ig=: profil IG hasil analisis worker.
class IgInfo {
  IgInfo.fromJson(Map<String, dynamic> j)
      : found = j['found'] == true,
        pending = j['pending'] == true,
        username = _s(j['username']),
        biography = _s(j['biography']),
        followers = _i(j['followers']) ?? 0,
        followersDelta = _i(j['followers_delta']) ?? 0,
        engagementRate = _d(j['engagement_rate']),
        postsPerWeek = _d(j['posts_per_week']),
        bestDay = _s(j['best_day']);
  final bool found;
  final bool pending;
  final String username;
  final String biography;
  final int followers;
  final int followersDelta;
  final double? engagementRate;
  final double? postsPerWeek;
  final String bestDay;
}

// ---------- peringkat publik ----------

class RankPair {
  RankPair.fromJson(Map<String, dynamic> j)
      : industry = _s(j['industry']),
        area = _s(j['area']),
        updated = _s(j['updated']),
        businesses = _i(j['businesses']) ?? 0;
  final String industry;
  final String area;
  final String updated;
  final int businesses;
}

class RankRow {
  RankRow.fromJson(Map<String, dynamic> j)
      : name = clean(j['name']),
        category = clean(j['category']),
        rating = _d(j['rating']),
        reviews = _i(j['reviews']) ?? 0,
        score = _d(j['score']) ?? 0,
        rank = _i(j['rank']) ?? 0,
        hiddenGem = j['hidden_gem'] == true,
        flagged = j['flagged'] == true,
        tooFew = j['too_few'] == true,
        hasWebsite = j['has_website'] == true,
        hasInstagram = j['has_instagram'] == true,
        hasWhatsapp = j['has_whatsapp'] == true,
        logoKey = _s(j['logo_key']),
        mapsUrl = _s(j['maps_url']),
        branches = _i(j['branches']) ?? 0;
  final String name;
  final String category;
  final double? rating;
  final int reviews;
  final double score;
  final int rank;
  final bool hiddenGem;
  final bool flagged;
  final bool tooFew;
  final bool hasWebsite;
  final bool hasInstagram;
  final bool hasWhatsapp;
  final String logoKey;
  final String mapsUrl;
  final int branches;
}

class RankData {
  RankData.fromJson(Map<String, dynamic> j)
      : industry = _s(j['industry']),
        area = _s(j['area']),
        updated = _s(j['updated']),
        total = _i(j['total']) ?? 0,
        rows = (j['rows'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => RankRow.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        formula = _s(j['formula']);
  final String industry;
  final String area;
  final String updated;
  final int total;
  final List<RankRow> rows;
  final String formula;
}
