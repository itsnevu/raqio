import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../theme.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _name = TextEditingController();
  final _org = TextEditingController();
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _agree = false;
  bool _busy = false;
  String _err = '';

  @override
  void dispose() {
    for (final c in [_name, _org, _email, _pass]) {
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
      await ApiScope.of(context).register(email: _email.text.trim(), password: _pass.text, name: _name.text.trim(), org: _org.text.trim());
      if (mounted) Navigator.of(context).pop(); // sesi sudah ada, RaqioApp berganti ke HomeShell
    } on ApiException catch (e) {
      setState(() => _err = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Daftar')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Panel(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Paket gratis: 5 riset dan 30 cek kontak per bulan, 1 wilayah pantau.', style: t.bodySmall),
              const SizedBox(height: 16),
              const Label('Nama'),
              const SizedBox(height: 6),
              TextField(controller: _name, textInputAction: TextInputAction.next),
              const SizedBox(height: 14),
              const Label('Nama bisnis atau tim'),
              const SizedBox(height: 6),
              TextField(controller: _org, decoration: const InputDecoration(hintText: 'mis. Studio Kreatif Kita'), textInputAction: TextInputAction.next),
              const SizedBox(height: 14),
              const Label('Email'),
              const SizedBox(height: 6),
              TextField(controller: _email, keyboardType: TextInputType.emailAddress, autocorrect: false, textInputAction: TextInputAction.next),
              const SizedBox(height: 14),
              const Label('Password'),
              const SizedBox(height: 6),
              TextField(controller: _pass, obscureText: true, textInputAction: TextInputAction.done, onSubmitted: (_) => _submit()),
              const SizedBox(height: 12),
              CheckboxListTile(
                value: _agree,
                onChanged: (v) => setState(() => _agree = v ?? false),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text('Saya setuju dengan kebijakan privasi dan aturan pakai, termasuk tidak memakai data ini untuk spam.', style: t.bodySmall),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'MEMBUAT AKUN…' : 'BUAT AKUN')),
              ),
              if (_err.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(_err, style: const TextStyle(color: RaqioColors.bad, fontSize: 13)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
