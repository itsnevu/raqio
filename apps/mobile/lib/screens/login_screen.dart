import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../theme.dart';
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
                      const _Brand(),
                      const SizedBox(height: 18),
                      Text('Masuk', style: t.headlineMedium),
                      const SizedBox(height: 6),
                      Text('Akun yang sama dengan Raqio web. Laporan dan prospek tim ikut terbawa.', style: t.bodySmall),
                      const SizedBox(height: 18),
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
                        child: FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'MEMERIKSA…' : 'MASUK')),
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

class _Brand extends StatelessWidget {
  const _Brand();
  @override
  Widget build(BuildContext context) => Row(
        children: [
          CustomPaint(size: const Size(22, 22), painter: _MarkPainter()),
          const SizedBox(width: 10),
          const Text('raqio', style: TextStyle(fontSize: 25, fontWeight: FontWeight.w500, letterSpacing: -1, color: RaqioColors.text)),
        ],
      );
}

/// Logo "R" yang sama dengan logo.svg di web.
class _MarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 32;
    final stroke = Paint()
      ..color = RaqioColors.text
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4 * s;
    final path = Path()
      ..moveTo(5 * s, 29 * s)
      ..lineTo(5 * s, 3 * s)
      ..lineTo(18 * s, 3 * s)
      ..arcToPoint(Offset(18 * s, 19 * s), radius: Radius.circular(8 * s))
      ..lineTo(11 * s, 19 * s);
    canvas.drawPath(path, stroke);
    canvas.drawLine(Offset(17 * s, 19 * s), Offset(27 * s, 29 * s), stroke..color = RaqioColors.good);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
