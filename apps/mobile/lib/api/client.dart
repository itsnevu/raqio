import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models.dart';

/// Nama cookie sesi yang diterbitkan API Go. Mobile menyimpan nilainya dan mengirimnya sebagai header Cookie,
/// jadi sesi, org, kuota, dan data sama persis dengan yang dipakai web.
const cookieName = 'raqio_session';

class ApiException implements Exception {
  ApiException(this.status, this.message, {this.code});

  /// 0 = jaringan / server tidak bisa dihubungi.
  final int status;
  final String message;
  final String? code;

  @override
  String toString() => message;
}

/// Penyimpanan token sesi. Dipisah supaya tes tidak butuh SharedPreferences.
abstract class TokenStore {
  Future<String?> read();
  Future<void> write(String? value);
}

class MemoryStore implements TokenStore {
  String? _value;
  @override
  Future<String?> read() async => _value;
  @override
  Future<void> write(String? value) async => _value = value;
}

class PrefsStore implements TokenStore {
  PrefsStore(this.prefs);
  final SharedPreferences prefs;
  @override
  Future<String?> read() async => prefs.getString(cookieName);
  @override
  Future<void> write(String? value) async {
    if (value == null) {
      await prefs.remove(cookieName);
    } else {
      await prefs.setString(cookieName, value);
    }
  }
}

class ApiClient extends ChangeNotifier {
  ApiClient({required this.baseUrl, required TokenStore store, http.Client? client})
      : _store = store,
        _http = client ?? http.Client();

  final String baseUrl;
  final TokenStore _store;
  final http.Client _http;
  String? _token;

  bool get loggedIn => _token != null;

  Future<void> init() async {
    _token = await _store.read();
    notifyListeners();
  }

  Future<void> _setToken(String? token) async {
    if (_token == token) return;
    _token = token;
    if (token == null) lastMe = null;
    await _store.write(token);
    notifyListeners();
  }

  Map<String, String> get _headers => {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        if (_token != null) 'Cookie': '$cookieName=$_token',
      };

