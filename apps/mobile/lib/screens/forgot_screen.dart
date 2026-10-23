import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../theme.dart';

/// Lupa password: kirim tautan reset ke email, lalu (opsional) langsung pakai token dari email di sini.
/// Port halaman /forgot dan /reset web.
class ForgotScreen extends StatefulWidget {
  const ForgotScreen({super.key});

  @override
  State<ForgotScreen> createState() => _ForgotScreenState();
}

class _ForgotScreenState extends State<ForgotScreen> {
  final _email = TextEditingController();
  final _token = TextEditingController();
  final _pass = TextEditingController();
  bool _busy = false;
  bool _sent = false;
  String _err = '';

  @override
  void dispose() {
    for (final c in [_email, _token, _pass]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _send() async {
    if (_email.text.trim().isEmpty) {
      setState(() => _err = 'Isi email akunmu.');
      return;
    }
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await ApiScope.of(context).forgot(_email.text.trim());
      if (mounted) setState(() => _sent = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _err = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reset() async {
    if (_token.text.trim().isEmpty || _pass.text.length < 8) {
      setState(() => _err = 'Isi token dari email dan password baru minimal 8 karakter.');
      return;
    }
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await ApiScope.of(context).resetPassword(_token.text.trim(), _pass.text);
      if (!mounted) return;
      toast(context, 'Password diganti. Masuk dengan password baru.');
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _err = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Lupa password')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Panel(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Reset lewat email', style: t.titleLarge),
                  const SizedBox(height: 6),
                  Text('Kami kirim tautan dan token reset ke email akunmu. Tautan di email bisa dibuka di Raqio web, atau salin tokennya ke form di bawah.', style: t.bodySmall),
                  const SizedBox(height: 14),
                  const Label('Email'),
                  const SizedBox(height: 6),
                  TextField(controller: _email, keyboardType: TextInputType.emailAddress, autocorrect: false),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(onPressed: _busy ? null : _send, child: Text(_busy ? 'MENGIRIM…' : 'KIRIM EMAIL RESET')),
                  ),
                  if (_sent) ...[
                    const SizedBox(height: 8),
                    const Text('Kalau email itu terdaftar, tautan reset sudah dikirim. Cek kotak masuk dan folder spam.',
                        style: TextStyle(color: RaqioColors.good, fontSize: 13)),
                  ],
                  const Divider(height: 32),
                  Text('Sudah punya token?', style: t.titleMedium),
                  const SizedBox(height: 10),
                  const Label('Token dari email'),
                  const SizedBox(height: 6),
                  TextField(controller: _token, autocorrect: false),
                  const SizedBox(height: 12),
                  const Label('Password baru (min. 8)'),
                  const SizedBox(height: 6),
                  TextField(controller: _pass, obscureText: true),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(onPressed: _busy ? null : _reset, child: const Text('GANTI PASSWORD')),
                  ),
                  if (_err.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(_err, style: const TextStyle(color: RaqioColors.bad, fontSize: 13)),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
