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

  Future<void> register({required String email, required String password, required String name, String org = ''}) =>
      post('/auth/register', {'email': email, 'password': password, 'name': name, 'org': org});

  Future<void> logout() async {
    try {
      await post('/auth/logout');
    } catch (_) {}
    await _setToken(null);
  }

  Future<Me> me() async => Me.fromJson(await get('/auth/me') as Map<String, dynamic>);
  Future<Org> org() async => Org.fromJson(await get('/org') as Map<String, dynamic>);

  // ---------- riset ----------

  Future<List<ReportRow>> reports() async =>
      (await get('/market/reports') as List).map((e) => ReportRow.fromJson(e as Map<String, dynamic>)).toList();

  Future<Report> report(int id) async => Report.fromJson(await get('/market/report?id=$id') as Map<String, dynamic>);

  Future<int?> runMarket(String industry, String area) async {
    final j = await post('/market/run', {'industry': industry, 'area': area}) as Map<String, dynamic>;
    return (j['job'] as num?)?.toInt();
  }

  Future<JobLog> log() async => JobLog.fromJson(await get('/log') as Map<String, dynamic>);
  Future<void> stop() => post('/stop');

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

  // ---------- pengaturan org ----------

  Future<Settings> settings() async => Settings.fromJson(await get('/org/settings') as Map<String, dynamic>);

  Future<void> saveSettings({String? offer, Map<String, String>? goals}) =>
      post('/org/settings', {if (offer != null) 'offer': offer, if (goals != null) 'goals': goals});
}
