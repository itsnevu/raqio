import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../theme.dart';
import '../widgets/logo.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  String _err = '';
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _guest() async {
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await ApiScope.of(context).guest();
    } on ApiException catch (e) {
      setState(() => _err = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty || _pass.text.isEmpty) {
      setState(() => _err = 'Isi email dan password.');
      return;
    }
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await ApiScope.of(context).login(_email.text.trim(), _pass.text);
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
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Panel(
                padding: const EdgeInsets.all(24),
                child: AutofillGroup(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const RaqioLogo(),
                      const SizedBox(height: 18),
                      Text('Kenali pasarmu. Temukan celahnya.', style: t.headlineMedium),
                      const SizedBox(height: 6),
                      Text('Coba dulu tanpa akun. Masuk kalau mau menyimpan riset, menambah kuota, dan memakai akun yang sama dengan Raqio web.', style: t.bodySmall),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(key: const Key('guest'), onPressed: _busy ? null : _guest, child: const Text('COBA TANPA DAFTAR')),
                      ),
                      const SizedBox(height: 18),
                      const Divider(),
                      const SizedBox(height: 12),
                      Text('Sudah punya akun?', style: t.titleMedium),
                      const SizedBox(height: 10),
                      const Label('Email'),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                        autofillHints: const [AutofillHints.username],
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      const Label('Password'),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _pass,
                        obscureText: true,
                        autofillHints: const [AutofillHints.password],
                        textInputAction: TextInputAction.done,
                        onSubmitted: (_) => _submit(),
                      ),
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'MEMERIKSA…' : 'MASUK')),
                      ),
                      if (_err.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Text(_err, style: const TextStyle(color: RaqioColors.bad, fontSize: 13)),
                      ],
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Text('Belum punya akun?', style: t.bodySmall),
                          TextButton(
                            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RegisterScreen())),
                            child: const Text('Daftar'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
