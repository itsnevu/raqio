// Helper murni layar Asisten: baris log job jadi langkah yang terbaca, dan pemetaan error jadi
// pesan ramah. Port langsung dari apps/web/lib/chat/steps.ts supaya teksnya sama dengan web.
import 'api/client.dart';

const toolPrefix = '🔧';

const _toolLabel = {
  'search_competitors': 'Mencari bisnis di lokasi (bisa beberapa menit)…',
  'list_competitors': 'Membaca data tersimpan…',
  'scrape_instagram': 'Scrape Instagram…',
  'google_trends': 'Cek Google Trends…',
};

/// Baris yang diawali 🔧 adalah panggilan tool agent; baris lain progres biasa.
bool isToolStep(String s) => s.trimLeft().startsWith(toolPrefix);

/// `🔧 search_competitors({"q":"kopi"})` -> `Mencari bisnis di lokasi (bisa beberapa menit)… (kopi)`.
/// Tool tak dikenal dipakai namanya.
String stepText(String s) {
  final t = s.trim();
  if (!isToolStep(t)) return t;
  final body = t.substring(toolPrefix.length).trim();
  final m = RegExp(r'^(\w+)\((.*)\)$', dotAll: true).firstMatch(body);
  if (m == null) return body;
  var args = '';
  final rawArgs = m.group(2) ?? '';
  // argumen JSON {k: v} -> nilai-nilainya saja, dipisah " · " (bool/null/kosong dibuang)
  final vals = <String>[];
  for (final kv in RegExp(r'"[^"]*"\s*:\s*("([^"\\]|\\.)*"|[\d.]+)').allMatches(rawArgs)) {
    var v = kv.group(1) ?? '';
    if (v.startsWith('"')) v = v.substring(1, v.length - 1);
    if (v.isNotEmpty) vals.add(v);
  }
  args = vals.join(' · ');
  return (_toolLabel[m.group(1)] ?? m.group(1)!) + (args.isNotEmpty ? ' ($args)' : '');
}

const noKeyMsg = 'Asisten belum dikonfigurasi, hubungi admin. Riset pasar dan papan prospek tetap bisa dipakai.';
const busyMsg = 'Agent masih menjawab. Tunggu jawaban sebelumnya selesai atau tekan Stop.';
const quotaMsg = 'Kuota chat bulan ini habis.';
const disabledMsg = 'Asisten dinonaktifkan di server ini.';

bool isNoKey(String m) => RegExp('OPENROUTER|API_KEY|api key', caseSensitive: false).hasMatch(m);

/// Pesan dan kode error untuk gelembung asisten. code: busy|quota|disabled|nokey|other.
({String error, String code}) describeChatError(Object e) {
  if (e is ApiException) {
    if (e.code == 'chat_busy' || e.code == 'job_running' || e.status == 409) return (error: busyMsg, code: 'busy');
    if (e.code == 'quota_exceeded' || e.status == 402) return (error: quotaMsg, code: 'quota');
    if (e.code == 'chat_disabled' || e.status == 503) return (error: disabledMsg, code: 'disabled');
    if (isNoKey(e.message)) return (error: noKeyMsg, code: 'nokey');
    return (error: e.message, code: 'other');
  }
  return (error: 'Gagal menghubungi asisten.', code: 'other');
}

/// Saran pertanyaan bawaan kalau GET /chat/suggestions gagal. Sama dengan CHIPS di web.
const chatChips = [
  'kompetitor coffee shop di Kemang siapa aja?',
  'riset pasar agency di Gading Serpong',
  'salon di Dago Bandung yang paling rame di IG',
  'bandingin Kopi Kenangan sama Janji Jiwa',
];

String quotaText(({int used, int limit})? q) {
  if (q == null) return '';
  final left = (q.limit - q.used).clamp(0, 1 << 31);
  return left == 0 ? 'Kuota chat bulan ini habis.' : 'Sisa kuota chat bulan ini: $left dari ${q.limit}.';
}
