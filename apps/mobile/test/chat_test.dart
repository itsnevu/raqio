import 'package:flutter_test/flutter_test.dart';
import 'package:raqio_mobile/api/client.dart';
import 'package:raqio_mobile/chat.dart';

void main() {
  test('stepText: tool dikenal diberi label, argumen JSON jadi nilai', () {
    expect(stepText('🔧 search_competitors({"q":"kopi","area":"Kemang"})'), 'Mencari bisnis di lokasi (bisa beberapa menit)… (kopi · Kemang)');
    expect(stepText('🔧 list_competitors({})'), 'Membaca data tersimpan…');
    expect(stepText('🔧 tool_baru({"x":"y"})'), 'tool_baru (y)');
    expect(stepText('baris progres biasa'), 'baris progres biasa');
    expect(isToolStep('🔧 x()'), isTrue);
    expect(isToolStep('x'), isFalse);
  });

  test('describeChatError: pemetaan kode busy/quota/disabled/nokey', () {
    expect(describeChatError(ApiException(409, 'sibuk')).code, 'busy');
    expect(describeChatError(ApiException(402, 'kuota', code: 'quota_exceeded')).code, 'quota');
    expect(describeChatError(ApiException(503, 'off', code: 'chat_disabled')).code, 'disabled');
    expect(describeChatError(ApiException(500, 'OPENROUTER_API_KEY belum diset')).code, 'nokey');
    expect(describeChatError(ApiException(500, 'lain')).code, 'other');
    expect(describeChatError(Exception('x')).code, 'other');
  });

  test('quotaText: sisa kuota', () {
    expect(quotaText(null), '');
    expect(quotaText((used: 3, limit: 10)), 'Sisa kuota chat bulan ini: 7 dari 10.');
    expect(quotaText((used: 10, limit: 10)), 'Kuota chat bulan ini habis.');
  });
}
