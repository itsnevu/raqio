import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../theme.dart';

/// Buat akun Raqio. Selama akses awal (API INVITE_ONLY), pendaftaran butuh kode undangan: diisi otomatis bila
/// datang dari [InviteScreen], atau diketik langsung di kolom kode.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, this.inviteCode = ''});
  final String inviteCode;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _name = TextEditingController();
  final _org = TextEditingController();
  final _email = TextEditingController();
  final _pass = TextEditingController();
  late final _code = TextEditingController(text: widget.inviteCode);
  bool _agree = false;
  bool _busy = false;
  String _err = '';

  @override
  void dispose() {
    for (final c in [_name, _org, _email, _pass, _code]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_agree) {
      setState(() => _err = 'Centang persetujuan dulu.');
      return;
    }
    if (_pass.text.length < 8) {
      setState(() => _err = 'Password minimal 8 karakter.');
      return;
    }
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await ApiScope.of(context).register(
          email: _email.text.trim(), password: _pass.text, name: _name.text.trim(), org: _org.text.trim(), code: _code.text.trim());
      if (mounted) Navigator.of(context).pop(); // sesi sudah ada, RaqioApp berganti ke HomeShell
    } on ApiException catch (e) {
      setState(() => _err = e.code == 'invite_only'
          ? 'Pendaftaran Raqio saat ini hanya lewat undangan. Isi kode undangan Anda di atas.'
          : e.code == 'invite_code_invalid'
              ? 'Kode undangan tidak valid, kedaluwarsa, atau sudah habis dipakai.'
              : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    const fieldLabel = TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: RaqioColors.text);
    final fromInvite = widget.inviteCode.isNotEmpty;
    return Scaffold(
      appBar: AppBar(title: const Text('Buat akun')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Paket gratis: 5 riset dan 30 cek kontak per bulan, plus 1 wilayah pantau.', style: t.bodyMedium?.copyWith(color: RaqioColors.muted, height: 1.5)),
            const SizedBox(height: 20),
            const Text('Kode undangan', style: fieldLabel),
            const SizedBox(height: 8),
            TextField(
              key: const Key('register-code'),
              controller: _code,
              readOnly: fromInvite,
              autocorrect: false,
              textCapitalization: TextCapitalization.characters,
              style: const TextStyle(fontFamily: 'monospace', letterSpacing: 1.2),
              decoration: const InputDecoration(hintText: 'RAQIO-XXXX-XXXX-XXXX'),
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 16),
            const Text('Nama', style: fieldLabel),
            const SizedBox(height: 8),
            TextField(controller: _name, textInputAction: TextInputAction.next),
            const SizedBox(height: 16),
            const Text('Nama bisnis atau tim', style: fieldLabel),
            const SizedBox(height: 8),
            TextField(controller: _org, decoration: const InputDecoration(hintText: 'mis. Studio Kreatif Kita'), textInputAction: TextInputAction.next),
            const SizedBox(height: 16),
            const Text('Email', style: fieldLabel),
            const SizedBox(height: 8),
            TextField(controller: _email, keyboardType: TextInputType.emailAddress, autocorrect: false, textInputAction: TextInputAction.next),
            const SizedBox(height: 16),
            const Text('Password', style: fieldLabel),
            const SizedBox(height: 8),
            TextField(controller: _pass, obscureText: true, textInputAction: TextInputAction.done, onSubmitted: (_) => _submit()),
            const SizedBox(height: 6),
            Text('Minimal 8 karakter.', style: t.bodySmall),
            const SizedBox(height: 12),
            CheckboxListTile(
              value: _agree,
              onChanged: (v) => setState(() => _agree = v ?? false),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              dense: true,
              title: Text('Saya setuju dengan kebijakan privasi dan syarat layanan, termasuk tidak memakai data ini untuk spam.', style: t.bodySmall?.copyWith(fontSize: 13)),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'MEMBUAT AKUN…' : 'BUAT AKUN')),
            ),
            if (_err.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(_err, style: const TextStyle(color: RaqioColors.bad, fontSize: 14)),
            ],
          ],
        ),
      ),
    );
  }
}
