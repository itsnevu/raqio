import 'dart:async';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../biz.dart';
import '../models.dart';
import '../theme.dart';
import 'compare_screen.dart';
import 'rank_screen.dart';
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
  String _mode = 'one'; // one = satu wilayah, cmp = bandingkan beberapa wilayah
  String _goal = 'client';
  List<ReportRow> _reports = [];
  bool _loaded = false;
  JobLog? _job;
  bool _wasRunning = false;
  Timer? _timer;
  Settings? _settings;
  List<Suggestion> _suggest = [];
  PublicStats? _stats;
  List<JobRow> _queue = [];
  ({String industry, List<String> areas})? _pendingCompare;
  String _info = ''; // status hasil instan / keterangan terakhir

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
    // saran pasangan instan dan angka publik: gagal pun tidak apa-apa
    api.suggest().then((s) => mounted ? setState(() => _suggest = s) : null).catchError((_) {});
    api.stats().then((s) => mounted ? setState(() => _stats = s) : null).catchError((_) {});
  }

  Future<void> _refreshQueue() async {
    try {
      final q = await _api.activeRuns();
      if (mounted) setState(() => _queue = q);
    } catch (_) {}
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
      if (_queue.isEmpty) _refreshQueue();
      _timer = Timer(const Duration(seconds: 2), _poll);
    } else if (_wasRunning) {
      await _load();
      if (!mounted) return;
      final pend = _pendingCompare;
      if (j.stopped) {
        toast(context, 'Riset dihentikan.');
        _pendingCompare = null;
      } else if (pend != null && j.compareDone) {
        _pendingCompare = null;
        toast(context, 'Perbandingan wilayah selesai.');
        final c = await guard(context, () => _api.compare(pend.industry, pend.areas));
        if (c != null && mounted) {
          Navigator.of(context).push(MaterialPageRoute(builder: (_) => CompareScreen(c: c)));
        }
      } else if (j.reportId != null) {
        toast(context, 'Riset selesai.');
        _open(j.reportId!);
      } else {
        toast(context, 'Gagal: ${j.lastLine}');
      }
      _refreshQueue();
    }
    _wasRunning = j.running;
  }

  Future<void> _run({bool fresh = false}) async {
    final ind = _industry.text.trim(), area = _area.text.trim();
    if (ind.isEmpty || area.isEmpty) {
      toast(context, 'Isi industri dan wilayah.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _info = '');
    if (_mode == 'cmp') {
      final areas = area.split(RegExp(r'[;\n]')).map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
      if (areas.length < 2) {
        toast(context, 'Isi minimal dua wilayah, pisahkan dengan titik koma (;).');
        return;
      }
      final job = await guard(context, () => _api.runCompare(ind, areas));
      if (job == null || !mounted) return;
      _pendingCompare = (industry: ind, areas: areas);
      _wasRunning = true;
      _refreshQueue();
      await _poll();
      return;
    }
    final key = '${ind.toLowerCase()}|${area.toLowerCase()}';
    final res = await guard(context, () async {
      await _api.saveSettings(goals: {key: _goal});
      return _api.runMarket(ind, area, fresh: fresh);
    });
    if (res == null || !mounted) return;
    if (res.cached && res.reportId != null) {
      // hasil instan: laporan pasangan ini masih segar, tidak perlu scraping ulang
      final age = res.ageHours < 1 ? 'kurang dari 1 jam' : res.ageHours < 48 ? '${res.ageHours} jam' : '${(res.ageHours / 24).round()} hari';
      setState(() => _info = 'Hasil instan dari riset $age lalu. Pakai tombol "Riset ulang" di laporan kalau butuh data paling baru.');
      toast(context, 'Hasil instan tersedia');
      await _load();
      if (mounted) _open(res.reportId!);
      return;
    }
    if (res.job == null) {
      toast(context, 'Server tidak mengembalikan id job.');
      return;
    }
    if (_job?.running == true) {
      toast(context, 'Masuk antrean riset');
      _refreshQueue();
      return;
    }
    _wasRunning = true;
    _refreshQueue();
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
      appBar: AppBar(
        title: const Text('Riset'),
        actions: [
          IconButton(
            icon: const Icon(Icons.leaderboard_outlined, size: 20),
            tooltip: 'Peringkat publik',
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RankScreen())),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Peta pasar industri apa pun.', style: t.headlineMedium),
            const SizedBox(height: 6),
            Text('Data dari Google Maps dan website bisnis, dibersihkan, tanpa duplikat. Sama dengan yang ada di web.', style: t.bodySmall),
            if (_stats != null && _stats!.reports > 0) ...[
              const SizedBox(height: 10),
              _StatsStrip(s: _stats!),
            ],
            const SizedBox(height: 16),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'one', label: Text('Satu wilayah')),
                ButtonSegment(value: 'cmp', label: Text('Bandingkan')),
              ],
              selected: {_mode},
              onSelectionChanged: (s) => setState(() => _mode = s.first),
              showSelectedIcon: false,
            ),
            const SizedBox(height: 10),
            if (_mode == 'one') ...[
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
            ] else ...[
              Text('Beberapa wilayah sekaligus, satu skor peluang per wilayah. Terlihat di mana pemain masih sedikit.', style: t.bodySmall),
              const SizedBox(height: 12),
            ],
            TextField(
              controller: _industry,
              decoration: const InputDecoration(labelText: 'Industri', hintText: 'mis. coffee shop, salon, digital agency'),
              textInputAction: TextInputAction.next,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _area,
              decoration: InputDecoration(
                labelText: _mode == 'cmp' ? 'Wilayah (pisahkan dengan ;)' : 'Wilayah',
                hintText: _mode == 'cmp' ? 'mis. Kemang; Senopati; BSD' : 'mis. Kemang Jakarta',
              ),
              textInputAction: TextInputAction.go,
              onSubmitted: (_) => _run(),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: running ? null : () => _run(),
                child: Text(running ? 'SEDANG RISET…' : _mode == 'cmp' ? 'BANDINGKAN' : 'RISET'),
              ),
            ),
            if (_suggest.isNotEmpty && !running) ...[
              const SizedBox(height: 10),
              const Label('Hasil instan tersedia'),
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: _suggest.take(6).map((s) => ActionChip(
                      label: Text('${s.industry} · ${s.area}', style: const TextStyle(fontSize: 12)),
                      onPressed: () {
                        setState(() {
                          _mode = 'one';
                          _industry.text = s.industry;
                          _area.text = s.area;
                        });
                        _run();
                      },
                    )).toList(),
              ),
            ],
            if (_info.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(_info, style: const TextStyle(color: RaqioColors.good, fontSize: 13)),
            ],
            if (running && job != null) ...[
              const SizedBox(height: 14),
              _Progress(job: job, queue: _queue, onStop: () => guard(context, _api.stop)),
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

/// Strip angka total data terkumpul (GET /stats, publik), port StatsStrip web.
class _StatsStrip extends StatelessWidget {
  const _StatsStrip({required this.s});
  final PublicStats s;

  @override
  Widget build(BuildContext context) {
    final items = <(String, String)>[
      (fmtNum(s.businesses), 'bisnis terkumpul'),
      (fmtNum(s.pairs), 'industri × wilayah'),
      (fmtNum(s.runs), 'riset dijalankan'),
      (fmtNum(s.chats), 'jawaban asisten'),
    ];
    return Panel(
      padding: EdgeInsets.zero,
      child: Row(
        children: [
          for (final (i, x) in items.indexed)
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                    border: Border(right: i == items.length - 1 ? BorderSide.none : const BorderSide(color: RaqioColors.line))),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(x.$1, style: const TextStyle(fontSize: 16, letterSpacing: -0.4)),
                  Text(x.$2, style: Theme.of(context).textTheme.labelSmall, maxLines: 2),
                ]),
              ),
            ),
        ],
      ),
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress({required this.job, required this.queue, required this.onStop});
  final JobLog job;
  final List<JobRow> queue;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final step = job.step;
    final cmp = job.compareProgress;
    double pct = step == 0 ? 0.03 : ((step - 1) / 5 + 0.1).clamp(0.0, 0.97);
    if (cmp != null) pct = ((cmp.i - 1 + (step - 1).clamp(0, 5) / 5) / cmp.n).clamp(0.0, 0.97);
    final sec = job.started == null ? 0 : (DateTime.now().millisecondsSinceEpoch ~/ 1000 - job.started!);
    final elapsed = '${sec ~/ 60}:${(sec % 60).toString().padLeft(2, '0')}';
    final waiting = queue.length > 1 ? queue.sublist(1) : const <JobRow>[];
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
          if (cmp != null) ...[
            const SizedBox(height: 6),
            Text('Wilayah ${cmp.i} dari ${cmp.n}: ${cmp.area}', style: t.bodySmall),
          ],
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
          Text('Biasanya 2 sampai 4 menit per wilayah. Boleh pindah tab sambil menunggu.', style: t.bodySmall),
          if (waiting.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Antrean berikutnya: ${waiting.map((w) => w.label).join(" · ")}', style: t.bodySmall),
          ],
        ],
      ),
    );
  }
}
