import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../theme.dart';
import '../widgets/logo.dart';
import 'forgot_screen.dart';
import 'invite_screen.dart';
import 'register_screen.dart';

/// Masuk dengan akun Raqio yang sama dengan web (satu login untuk keempat agent).
/// Tata letak mengikuti halaman login web: judul, field 46px, tombol utama dengan kotak panah, tombol tamu bergaris.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

const _agents = ['Research Agent', 'SEO Agent', 'Marketing Agent', 'Customer Service Agent'];

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  String _err = '';
  bool _busy = false;
  // akses lewat undangan (API INVITE_ONLY): tombol tamu diganti tombol kode, email asing dapat pesan invite-only
  bool _inviteOnly = false;
  bool _notInvited = false;
  bool _accessChecked = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_accessChecked) return;
    _accessChecked = true;
    ApiScope.of(context).inviteOnly().then((v) {
      if (mounted && v) setState(() => _inviteOnly = true);
    });
  }

  void _openInvite() => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const InviteScreen()));

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
      _notInvited = false;
    });
    try {
      await ApiScope.of(context).login(_email.text.trim(), _pass.text);
    } on ApiException catch (e) {
      setState(() {
        if (e.code == 'invite_only') {
          _notInvited = true; // email belum diundang; API sudah mencatatnya sebagai peminat
        } else {
          _err = e.message;
        }
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    const fieldLabel = TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: RaqioColors.text);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const RaqioLogo(),
                    const SizedBox(height: 40),
                    Text('Masuk', style: t.headlineMedium?.copyWith(fontSize: 34, letterSpacing: -0.4)),
                    const SizedBox(height: 10),
                    Text('Satu akun untuk Research, SEO, Marketing, dan Customer Service Agent.',
                        style: t.bodyMedium?.copyWith(color: RaqioColors.muted, height: 1.5)),
                    const SizedBox(height: 28),
                    const Text('Email', style: fieldLabel),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      autofillHints: const [AutofillHints.username],
                      textInputAction: TextInputAction.next,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        const Expanded(child: Text('Password', style: fieldLabel)),
                        TextButton(
                          style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 4), minimumSize: const Size(0, 32)),
                          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ForgotScreen())),
                          child: const Text('Lupa password?'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    TextField(
                      controller: _pass,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _submit(),
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      height: 46,
                      child: FilledButton(
                        style: FilledButton.styleFrom(padding: const EdgeInsets.only(left: 16, right: 7)),
                        onPressed: _busy ? null : _submit,
                        child: Row(
                          children: [
                            Expanded(child: Text(_busy ? 'MEMERIKSA…' : 'MASUK')),
                            const _ArrowBox(),
                          ],
                        ),
                      ),
                    ),
                    if (_notInvited) ...[
                      const SizedBox(height: 12),
                      _InviteNotice(onCode: _openInvite),
                    ],
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      height: 46,
                      child: _inviteOnly
                          ? OutlinedButton(key: const Key('use-code'), onPressed: _busy ? null : _openInvite, child: const Text('PAKAI KODE UNDANGAN'))
                          : OutlinedButton(key: const Key('guest'), onPressed: _busy ? null : _guest, child: const Text('COBA TANPA DAFTAR')),
                    ),
                    if (_err.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(_err, style: const TextStyle(color: RaqioColors.bad, fontSize: 14)),
                    ],
                    const SizedBox(height: 16),
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 2,
                      children: [
                        Text('Belum punya akun?', style: t.bodySmall?.copyWith(fontSize: 14)),
                        TextButton(
                          style: TextButton.styleFrom(foregroundColor: RaqioColors.text),
                          onPressed: _inviteOnly ? _openInvite : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RegisterScreen())),
                          child: Text(_inviteOnly ? 'Pakai kode undangan' : 'Daftar'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 28),
                    const _AgentsCard(),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Pesan email belum diundang, sama dengan kotak invite-only di login web.
class _InviteNotice extends StatelessWidget {
  const _InviteNotice({required this.onCode});
  final VoidCallback onCode;
  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF0A0A0F);
    return Container(
      key: const Key('invite-notice'),
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(color: RaqioColors.card, borderRadius: BorderRadius.all(Radius.circular(8))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Raqio hanya lewat undangan', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: ink)),
          const SizedBox(height: 4),
          Text('Akun Raqio saat ini hanya lewat undangan. Minta admin akun Raqio Anda untuk mengundang Anda.',
              style: TextStyle(fontSize: 14, height: 1.5, color: ink.withValues(alpha: 0.72))),
          const SizedBox(height: 6),
          GestureDetector(
            onTap: onCode,
            child: const Text('Punya kode undangan?', style: TextStyle(fontSize: 14, color: ink, decoration: TextDecoration.underline)),
          ),
        ],
      ),
    );
  }
}

/// Kotak panah 32px seperti tombol di situs Raqio.
class _ArrowBox extends StatelessWidget {
  const _ArrowBox();
  @override
  Widget build(BuildContext context) => Container(
        width: 32,
        height: 32,
        decoration: const BoxDecoration(color: RaqioColors.bg, borderRadius: BorderRadius.all(Radius.circular(4))),
        child: const Icon(Icons.arrow_forward, size: 16, color: RaqioColors.text),
      );
}

/// Kartu pastel (sama dengan panel login web): satu akun membuka keempat agent.
class _AgentsCard extends StatelessWidget {
  const _AgentsCard();
  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF0A0A0F);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: const BoxDecoration(color: RaqioColors.card, borderRadius: BorderRadius.all(Radius.circular(12))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(children: [
            RaqioMark(size: 11, color: ink),
            SizedBox(width: 8),
            Text('SATU AKUN RAQIO', style: TextStyle(fontSize: 11, letterSpacing: 0.6, color: ink)),
          ]),
          const SizedBox(height: 12),
          const Text('Satu login untuk keempat agent Raqio.', style: TextStyle(fontSize: 20, height: 1.25, letterSpacing: -0.2, color: ink)),
          const SizedBox(height: 8),
          for (final a in _agents)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: ink.withValues(alpha: 0.12)))),
              child: Text(a, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: ink)),
            ),
        ],
      ),
    );
  }
}
