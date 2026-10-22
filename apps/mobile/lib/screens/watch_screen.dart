import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../biz.dart';
import '../models.dart';
import '../theme.dart';
import 'report_screen.dart';

class WatchScreen extends StatefulWidget {
  const WatchScreen({super.key});

  @override
  State<WatchScreen> createState() => _WatchScreenState();
}

class _WatchScreenState extends State<WatchScreen> {
  List<WatchItem>? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  ApiClient get _api => ApiScope.of(context);

  Future<void> _load() async {
    final d = await guard(context, () => _api.watchData());
    if (mounted && d != null) setState(() => _data = d);
  }

  Future<void> _toggle(WatchItem x) async {
    final api = _api;
    final ok = await guardOk(context, () => api.setWatch(x.industry, x.area, on: x.watch == null, lastRun: x.created));
    if (!ok || !mounted) return;
    toast(context, x.watch != null ? 'Pantauan dimatikan' : 'Dipantau tiap 7 hari');
    _load();
  }

  Future<void> _rerun(WatchItem x) async {
    final ok = await guard(context, () => _api.runMarket(x.industry, x.area));
    if (ok != null && mounted) toast(context, 'Riset ulang dimulai, lihat tab Riset.');
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final data = _data;
    return Scaffold(
      appBar: AppBar(title: const Text('Pantau')),
      body: data == null
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text('Wilayah yang dipantau diriset ulang otomatis tiap minggu. Di sini terlihat pesaing baru, rating naik atau turun, dan bisnis yang sedang ramai.', style: t.bodySmall),
                  const SizedBox(height: 14),
                  if (data.isEmpty) Panel(child: Text('Belum ada yang dipantau. Riset dulu, lalu nyalakan pantauan di sini.', style: t.bodySmall)),
                  ...data.map((x) => Padding(padding: const EdgeInsets.only(bottom: 8), child: _Item(x: x, onToggle: () => _toggle(x), onRerun: () => _rerun(x)))),
                ],
              ),
            ),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({required this.x, required this.onToggle, required this.onRerun});
  final WatchItem x;
  final VoidCallback onToggle;
  final VoidCallback onRerun;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final c = x.changes;
    final w = x.watch;
    final next = w == null ? null : (DateTime.tryParse(w.lastRun ?? x.created) ?? DateTime.now()).add(Duration(days: w.everyDays));
    final chips = <Widget>[];
    if (c != null) {
      void add(String key, String label, {Color? color}) {
        final n = c[key]?.length ?? 0;
        if (n > 0) chips.add(Badge2('$n $label', color: color ?? RaqioColors.muted));
      }
      add('new', 'pesaing baru', color: RaqioColors.bad);
      add('rating_down', 'rating turun', color: RaqioColors.good);
      add('rating_up', 'rating naik');
      add('reviews_jump', 'makin ramai');
      add('gone', 'hilang dari Maps');
    }
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${x.industry} · ${x.area}', style: t.titleLarge),
          Text('${x.businesses} bisnis · riset terakhir ${fmtDate(x.created)}${next != null ? " · berikutnya ${fmtDate(next.toIso8601String())}" : ""}', style: t.bodySmall),
          const SizedBox(height: 10),
          if (c == null)
            Text('Perubahan terlihat setelah wilayah ini diriset lagi${next != null ? ", terjadwal ${fmtDate(next.toIso8601String())}" : ""}.', style: t.bodySmall)
          else if (chips.isEmpty)
            Text('Tidak ada perubahan berarti dibanding ${x.prevCreated != null ? fmtDate(x.prevCreated!) : "sebelumnya"}.', style: t.bodySmall)
          else ...[
            Wrap(spacing: 4, runSpacing: 4, children: chips),
            const SizedBox(height: 8),
            for (final e in [('new', 'Pesaing baru'), ('rating_down', 'Rating turun (peluang)'), ('reviews_jump', 'Makin ramai')])
              if ((c[e.$1] ?? const []).isNotEmpty) ...[
                Label(e.$2),
                ...(c[e.$1] ?? const []).take(4).map((p) => Text('• ${p.name}${p.raw["delta"] != null ? " (${dec(p.raw["delta"])})" : ""}', style: t.bodySmall)),
                const SizedBox(height: 6),
              ],
          ],
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            OutlinedButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ReportScreen(reportId: x.reportId))), child: const Text('BUKA LAPORAN')),
            OutlinedButton(onPressed: onRerun, child: const Text('RISET ULANG')),
            OutlinedButton(
              style: w != null ? OutlinedButton.styleFrom(foregroundColor: RaqioColors.good, side: const BorderSide(color: RaqioColors.good)) : null,
              onPressed: onToggle,
              child: Text(w != null ? '✓ DIPANTAU' : '+ PANTAU MINGGUAN'),
            ),
          ]),
        ],
      ),
    );
  }
}
