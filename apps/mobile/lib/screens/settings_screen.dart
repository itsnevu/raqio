import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../biz.dart';
import '../models.dart';
import '../theme.dart';
import 'place_sheet.dart' show openUrl;

/// Tab Akun: paritas penuh dengan halaman Pengaturan web — paket dan tagihan, anggota tim,
/// notifikasi pantauan, pengirim kampanye, jasa yang ditawarkan, ganti password, hapus akun.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  Me? _me;
  Org? _org;
  List<Plan> _plans = [];
  String _provider = 'manual';
  List<Invoice> _invoices = [];
  String? _planUntil;
  final _offer = TextEditingController();
  final _cEmail = TextEditingController();
  final _cPass = TextEditingController();
  final _cName = TextEditingController();
  final _invite = TextEditingController();
  String _inviteRole = 'analyst';
  final _nEmail = TextEditingController();
  final _nTelegram = TextEditingController();
  final _nWebhook = TextEditingController();
  final _nSecret = TextEditingController();
  String _secretMasked = '';
  bool _telegramBot = false;
  final _sName = TextEditingController();
  final _sPhone = TextEditingController();
  final _sReply = TextEditingController();
  String _waProvider = '';
  final _sGateway = TextEditingController();
  final _sToken = TextEditingController();
  String _tokenMasked = '';
  final _oldPass = TextEditingController();
  final _newPass = TextEditingController();
  final _delPass = TextEditingController();
  String _delConflict = '';
  bool _claiming = false;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_offer, _cEmail, _cPass, _cName, _invite, _nEmail, _nTelegram, _nWebhook, _nSecret, _sName, _sPhone, _sReply, _sGateway, _sToken, _oldPass, _newPass, _delPass]) {
      c.dispose();
    }
    super.dispose();
  }

  ApiClient get _api => ApiScope.of(context);

  Future<void> _load() async {
    final api = _api;
    final me = await guard(context, api.me);
    if (!mounted) return;
    final org = await guard(context, api.org);
    if (!mounted) return;
    final st = await guard(context, api.settings);
    if (!mounted) return;
    setState(() {
      _me = me;
      _org = org;
      if (st != null) {
        _offer.text = st.offer;
        _nEmail.text = st.notifyEmail;
        _nTelegram.text = st.telegramChat;
        _nWebhook.text = st.webhookUrl;
        _secretMasked = st.webhookSecretMasked;
        _telegramBot = st.telegramBot;
      }
    });
    // paket, tagihan, pengirim: gagal pun bagian lain tetap tampil
    api.plans().then((p) => mounted ? setState(() {
          _plans = p.plans;
          _provider = p.provider;
        }) : null).catchError((_) {});
    api.invoices().then((b) => mounted ? setState(() {
          _invoices = b.invoices;
          _planUntil = b.planUntil;
        }) : null).catchError((_) {});
    api.sender().then((s) => mounted ? setState(() {
          _sName.text = s.senderName;
          _sPhone.text = s.senderPhone;
          _sReply.text = s.replyTo;
          _waProvider = s.waProvider;
          _sGateway.text = s.waGatewayUrl;
          _tokenMasked = s.waGatewayTokenMasked;
        }) : null).catchError((_) {});
  }

  /// Jalankan aksi dengan kunci tombol; toast otomatis saat gagal.
  Future<bool> _act(String key, Future<void> Function() fn) async {
    setState(() => _busy = key);
    final ok = await guardOk(context, fn);
    if (mounted) setState(() => _busy = null);
    return ok;
  }

  Future<void> _claim() async {
    if (_cPass.text.length < 8) {
      toast(context, 'Password minimal 8 karakter.');
      return;
    }
    setState(() => _claiming = true);
    final api = _api;
    final created = await guard(context, () => api.claimGuest(email: _cEmail.text.trim(), password: _cPass.text, name: _cName.text.trim()));
    if (!mounted) return;
    setState(() => _claiming = false);
    if (created == null) return;
    if (!created) {
      toast(context, 'Email itu sudah terdaftar. Keluar lalu masuk dengan akun itu.');
      return;
    }
    toast(context, 'Akun tersimpan. Riset dan prospek tetap ada, paket jadi gratis.');
    _load();
  }

  Future<void> _checkout(Plan p) async {
    setState(() => _busy = 'checkout');
    final r = await guard(context, () => _api.checkout(p.name));
    if (!mounted) return;
    setState(() => _busy = null);
    if (r == null) return;
    if (r.url.startsWith('https://')) {
      await openUrl(context, r.url);
      if (mounted) toast(context, 'Selesaikan pembayaran di halaman yang terbuka; paket aktif otomatis.');
    } else {
      toast(context, r.message.isNotEmpty ? r.message : 'Permintaan aktivasi dikirim');
      _load();
    }
  }

  Future<void> _deleteAccount({bool force = false}) async {
    if (!force) {
      final yes = await showDialog<bool>(
        context: context,
        builder: (d) => AlertDialog(
          backgroundColor: RaqioColors.panel,
          shape: const RoundedRectangleBorder(side: BorderSide(color: RaqioColors.line)),
          title: const Text('Hapus akun?'),
          content: const Text('Menghapus akun ini dan, kalau kamu satu-satunya anggota, seluruh data riset tim. Tidak bisa dibatalkan.'),
          actions: [
            TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Batal')),
            TextButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Hapus', style: TextStyle(color: RaqioColors.bad))),
          ],
        ),
      );
      if (yes != true) return;
    }
    setState(() => _busy = 'delete');
    try {
      await _api.deleteAccount(_delPass.text, force: force);
      // token sudah dibuang; _Root otomatis kembali ke layar Masuk
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.status == 409) {
        setState(() => _delConflict = e.message.isNotEmpty ? e.message : 'Alihkan owner ke anggota lain dulu, atau hapus sekaligus alihkan.');
      } else {
        toast(context, e.message);
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final me = _me, org = _org;
    if (me == null || org == null) {
      return Scaffold(appBar: AppBar(title: const Text('Akun')), body: const Center(child: CircularProgressIndicator(strokeWidth: 2)));
    }
    final canManage = me.role == 'owner' || me.role == 'admin';
    String rp(int n) {
      final s = n.toString();
      final buf = StringBuffer();
      for (var i = 0; i < s.length; i++) {
        if (i > 0 && (s.length - i) % 3 == 0) buf.write('.');
        buf.write(s[i]);
      }
      return 'Rp$buf';
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Akun')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(me.guest ? 'Mode tamu' : org.name, style: t.headlineMedium),
            Text(me.guest ? 'Org sementara, dihapus otomatis setelah beberapa jam.' : 'paket ${org.plan} · ${me.email} (${me.role})', style: t.bodySmall),
            if (me.guest) ...[
              const SizedBox(height: 14),
              Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Label('Simpan akun'),
                  const SizedBox(height: 6),
                  Text('Riset dan prospek yang sudah ada tetap tersimpan. Paket jadi gratis, bisa dipakai juga di Raqio web.', style: t.bodySmall),
                  const SizedBox(height: 10),
                  TextField(controller: _cName, decoration: const InputDecoration(labelText: 'Nama')),
                  const SizedBox(height: 8),
                  TextField(controller: _cEmail, keyboardType: TextInputType.emailAddress, autocorrect: false, decoration: const InputDecoration(labelText: 'Email')),
                  const SizedBox(height: 8),
                  TextField(controller: _cPass, obscureText: true, decoration: const InputDecoration(labelText: 'Password (min. 8)')),
                  const SizedBox(height: 10),
                  SizedBox(width: double.infinity, child: FilledButton(onPressed: _claiming ? null : _claim, child: Text(_claiming ? 'MENYIMPAN…' : 'SIMPAN AKUN'))),
                ]),
              ),
            ],
            if (!me.verified && !me.guest) ...[
              const SizedBox(height: 10),
              Panel(
                child: Row(children: [
                  Expanded(child: Text('Email belum diverifikasi. Cek kotak masuk.', style: t.bodySmall)),
                  TextButton(
                    onPressed: _busy == 'verify'
                        ? null
                        : () async {
                            if (await _act('verify', _api.resendVerify) && context.mounted) toast(context, 'Email verifikasi dikirim ulang');
                          },
                    child: const Text('Kirim ulang'),
                  ),
                ]),
              ),
            ],
            const SizedBox(height: 16),
            const Label('Kuota bulan ini'),
            const SizedBox(height: 8),
            Panel(
              padding: EdgeInsets.zero,
              child: Row(children: [
                _Q('Riset', '${org.usage["market_run"] ?? 0}/${org.limits.runs}'),
                _Q('Cek kontak', '${org.usage["market_detail"] ?? 0}/${org.limits.details}'),
                _Q('Pantau', 'maks ${org.limits.watches}', last: org.limits.chats == null),
                if (org.limits.chats != null) _Q('Chat', '${org.usage["chat"] ?? 0}/${org.limits.chats}', last: true),
              ]),
            ),
            const SizedBox(height: 6),
            Text(
              'Kuota direset tiap awal bulan dan dibagi dengan web serta seluruh anggota tim.'
              '${_planUntil != null ? " Paket ${org.plan} aktif sampai ${fmtDate(_planUntil!)}." : ""}',
              style: t.bodySmall,
            ),

            if (!me.guest) ...[
              const SizedBox(height: 16),
              const Label('Paket'),
              const SizedBox(height: 8),
              if (_plans.isEmpty) Text('Daftar paket belum bisa dimuat.', style: t.bodySmall),
              ..._plans.map((p) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Panel(
                      color: p.name == org.plan ? RaqioColors.sunk : null,
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text(p.name, style: t.titleMedium)),
                          Text(p.price > 0 ? '${rp(p.price)}/bln' : 'gratis', style: t.bodySmall),
                        ]),
                        const SizedBox(height: 4),
                        Text('${p.runs} riset, ${p.details} cek kontak, ${p.watches} pantau, ${p.members} anggota', style: t.bodySmall),
                        if (p.price > 0 && p.name != org.plan && me.role == 'owner') ...[
                          const SizedBox(height: 8),
                          OutlinedButton(
                            onPressed: _busy == 'checkout' ? null : () => _checkout(p),
                            child: Text(_provider == 'xendit' ? 'BAYAR DAN AKTIFKAN' : 'MINTA AKTIVASI'),
                          ),
                        ],
                      ]),
                    ),
                  )),
              if (_invoices.isNotEmpty) ...[
                const SizedBox(height: 4),
                ..._invoices.map((i) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(children: [
                        Expanded(child: Text('#${i.id} · ${i.plan} · ${rp(i.amount)}', style: t.bodySmall)),
                        Badge2(i.status, color: i.status == 'paid' ? RaqioColors.good : RaqioColors.muted),
                        if (i.url.isNotEmpty && i.status == 'pending')
                          TextButton(onPressed: () => openUrl(context, i.url), child: const Text('bayar')),
                      ]),
                    )),
              ],

              const SizedBox(height: 16),
              Label('Anggota tim (${org.members.length} dari ${org.limits.members})'),
              const SizedBox(height: 8),
              Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: org.members
                      .map((m) => Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Row(children: [
                              Expanded(child: Text(m.email, maxLines: 1, overflow: TextOverflow.ellipsis)),
                              Badge2(m.role),
                              if (canManage && m.email != me.email && m.role != 'owner')
                                TextButton(
                                  onPressed: _busy == 'remove'
                                      ? null
                                      : () async {
                                          if (await _act('remove', () => _api.removeMember(m.email))) _load();
                                        },
                                  child: const Text('keluarkan', style: TextStyle(color: RaqioColors.bad, fontSize: 12)),
                                ),
                            ]),
                          ))
                      .toList(),
                ),
              ),
              if (canManage) ...[
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(
                    child: TextField(
                      controller: _invite,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      decoration: const InputDecoration(labelText: 'Email yang diundang', isDense: true),
                    ),
                  ),
                  const SizedBox(width: 8),
                  DropdownButton<String>(
                    value: _inviteRole,
                    items: [
                      const DropdownMenuItem(value: 'viewer', child: Text('viewer')),
                      const DropdownMenuItem(value: 'analyst', child: Text('analyst')),
                      if (me.role == 'owner') const DropdownMenuItem(value: 'admin', child: Text('admin')),
                    ],
                    onChanged: (v) => setState(() => _inviteRole = v ?? 'analyst'),
                  ),
                ]),
                const SizedBox(height: 6),
                Text('viewer: hanya baca. analyst: jalankan riset dan ubah lead. admin: kelola anggota dan pengaturan.', style: t.labelSmall),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: _busy == 'invite'
                      ? null
                      : () async {
                          final email = _invite.text.trim();
                          if (email.isEmpty) return;
                          if (await _act('invite', () => _api.invite(email, _inviteRole)) && context.mounted) {
                            toast(context, 'Undangan dikirim ke $email sebagai $_inviteRole');
                            _invite.clear();
                          }
                        },
                  child: const Text('KIRIM UNDANGAN'),
                ),
              ],

              if (canManage) ...[
                const SizedBox(height: 16),
                const Label('Notifikasi pantauan'),
                const SizedBox(height: 6),
                Text('Perubahan penting di wilayah yang dipantau (pesaing baru, tutup, rating turun) dikirim ke saluran ini. Kosong = email owner dan admin.',
                    style: t.bodySmall),
                const SizedBox(height: 8),
                TextField(controller: _nEmail, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email tujuan alert', isDense: true)),
                const SizedBox(height: 8),
                TextField(
                    controller: _nTelegram,
                    decoration: InputDecoration(labelText: _telegramBot ? 'Chat id Telegram' : 'Chat id Telegram (bot belum diset)', isDense: true)),
                const SizedBox(height: 8),
                TextField(controller: _nWebhook, keyboardType: TextInputType.url, decoration: const InputDecoration(labelText: 'Webhook URL (https://…)', isDense: true)),
                const SizedBox(height: 8),
                TextField(
                  controller: _nSecret,
                  obscureText: true,
                  decoration: InputDecoration(
                      labelText: _secretMasked.isNotEmpty ? 'Webhook secret (tersimpan: $_secretMasked)' : 'Webhook secret (HMAC)', isDense: true),
                ),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  OutlinedButton(
                    onPressed: _busy == 'notif'
                        ? null
                        : () async {
                            final ok = await _act(
                                'notif',
                                () => _api.saveNotif(
                                    notifyEmail: _nEmail.text.trim(),
                                    telegramChat: _nTelegram.text.trim(),
                                    webhookUrl: _nWebhook.text.trim(),
                                    webhookSecret: _nSecret.text));
                            if (ok && context.mounted) {
                              toast(context, 'Notifikasi disimpan');
                              _nSecret.clear();
                              _load();
                            }
                          },
                    child: const Text('SIMPAN'),
                  ),
                  if (_nWebhook.text.isNotEmpty)
                    OutlinedButton(
                      onPressed: _busy == 'webhook'
                          ? null
                          : () async {
                              setState(() => _busy = 'webhook');
                              final ok = await guard(context, _api.testWebhook);
                              if (mounted) setState(() => _busy = null);
                              if (ok != null && context.mounted) toast(context, ok ? 'Webhook menjawab 2xx' : 'Webhook gagal, cek URL dan log');
                            },
                      child: const Text('TES WEBHOOK'),
                    ),
                ]),

                const SizedBox(height: 16),
                const Label('Pengirim kampanye dan gateway WhatsApp'),
                const SizedBox(height: 6),
                Text(
                    'Nama dan nomor WhatsApp pengirim tampil di pesan dan halaman audit prospek. Gateway dipakai mode otomatis WhatsApp: Fonnte, Wablas, atau API generic.',
                    style: t.bodySmall),
                const SizedBox(height: 8),
                TextField(controller: _sName, decoration: const InputDecoration(labelText: 'Nama pengirim', isDense: true)),
                const SizedBox(height: 8),
                TextField(controller: _sPhone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Nomor WA pengirim 62…', isDense: true)),
                const SizedBox(height: 8),
                TextField(controller: _sReply, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Reply-to email (opsional)', isDense: true)),
                const SizedBox(height: 8),
                DropdownButton<String>(
                  value: _waProvider,
                  isExpanded: true,
                  items: const [
                    DropdownMenuItem(value: '', child: Text('tanpa gateway')),
                    DropdownMenuItem(value: 'fonnte', child: Text('Fonnte')),
                    DropdownMenuItem(value: 'wablas', child: Text('Wablas')),
                    DropdownMenuItem(value: 'generic', child: Text('Generic (JSON)')),
                  ],
                  onChanged: (v) => setState(() => _waProvider = v ?? ''),
                ),
                if (_waProvider.isNotEmpty && _waProvider != 'fonnte') ...[
                  const SizedBox(height: 8),
                  TextField(controller: _sGateway, keyboardType: TextInputType.url, decoration: const InputDecoration(labelText: 'URL gateway (https://…)', isDense: true)),
                ],
                if (_waProvider.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  TextField(
                    controller: _sToken,
                    obscureText: true,
                    decoration: InputDecoration(labelText: _tokenMasked.isNotEmpty ? 'Token gateway (tersimpan: $_tokenMasked)' : 'Token gateway', isDense: true),
                  ),
                ],
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: _busy == 'sender'
                      ? null
                      : () async {
                          final ok = await _act(
                              'sender',
                              () => _api.saveSender(
                                  senderName: _sName.text.trim(),
                                  senderPhone: _sPhone.text.trim(),
                                  replyTo: _sReply.text.trim(),
                                  waProvider: _waProvider,
                                  waGatewayUrl: _sGateway.text.trim(),
                                  waGatewayToken: _sToken.text));
                          if (ok && context.mounted) {
                            toast(context, 'Pengirim disimpan');
                            _sToken.clear();
                            _load();
                          }
                        },
                  child: const Text('SIMPAN PENGIRIM'),
                ),
              ],
            ],

            const SizedBox(height: 16),
            const Label('Jasa yang kamu tawarkan'),
            const SizedBox(height: 8),
            TextField(
              controller: _offer,
              decoration: const InputDecoration(hintText: 'mis. bikin website dan katalog online'),
              onSubmitted: (v) async {
                final ok = await guardOk(context, () => _api.saveSettings(offer: v));
                if (ok && context.mounted) toast(context, 'Tersimpan, dipakai di semua draf pesan');
              },
            ),
            const SizedBox(height: 4),
            Text('Dipakai otomatis di draf WhatsApp. Tekan Enter untuk menyimpan.', style: t.bodySmall),

            if (!me.guest) ...[
              const SizedBox(height: 16),
              const Label('Ganti password'),
              const SizedBox(height: 8),
              TextField(controller: _oldPass, obscureText: true, decoration: const InputDecoration(labelText: 'Password lama', isDense: true)),
              const SizedBox(height: 8),
              TextField(controller: _newPass, obscureText: true, decoration: const InputDecoration(labelText: 'Password baru (min. 8)', isDense: true)),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _busy == 'pass'
                    ? null
                    : () async {
                        if (await _act('pass', () => _api.changePassword(_oldPass.text, _newPass.text)) && context.mounted) {
                          toast(context, 'Password diganti');
                          _oldPass.clear();
                          _newPass.clear();
                        }
                      },
                child: const Text('SIMPAN PASSWORD'),
              ),

              const SizedBox(height: 16),
              const Label('Hapus akun'),
              const SizedBox(height: 6),
              Text('Menghapus akun ini dan, kalau kamu satu-satunya anggota, seluruh data riset tim. Tidak bisa dibatalkan.', style: t.bodySmall),
              const SizedBox(height: 8),
              TextField(controller: _delPass, obscureText: true, decoration: const InputDecoration(labelText: 'Password untuk konfirmasi', isDense: true)),
              const SizedBox(height: 8),
              OutlinedButton(
                style: OutlinedButton.styleFrom(foregroundColor: RaqioColors.bad, side: const BorderSide(color: RaqioColors.bad)),
                onPressed: _busy == 'delete' ? null : () => _deleteAccount(),
                child: const Text('HAPUS AKUN'),
              ),
              if (_delConflict.isNotEmpty) ...[
                const SizedBox(height: 8),
                Panel(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Kamu masih owner tim', style: t.titleMedium),
                    const SizedBox(height: 4),
                    Text(_delConflict, style: t.bodySmall),
                    const SizedBox(height: 8),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(foregroundColor: RaqioColors.bad, side: const BorderSide(color: RaqioColors.bad)),
                      onPressed: _busy == 'delete' ? null : () => _deleteAccount(force: true),
                      child: const Text('HAPUS DAN ALIHKAN OWNER'),
                    ),
                  ]),
                ),
              ],
            ],

            const SizedBox(height: 24),
            OutlinedButton(onPressed: () => _api.logout(), child: Text(me.guest ? 'KELUAR DARI MODE TAMU' : 'KELUAR')),
            const SizedBox(height: 10),
            Text('Server: ${_api.baseUrl}', style: t.labelSmall),
            const SizedBox(height: 30),
          ],
        ),
      ),
    );
  }
}

class _Q extends StatelessWidget {
  const _Q(this.l, this.v, {this.last = false});
  final String l, v;
  final bool last;
  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(border: Border(right: last ? BorderSide.none : const BorderSide(color: RaqioColors.line))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Label(l),
            const SizedBox(height: 2),
            Text(v, style: const TextStyle(fontSize: 20, letterSpacing: -0.6)),
          ]),
        ),
      );
}
