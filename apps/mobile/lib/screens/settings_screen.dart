import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../models.dart';
import '../theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  Me? _me;
  Org? _org;
  final _offer = TextEditingController();
  final _cEmail = TextEditingController();
  final _cPass = TextEditingController();
  final _cName = TextEditingController();
  bool _claiming = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_offer, _cEmail, _cPass, _cName]) {
      c.dispose();
    }
    super.dispose();
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
      if (st != null) _offer.text = st.offer;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final me = _me, org = _org;
    return Scaffold(
      appBar: AppBar(title: const Text('Akun')),
      body: me == null || org == null
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
          : RefreshIndicator(
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
                          onPressed: () async {
                            final ok = await guard(context, () => _api.post('/auth/resend-verify'));
                            if (ok != null && context.mounted) toast(context, 'Email verifikasi dikirim ulang');
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
                      _Q('Pantau', 'maks ${org.limits.watches}', last: true),
                    ]),
                  ),
                  const SizedBox(height: 6),
                  Text('Kuota dibagi dengan web dan seluruh anggota tim. Upgrade paket lewat Raqio web > Pengaturan.', style: t.bodySmall),
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
                  const SizedBox(height: 16),
                  const Label('Anggota tim'),
                  const SizedBox(height: 8),
                  Panel(child: Text(org.members.join('\n'))),
                  const SizedBox(height: 24),
                  OutlinedButton(onPressed: () => _api.logout(), child: Text(me.guest ? 'KELUAR DARI MODE TAMU' : 'KELUAR')),
                  const SizedBox(height: 10),
                  Text('Server: ${_api.baseUrl}', style: t.labelSmall),
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
