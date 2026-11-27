import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../theme.dart';
import 'register_screen.dart';

/// Kode undangan akses awal, sama dengan /undangan di web. Kode hanya dicek di sini; jatahnya baru terpakai
/// saat akun dibuat di [RegisterScreen].
class InviteScreen extends StatefulWidget {
  const InviteScreen({super.key});

  @override
  State<InviteScreen> createState() => _InviteScreenState();
}

class _InviteScreenState extends State<InviteScreen> {
  final _code = TextEditingController();
  String _err = '';
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_code.text.trim().isEmpty) return;
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      final code = await ApiScope.of(context).checkInviteCode(_code.text);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => RegisterScreen(inviteCode: code)));
    } on ApiException catch (e) {
      setState(() => _err = e.code == 'invite_code_invalid' ? 'Kode undangan tidak valid, kedaluwarsa, atau sudah habis dipakai.' : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Kode undangan')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Masukkan kode undangan', style: t.headlineMedium?.copyWith(fontSize: 30)),
            const SizedBox(height: 10),
            Text('Selama akses awal, akun Raqio dibuat lewat undangan. Masukkan kode yang Anda terima untuk membuat akun.',
                style: t.bodyMedium?.copyWith(color: RaqioColors.muted, height: 1.5)),
            const SizedBox(height: 24),
            const Text('Kode undangan', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: RaqioColors.text)),
            const SizedBox(height: 8),
            TextField(
              key: const Key('invite-code'),
              controller: _code,
              autocorrect: false,
              textCapitalization: TextCapitalization.characters,
              style: const TextStyle(fontFamily: 'monospace', letterSpacing: 1.2),
              decoration: const InputDecoration(hintText: 'RAQIO-XXXX-XXXX-XXXX'),
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'MEMERIKSA…' : 'LANJUT')),
            ),
            if (_err.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(_err, style: const TextStyle(color: RaqioColors.bad, fontSize: 14)),
            ],
            const SizedBox(height: 20),
            Text('Belum punya kode? Minta ke admin akun Raqio Anda.', style: t.bodySmall?.copyWith(fontSize: 14)),
          ],
        ),
      ),
    );
  }
}
