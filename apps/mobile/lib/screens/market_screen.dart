import 'dart:async';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../biz.dart';
import '../models.dart';
import '../theme.dart';
import 'report_screen.dart';

const _steps = ['Cari di Google Maps', 'Ambil telepon dan website', 'Cari akun IG', 'Susun laporan', 'Simpan'];

class MarketScreen extends StatefulWidget {
  const MarketScreen({super.key});

  @override
  State<MarketScreen> createState() => _MarketScreenState();
}

class _MarketScreenState extends State<MarketScreen> {
  final _industry = TextEditingController();
  final _area = TextEditingController();
  String _goal = 'client';
  List<ReportRow> _reports = [];
  bool _loaded = false;
  JobLog? _job;
  bool _wasRunning = false;
  Timer? _timer;
  Settings? _settings;

  @override
  void initState() {
    super.initState();
    _load();
    _poll();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _industry.dispose();
    _area.dispose();
    super.dispose();
  }

  ApiClient get _api => ApiScope.of(context);

  Future<void> _load() async {
    final api = _api;
    final rows = await guard(context, api.reports);
    if (!mounted) return;
    final st = await guard(context, api.settings);
    if (!mounted) return;
    setState(() {
      if (rows != null) _reports = rows;
      if (st != null) _settings = st;
      _loaded = true;
    });
  }

  Future<void> _poll() async {
    _timer?.cancel();
    JobLog? j;
    try {
      j = await _api.log();
    } on ApiException {
      j = null;
    }
    if (!mounted) return;
    setState(() => _job = j);
    if (j == null) return;
    if (j.running) {
      _timer = Timer(const Duration(seconds: 2), _poll);
    } else if (_wasRunning) {
      await _load();
      if (!mounted) return;
      final id = j.reportId;
      if (j.stopped) {
        toast(context, 'Riset dihentikan.');
      } else if (id != null) {
        toast(context, 'Riset selesai.');
        _open(id);
      } else {
        toast(context, 'Gagal: ${j.lastLine}');
      }
    }
    _wasRunning = j.running;
  }

  Future<void> _run() async {
    final ind = _industry.text.trim(), area = _area.text.trim();
    if (ind.isEmpty || area.isEmpty) {
      toast(context, 'Isi industri dan wilayah.');
      return;
    }
    final key = '${ind.toLowerCase()}|${area.toLowerCase()}';
    final ok = await guard(context, () async {
      await _api.saveSettings(goals: {key: _goal});
      return _api.runMarket(ind, area);
    });
    if (ok == null || !mounted) return;
    FocusScope.of(context).unfocus();
    _wasRunning = true;
    await _poll();
  }

  void _open(int id) {
    final goals = _settings?.goals ?? const {};
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ReportScreen(reportId: id, goals: goals, offer: _settings?.offer ?? ''),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final job = _job;
    final running = job?.running == true;
    return Scaffold(
      appBar: AppBar(title: const Text('Riset')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Peta pasar industri apa pun.', style: t.headlineMedium),
            const SizedBox(height: 6),
            Text('Data dari Google Maps dan website bisnis, dibersihkan, tanpa duplikat. Sama dengan yang ada di web.', style: t.bodySmall),
            const SizedBox(height: 16),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'client', label: Text('Cari calon klien')),
                ButtonSegment(value: 'rival', label: Text('Pelajari pesaing')),
              ],
              selected: {_goal},
              onSelectionChanged: (s) => setState(() => _goal = s.first),
              showSelectedIcon: false,
            ),
            if (_goal == 'client' && selfWords.hasMatch(_industry.text)) ...[
              const SizedBox(height: 8),
              Text('"${_industry.text}" terdengar seperti bisnismu sendiri. Kalau maksudmu mau lihat pesaing, pilih Pelajari pesaing.',
                  style: const TextStyle(color: RaqioColors.warn, fontSize: 12)),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _industry,
              decoration: const InputDecoration(labelText: 'Industri', hintText: 'mis. coffee shop, salon, digital agency'),
              textInputAction: TextInputAction.next,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _area,
              decoration: const InputDecoration(labelText: 'Wilayah', hintText: 'mis. Kemang Jakarta'),
              textInputAction: TextInputAction.go,
              onSubmitted: (_) => _run(),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton(onPressed: running ? null : _run, child: Text(running ? 'SEDANG RISET…' : 'RISET')),
            ),
            if (running && job != null) ...[
              const SizedBox(height: 14),
              _Progress(job: job, onStop: () => guard(context, _api.stop)),
            ],
            const SizedBox(height: 24),
            const Label('Riset sebelumnya'),
            const SizedBox(height: 8),
            if (!_loaded)
              const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator(strokeWidth: 2)))
            else if (_reports.isEmpty)
              Panel(child: Text('Belum ada riset. Isi industri dan wilayah di atas.', style: t.bodySmall))
            else
              ..._reports.map((r) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: InkWell(
                      onTap: () => _open(r.id),
                      child: Panel(
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('${r.industry} · ${r.area}', style: t.titleMedium),
                                  const SizedBox(height: 2),
                                  Text(fmtDate(r.created, withTime: true), style: t.bodySmall),
                                ],
                              ),
                            ),
                            const Icon(Icons.chevron_right, color: RaqioColors.faint),
                          ],
                        ),
                      ),
                    ),
                  )),
          ],
        ),
      ),
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress({required this.job, required this.onStop});
  final JobLog job;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final step = job.step;
    final pct = step == 0 ? 0.03 : ((step - 1) / 5 + 0.1).clamp(0.0, 0.97);
    final sec = job.started == null ? 0 : (DateTime.now().millisecondsSinceEpoch ~/ 1000 - job.started!);
    final elapsed = '${sec ~/ 60}:${(sec % 60).toString().padLeft(2, '0')}';
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(job.status == 'queued' ? 'Menunggu giliran worker' : 'Riset sedang berjalan', style: t.titleMedium)),
              Text(elapsed, style: t.bodySmall),
              const SizedBox(width: 10),
              OutlinedButton(onPressed: onStop, child: const Text('HENTIKAN')),
            ],
          ),
          const SizedBox(height: 12),
          LinearProgressIndicator(value: pct, backgroundColor: RaqioColors.sunk, color: RaqioColors.text, minHeight: 3),
          const SizedBox(height: 10),
          ...List.generate(_steps.length, (i) {
            final done = i + 1 < step, now = i + 1 == step;
            return Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Text(
                '${done ? "✓" : now ? "●" : "○"} ${_steps[i]}',
                style: TextStyle(fontSize: 12, color: done ? RaqioColors.muted : now ? RaqioColors.text : RaqioColors.faint),
              ),
            );
          }),
          const SizedBox(height: 6),
          Text('Biasanya 2 sampai 4 menit. Boleh pindah tab sambil menunggu.', style: t.bodySmall),
        ],
      ),
    );
  }
}