  Future<dynamic> get(String path) => _send('GET', path, null);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body ?? const <String, Object?>{});

  Future<dynamic> _send(String method, String path, Object? body) async {
    final uri = Uri.parse('$baseUrl$path');
    http.Response resp;
    try {
      resp = method == 'GET'
          ? await _http.get(uri, headers: _headers)
          : await _http.post(uri, headers: _headers, body: jsonEncode(body));
    } catch (_) {
      throw ApiException(0, 'Tidak bisa menghubungi server. Cek koneksi atau alamat API ($baseUrl).');
    }
    await _captureCookie(resp);
    dynamic data;
    if (resp.body.isNotEmpty) {
      try {
        data = jsonDecode(resp.body);
      } catch (_) {
        data = null;
      }
    }
    if (resp.statusCode == 401 && _token != null && !path.startsWith('/auth/login')) {
      await _setToken(null); // sesi dicabut di server: kembali ke layar masuk
    }
    if (resp.statusCode >= 400) {
      final m = data is Map ? data : const {};
      throw ApiException(resp.statusCode, (m['error'] ?? 'Gagal (${resp.statusCode})').toString(),
          code: m['code']?.toString());
    }
    return data;
  }

  Future<void> _captureCookie(http.Response resp) async {
    final sc = resp.headers['set-cookie'];
    if (sc == null) return;
    final m = RegExp('$cookieName=([^;,]*)').firstMatch(sc);
    if (m == null) return;
    final v = m.group(1) ?? '';
    await _setToken(v.isEmpty ? null : v);
  }

  // ---------- auth ----------

  Future<void> login(String email, String password) => post('/auth/login', {'email': email, 'password': password});

  Future<void> forgot(String email) => post('/auth/forgot', {'email': email});

  Future<void> resetPassword(String token, String password) => post('/auth/reset', {'token': token, 'password': password});

  Future<void> changePassword(String oldPass, String newPass) => post('/auth/change-password', {'old': oldPass, 'new': newPass});

  /// 409 = masih owner tim: alihkan owner dulu, atau ulangi dengan force=true.
  Future<void> deleteAccount(String password, {bool force = false}) async {
    await post('/auth/delete-account', {'password': password, if (force) 'force': true});
    await _setToken(null);
  }

  Future<void> resendVerify() => post('/auth/resend-verify');

  Future<void> register({required String email, required String password, required String name, String org = ''}) =>
      post('/auth/register', {'email': email, 'password': password, 'name': name, 'org': org});

  Future<void> logout() async {
    try {
      await post('/auth/logout');
    } catch (_) {}
    await _setToken(null);
  }

  /// Profil terakhir yang diketahui (diisi oleh [me]); dipakai bilah tamu tanpa request ulang.
  Me? lastMe;

  Future<Me> me() async {
    final m = Me.fromJson(await get('/auth/me') as Map<String, dynamic>);
    lastMe = m;
    notifyListeners();
    return m;
  }

  /// Mode tamu: coba tanpa daftar. Org sementara dengan kuota kecil; bisa disimpan jadi akun lewat [claimGuest].
  Future<void> guest() async {
    await post('/auth/guest');
    lastMe = null;
  }

  /// Tamu jadi akun betulan; data riset org tetap. existing=true berarti email sudah terdaftar, tidak ada perubahan.
  Future<bool> claimGuest({required String email, required String password, String name = ''}) async {
    final j = await post('/auth/claim-guest', {'email': email, 'password': password, 'name': name}) as Map<String, dynamic>;
    final existing = j['existing'] == true;
    if (!existing) await me();
    return !existing;
  }
  Future<Org> org() async => Org.fromJson(await get('/org') as Map<String, dynamic>);

  Future<void> invite(String email, String role) => post('/org/invite', {'email': email, 'role': role});

  Future<void> removeMember(String email) => post('/org/remove-member', {'email': email});

  // ---------- billing ----------

  Future<({List<Plan> plans, String provider})> plans() async {
    final j = await get('/billing/plans') as Map<String, dynamic>;
    return (
      plans: (j['plans'] as List? ?? const []).whereType<Map>().map((e) => Plan.fromJson(Map<String, dynamic>.from(e))).toList(),
      provider: (j['provider'] ?? 'manual').toString(),
    );
  }

  Future<({List<Invoice> invoices, String? planUntil})> invoices() async {
    final j = await get('/billing/invoices') as Map<String, dynamic>;
    return (
      invoices: (j['invoices'] as List? ?? const []).whereType<Map>().map((e) => Invoice.fromJson(Map<String, dynamic>.from(e))).toList(),
      planUntil: j['plan_until']?.toString(),
    );
  }

  /// Mengembalikan URL pembayaran (provider xendit) atau pesan konfirmasi (provider manual).
  Future<({String url, String message})> checkout(String plan) async {
    final j = await post('/billing/checkout', {'plan': plan}) as Map<String, dynamic>? ?? const {};
    return (url: (j['url'] ?? '').toString(), message: (j['message'] ?? '').toString());
  }

  // ---------- riset ----------

  Future<List<ReportRow>> reports() async =>
      (await get('/market/reports') as List).map((e) => ReportRow.fromJson(e as Map<String, dynamic>)).toList();

  Future<Report> report(int id) async => Report.fromJson(await get('/market/report?id=$id') as Map<String, dynamic>);

  Future<RunResult> runMarket(String industry, String area, {bool fresh = false}) async =>
      RunResult.fromJson(await post('/market/run', {'industry': industry, 'area': area, if (fresh) 'fresh': true}) as Map<String, dynamic>);

  Future<int?> runCompare(String industry, List<String> areas) async {
    final j = await post('/market/compare/run', {'industry': industry, 'areas': areas}) as Map<String, dynamic>;
    return (j['job'] as num?)?.toInt();
  }

  Future<Compare> compare(String industry, List<String> areas) async => Compare.fromJson(await get(
      '/market/compare?industry=${Uri.encodeQueryComponent(industry)}&areas=${Uri.encodeQueryComponent(areas.join(";"))}') as Map<String, dynamic>);

  Future<List<Suggestion>> suggest() async {
    final j = await get('/market/suggest') as Map<String, dynamic>;
    return (j['items'] as List? ?? const []).whereType<Map>().map((e) => Suggestion.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<PublicStats> stats() async => PublicStats.fromJson(await get('/stats') as Map<String, dynamic>);

  Future<JobLog> log() async => JobLog.fromJson(await get('/log') as Map<String, dynamic>);
  Future<void> stop() => post('/stop');

  /// Antrean riset org: paling lama di depan (itu yang sedang/akan dikerjakan worker).
  Future<List<JobRow>> activeRuns() async {
    final rows = (await get('/jobs') as List? ?? const []).whereType<Map>().map((e) => JobRow.fromJson(Map<String, dynamic>.from(e)));
    return rows.where((j) => j.activeRun).toList().reversed.toList();
  }

  Future<Place> detail(int reportId, String key) async =>
      Place.fromJson(await post('/market/detail', {'report_id': reportId, 'key': key}) as Map<String, dynamic>);

  // ---------- prospek ----------

  Future<List<Place>> prospects() async {
    final j = await get('/prospects/data') as Map<String, dynamic>;
    return (j['items'] as List).map((e) => Place.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> setLead(Place p, {required String status, String? note, String? remind}) async {
    await post('/market/lead', {
      'key': p.key,
      'name': p.name,
      'status': status,
      if (note != null) 'note': note,
      if (remind != null) 'remind': remind,
    });
    p.raw['lead'] = {
      'status': status,
      'note': note ?? p.lead?.note ?? '',
      'remind': remind ?? p.lead?.remind ?? '',
      'updated': DateTime.now().toUtc().toIso8601String(),
    };
  }

  // ---------- pantau ----------

  Future<List<WatchItem>> watchData() async =>
      (await get('/watch/data') as List).map((e) => WatchItem.fromJson(e as Map<String, dynamic>)).toList();

  Future<void> setWatch(String industry, String area, {required bool on, String? lastRun}) =>
      post('/market/watch', {'industry': industry, 'area': area, 'on': on, if (lastRun != null) 'last_run': lastRun});

  Future<List<({String industry, String area})>> watches() async =>
      (await get('/market/watches') as List? ?? const [])
          .whereType<Map>()
          .map((w) => (industry: (w['industry'] ?? '').toString(), area: (w['area'] ?? '').toString()))
          .toList();

  Future<({List<WatchAlert> alerts, int unread})> alerts() async {
    final j = await get('/watch/alerts') as Map<String, dynamic>;
    return (
      alerts: (j['alerts'] as List? ?? const []).whereType<Map>().map((e) => WatchAlert.fromJson(Map<String, dynamic>.from(e))).toList(),
      unread: (j['unread'] as num?)?.toInt() ?? 0,
    );
  }

  Future<void> readAlerts({int? id}) => post('/watch/alerts/read', id != null ? {'id': id} : {'all': true});

  // ---------- kampanye ----------

  Future<({List<Campaign> campaigns, Map<String, CampaignTemplate> templates})> campaigns() async {
    final j = await get('/campaigns') as Map<String, dynamic>;
    return (
      campaigns: (j['campaigns'] as List? ?? const []).whereType<Map>().map((e) => Campaign.fromJson(Map<String, dynamic>.from(e))).toList(),
      templates: (j['templates'] as Map? ?? const {})
          .map((k, v) => MapEntry(k.toString(), CampaignTemplate.fromJson(Map<String, dynamic>.from(v as Map)))),
    );
  }

  Future<CampaignPreview> previewCampaign(
          {required String channel, required String template, required String subject, required Map<String, Object?> select}) async =>
      CampaignPreview.fromJson(
          await post('/campaigns/preview', {'channel': channel, 'template': template, 'subject': subject, 'select': select}) as Map<String, dynamic>);

  /// Mengembalikan (id kampanye, jumlah prospek dilewati karena tidak punya kontak untuk salurannya).
  Future<({int id, int skipped})> createCampaign({
    required String name,
    required String channel,
    required String mode,
    required String subject,
    required String template,
    required int throttleSec,
    required Map<String, Object?> select,
  }) async {
    final j = await post('/campaigns', {
      'name': name,
      'channel': channel,
      'mode': mode,
      'subject': subject,
      'template': template,
      'throttle_sec': throttleSec,
      'select': select,
    }) as Map<String, dynamic>;
    final counts = j['counts'] as Map? ?? const {};
    return (id: (j['id'] as num?)?.toInt() ?? 0, skipped: (counts['skipped'] as num?)?.toInt() ?? 0);
  }

  Future<({Campaign campaign, List<Recipient> recipients})> campaign(int id) async {
    final j = await get('/campaigns/$id') as Map<String, dynamic>;
    return (
      campaign: Campaign.fromJson(Map<String, dynamic>.from(j['campaign'] as Map)),
      recipients: (j['recipients'] as List? ?? const []).whereType<Map>().map((e) => Recipient.fromJson(Map<String, dynamic>.from(e))).toList(),
    );
  }

  Future<void> startCampaign(int id) => post('/campaigns/$id/start');
  Future<void> pauseCampaign(int id) => post('/campaigns/$id/pause');

  Future<NextRecipient> nextRecipient(int id) async => NextRecipient.fromJson(await get('/campaigns/$id/next') as Map<String, dynamic>);

  Future<void> markRecipient(int id, int recipientId, String status) =>
      post('/campaigns/$id/mark', {'recipient_id': recipientId, 'status': status});

  // ---------- asisten ----------

  Future<String> chatSid() async {
    final j = await post('/chat/sid') as Map<String, dynamic>;
    final sid = (j['sid'] ?? '').toString();
    if (sid.isEmpty) throw ApiException(0, 'Server tidak mengembalikan id sesi.');
    return sid;
  }

  /// Mengembalikan (job, sid): sid bisa berbeda kalau server membuat sesi baru.
  Future<({Object job, String sid})> chatSend(String sid, String message, {Map<String, Object?> context = const {}}) async {
    final j = await post('/chat', {'sid': sid, 'message': message, 'context': context}) as Map<String, dynamic>;
    final job = j['job'];
    if (job == null || job == '') throw ApiException(0, 'Server tidak mengembalikan id job.');
    return (job: job as Object, sid: (j['sid'] ?? sid).toString());
  }

  Future<ChatPoll> chatPoll(Object job) async =>
      ChatPoll.fromJson(await get('/chat/poll?job=${Uri.encodeQueryComponent(job.toString())}') as Map<String, dynamic>);

  Future<void> chatStop(Object job) => post('/chat/stop', {'job': job});

  Future<List<ChatSession>> chatSessions() async {
    final j = await get('/chat/sessions') as Map<String, dynamic>;
    return (j['sessions'] as List? ?? const []).whereType<Map>().map((e) => ChatSession.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<ChatHistory> chatMessages(String sid) async =>
      ChatHistory.fromJson(await get('/chat/messages?sid=${Uri.encodeQueryComponent(sid)}') as Map<String, dynamic>);

  Future<void> chatDeleteSession(String sid) => post('/chat/sessions/delete', {'sid': sid});

  Future<List<String>> chatSuggestions(String page, {int? reportId}) async {
    final j = await get('/chat/suggestions?page=$page${reportId != null ? "&report_id=$reportId" : ""}') as Map<String, dynamic>;
    return (j['suggestions'] as List? ?? const []).map((e) => e.toString()).where((s) => s.trim().isNotEmpty).toList();
  }

  // ---------- Instagram ----------

  Future<IgInfo> igProfile(String handle) async =>
      IgInfo.fromJson(await get('/business?ig=${Uri.encodeQueryComponent(handle)}') as Map<String, dynamic>);

  Future<void> igRun(String handle) => post('/run', {'targets': handle, 'mode': 'direct'});

  // ---------- peringkat publik ----------

  Future<List<RankPair>> rankPairs() async {
    final j = await get('/rank/pairs') as Map<String, dynamic>;
    return (j['items'] as List? ?? const []).whereType<Map>().map((e) => RankPair.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<RankData> rank(String industry, String area) async => RankData.fromJson(await get(
      '/rank?industry=${Uri.encodeQueryComponent(industry)}&area=${Uri.encodeQueryComponent(area)}') as Map<String, dynamic>);

  // ---------- pengaturan org ----------

  Future<Settings> settings() async => Settings.fromJson(await get('/org/settings') as Map<String, dynamic>);

  Future<void> saveSettings({String? offer, Map<String, String>? goals}) =>
      post('/org/settings', {if (offer != null) 'offer': offer, if (goals != null) 'goals': goals});

  /// Saluran notifikasi pantauan (admin). Secret hanya dikirim kalau diisi ulang.
  Future<void> saveNotif({required String notifyEmail, required String telegramChat, required String webhookUrl, String webhookSecret = ''}) =>
      post('/org/settings', {
        'notify_email': notifyEmail,
        'telegram_chat': telegramChat,
        'webhook_url': webhookUrl,
        if (webhookSecret.isNotEmpty) 'webhook_secret': webhookSecret,
      });

  Future<bool> testWebhook() async {
    final j = await post('/org/webhook/test') as Map<String, dynamic>? ?? const {};
    return j['ok'] == true;
  }

  Future<Sender> sender() async => Sender.fromJson(await get('/org/sender') as Map<String, dynamic>);

  Future<void> saveSender({
    required String senderName,
    required String senderPhone,
    required String replyTo,
    required String waProvider,
    required String waGatewayUrl,
    String waGatewayToken = '',
  }) =>
      post('/org/sender', {
        'sender_name': senderName,
        'sender_phone': senderPhone,
        'reply_to': replyTo,
        'wa_provider': waProvider,
        'wa_gateway_url': waGatewayUrl,
        if (waGatewayToken.isNotEmpty) 'wa_gateway_token': waGatewayToken,
      });

  /// URL logo bisnis yang dilayani API sendiri (dipakai BizAvatar).
  String logoUrl(String key) => '$baseUrl/logo/${Uri.encodeComponent(key)}';
}
