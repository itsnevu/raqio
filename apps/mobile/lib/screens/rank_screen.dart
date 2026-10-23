import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../biz.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/biz_avatar.dart';
import 'place_sheet.dart' show openUrl;

/// Peringkat publik: pasangan industri + wilayah dengan skor terbuka (port halaman /top web).
class RankScreen extends StatefulWidget {
  const RankScreen({super.key});

  @override
  State<RankScreen> createState() => _RankScreenState();
}

class _RankScreenState extends State<RankScreen> {
  List<RankPair>? _items;
  String _q = '';
  String _err = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final items = await ApiScope.of(context).rankPairs();
      if (mounted) setState(() => _items = items);
    } on ApiException catch (e) {
      if (mounted) setState(() => _err = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final items = _items;
    final shown = (items ?? const <RankPair>[])
        .where((p) => _q.isEmpty || '${p.industry} ${p.area}'.toLowerCase().contains(_q.toLowerCase()))
        .toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Peringkat')),
      body: items == null
          ? Center(child: _err.isEmpty ? const CircularProgressIndicator(strokeWidth: 2) : Text(_err))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text('Siapa yang terbaik di kotamu?', style: t.headlineMedium),
                  const SizedBox(height: 6),
                  Text(
                    'Peringkat bisnis lokal per industri dan wilayah dengan skor terbuka: rating terkoreksi jumlah ulasan, skala logaritmik, dan kemudahan dihubungi. Bukan sekadar siapa yang paling banyak ulasan.',
                    style: t.bodySmall,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    decoration: const InputDecoration(hintText: 'cari: coffee shop, salon, Kemang, Bandung…', prefixIcon: Icon(Icons.search, size: 18), isDense: true),
                    onChanged: (v) => setState(() => _q = v),
                  ),
                  const SizedBox(height: 12),
                  if (shown.isEmpty)
                    Panel(child: Text('Belum ada peringkat untuk pencarian itu. Minta riset di wilayahmu lewat tab Riset.', style: t.bodySmall)),
                  ...shown.map((p) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: InkWell(
                          onTap: () => Navigator.of(context)
                              .push(MaterialPageRoute(builder: (_) => RankDetailScreen(industry: p.industry, area: p.area))),
                          child: Panel(
                            child: Row(children: [
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(p.industry, style: t.titleMedium),
                                  Text(p.area, style: t.bodySmall),
                                  Text('${p.businesses} bisnis · ${fmtDate(p.updated)}', style: t.labelSmall),
                                ]),
                              ),
                              const Icon(Icons.chevron_right, color: RaqioColors.faint),
                            ]),
                          ),
                        ),
                      )),
                ],
              ),
            ),
    );
  }
}

class RankDetailScreen extends StatefulWidget {
  const RankDetailScreen({super.key, required this.industry, required this.area});
  final String industry;
  final String area;

  @override
  State<RankDetailScreen> createState() => _RankDetailScreenState();
}

class _RankDetailScreenState extends State<RankDetailScreen> {
  RankData? _data;
  String _err = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await ApiScope.of(context).rank(widget.industry, widget.area);
      if (mounted) setState(() => _data = d);
    } on ApiException catch (e) {
      if (mounted) setState(() => _err = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final d = _data;
    final api = ApiScope.of(context);
    return Scaffold(
      appBar: AppBar(title: Text('${widget.industry} · ${widget.area}')),
      body: d == null
          ? Center(child: _err.isEmpty ? const CircularProgressIndicator(strokeWidth: 2) : Padding(padding: const EdgeInsets.all(16), child: Text(_err)))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Diperbarui ${fmtDate(d.updated)} · ${d.total} bisnis dinilai', style: t.bodySmall),
                if (d.formula.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(d.formula, style: t.labelSmall),
                ],
                const SizedBox(height: 12),
                ...d.rows.map((r) => Container(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: RaqioColors.line))),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        SizedBox(
                          width: 28,
                          child: Text(r.rank > 0 ? '${r.rank}' : '–',
                              style: TextStyle(fontSize: 16, color: r.rank > 0 && r.rank <= 3 ? RaqioColors.good : RaqioColors.muted)),
                        ),
                        BizAvatar(api: api, name: r.name, logoKey: r.logoKey, size: 30),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            GestureDetector(
                              onTap: r.mapsUrl.isEmpty ? null : () => openUrl(context, r.mapsUrl),
                              child: Text(r.name, style: t.titleMedium),
                            ),
                            Text(
                              [
                                if (r.rating != null) '★ ${dec(r.rating)}',
                                '${fmtNum(r.reviews)} ulasan',
                                if (r.category.isNotEmpty) r.category,
                              ].join(' · '),
                              style: t.bodySmall,
                            ),
                            const SizedBox(height: 4),
                            Wrap(spacing: 4, runSpacing: 4, children: [
                              if (r.hiddenGem) const Badge2('hidden gem', color: RaqioColors.good),
                              if (r.tooFew) const Badge2('ulasan belum cukup'),
                              if (r.flagged) const Badge2('lonjakan ulasan', color: RaqioColors.warn),
                              if (r.hasWebsite) const Badge2('Web'),
                              if (r.hasInstagram) const Badge2('IG'),
                              if (r.hasWhatsapp) const Badge2('WA'),
                              if (r.branches > 1) Badge2('${r.branches} cabang'),
                            ]),
                          ]),
                        ),
                        Text(r.score.toStringAsFixed(1).replaceAll('.', ','),
                            style: const TextStyle(fontSize: 18, letterSpacing: -0.5, color: RaqioColors.text)),
                      ]),
                    )),
                const SizedBox(height: 30),
              ],
            ),
    );
  }
}
