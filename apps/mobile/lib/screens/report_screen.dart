import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../biz.dart';
import '../models.dart';
import '../theme.dart';
import 'place_sheet.dart';

class ReportScreen extends StatefulWidget {
  const ReportScreen({super.key, required this.reportId, this.goals = const {}, this.offer = '', this.preloaded});
  final int reportId;

  /// Laporan yang sudah ada (tes dan pratinjau); kalau null diambil dari API.
  final Report? preloaded;
  final Map<String, String> goals;
  final String offer;

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  Report? _r;
  String _err = '';
  String _q = '';
  String _filter = 'all';
  late bool _rival;
  bool _watched = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  ApiClient get _api => ApiScope.of(context);

  Future<void> _load() async {
    try {
      final r = widget.preloaded ?? await _api.report(widget.reportId);
      _rival = widget.goals['${r.industry.toLowerCase()}|${r.area.toLowerCase()}'] == 'rival';
      if (mounted) setState(() => _r = r);
      // status pantau pasangan ini; gagal pun tidak apa-apa
      try {
        final ws = await _api.watches();
        if (mounted) {
          setState(() => _watched =
              ws.any((w) => w.industry.toLowerCase() == r.industry.toLowerCase() && w.area.toLowerCase() == r.area.toLowerCase()));
        }
      } catch (_) {}
    } on ApiException catch (e) {
      if (mounted) setState(() => _err = e.message);
    }
  }

  Future<void> _toggleWatch() async {
    final r = _r;
    if (r == null) return;
    final on = !_watched;
    final ok = await guardOk(context, () => _api.setWatch(r.industry, r.area, on: on, lastRun: r.created));
    if (!ok || !mounted) return;
    setState(() => _watched = on);
    toast(context, on ? 'Dipantau, riset ulang otomatis sesuai jadwal paket' : 'Pantauan dimatikan');
  }

  Future<void> _rerun() async {
    final r = _r;
    if (r == null) return;
    final res = await guard(context, () => _api.runMarket(r.industry, r.area, fresh: true));
    if (res != null && mounted) toast(context, 'Riset ulang dimulai, lihat tab Riset.');
  }

  void _openPlace(Place p) {
    final r = _r!;
    showPlaceSheet(context, p, reportId: r.id, industry: r.industry, area: r.area, offer: widget.offer, onChange: () => setState(() {}));
  }

  List<Place> _filtered() {
    final r = _r!;
    bool Function(Place) fn = switch (_filter) {
      'prospect' => (p) => isProspect(p, rival: _rival),
      'wa' => (p) => waOf(p).isNotEmpty,
      'noweb' => (p) => p.detailed && p.website.isEmpty,
      'gem' => isGem,
      'weak' => isWeak,
      _ => (_) => true,
    };
    var rows = r.all.where(fn);
    if (_q.isNotEmpty) {
      final q = _q.toLowerCase();
      rows = rows.where((p) => '${p.name} ${p.address} ${p.category} ${p.instagram} ${p.website}'.toLowerCase().contains(q));
    }
    final list = rows.toList();
    if (_filter == 'prospect') {
      list.sort((a, b) => (b.leadScore ?? -1).compareTo(a.leadScore ?? -1));
    } else {
      list.sort((a, b) => b.reviews.compareTo(a.reviews));
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final r = _r;
    if (r == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Laporan')),
        body: Center(child: _err.isEmpty ? const CircularProgressIndicator(strokeWidth: 2) : Text(_err)),
      );
    }
    final t = Theme.of(context).textTheme;
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${r.industry} · ${r.area}'),
            Text(fmtDate(r.created, withTime: true), style: t.labelSmall),
          ]),
          actions: [
            IconButton(
              icon: Icon(_watched ? Icons.radar : Icons.radar_outlined, size: 20, color: _watched ? RaqioColors.good : null),
              tooltip: _watched ? 'Dipantau (ketuk untuk matikan)' : 'Pantau mingguan',
              onPressed: _toggleWatch,
            ),
            IconButton(icon: const Icon(Icons.refresh, size: 20), tooltip: 'Riset ulang (data baru)', onPressed: _rerun),
          ],
          bottom: TabBar(
            indicatorColor: RaqioColors.text,
            labelColor: RaqioColors.text,
            unselectedLabelColor: RaqioColors.muted,
            labelStyle: const TextStyle(fontFamily: 'Albert Sans', fontSize: 11, letterSpacing: 0.8),
            tabs: [
              const Tab(text: 'RINGKASAN'),
              Tab(text: 'PEMAIN ${r.all.length}'),
              Tab(text: _rival ? 'PESAING' : 'PROSPEK ${r.all.where((p) => isProspect(p)).length}'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _Summary(r: r, rival: _rival, onSwap: () => setState(() => _rival = !_rival), onOpen: _openPlace),
            _Players(
              rows: _filtered(),
              total: r.all.length,
              filter: _filter,
              rival: _rival,
              onFilter: (f) => setState(() => _filter = f),
              onSearch: (q) => setState(() => _q = q),
              onOpen: _openPlace,
            ),
            _Prospects(r: r, rival: _rival, onOpen: _openPlace),
          ],
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.r, required this.rival, required this.onSwap, required this.onOpen});
  final Report r;
  final bool rival;
  final VoidCallback onSwap;
  final void Function(Place) onOpen;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final v = verdict(r, rival: rival);
    final s = r.summary, d = r.digital;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(child: Text(rival ? 'Dilihat sebagai pesaing' : 'Dilihat sebagai calon klien', style: t.bodySmall)),
            TextButton(onPressed: onSwap, child: Text(rival ? 'ubah jadi calon klien' : 'ubah jadi pesaing')),
          ],
        ),
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Label(rival ? 'Kesimpulan: posisi kamu di antara pesaing' : 'Kesimpulan: peluang dapat klien'),
              const SizedBox(height: 8),
              Text(v.headline, style: t.titleLarge),
              const SizedBox(height: 8),
              Text(v.why, style: t.bodyMedium?.copyWith(color: RaqioColors.muted)),
              if (!rival && selfWords.hasMatch(r.industry)) ...[
                const SizedBox(height: 8),
                Text('Hati-hati: "${r.industry}" terdengar seperti bisnismu sendiri. Kalau iya, daftar ini adalah pesaingmu, bukan calon klien.',
                    style: const TextStyle(color: RaqioColors.warn, fontSize: 13)),
              ],
              const Divider(height: 24),
              Text('Langkah berikutnya: ${v.next}', style: t.titleMedium),
              const SizedBox(height: 4),
              Text(v.nextDetail, style: t.bodySmall),
            ],
          ),
        ),
        const SizedBox(height: 8),
        ...v.reasons.map((x) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text(x.big, style: const TextStyle(fontSize: 30, letterSpacing: -1)),
                      const SizedBox(width: 6),
                      Padding(padding: const EdgeInsets.only(bottom: 5), child: Text(x.unit, style: t.bodySmall)),
                    ]),
                    const SizedBox(height: 4),
                    Text(x.text),
                    const SizedBox(height: 2),
                    Text(x.meta, style: t.bodySmall),
                  ],
                ),
              ),
            )),
        const SizedBox(height: 8),
        const Label('Angka lengkap'),
        const SizedBox(height: 8),
        Panel(
          padding: EdgeInsets.zero,
          child: GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 2.2,
            children: [
              _Stat('Bisnis', '${s.businesses}${s.capped ? "+" : ""}', s.capped ? 'bisa lebih banyak' : 'yang muncul di Maps'),
              _Stat('Rating rata-rata', s.avgRating == null ? '-' : dec(s.avgRating), 'median ${fmtNum(s.medianReviews)} ulasan'),
              _Stat('Total ulasan', fmtNum(s.totalReviews), 'seberapa ramai pasarnya'),
              _Stat('Porsi 3 teratas', '${s.top3Share}%', s.top3Share >= 50 ? 'dikuasai pemain besar' : s.top3Share >= 30 ? 'ada beberapa pemain kuat' : 'persaingan merata'),
              _Stat('Punya website', '${d.website}%', 'IG ${d.instagram}%, dari ${d.sampled} dicek'),
              _Stat('Bisa WhatsApp', '${d.whatsapp}%', 'dari sampel detail'),
            ],
          ),
        ),
        const SizedBox(height: 8),
        if (r.ratingBuckets.isNotEmpty || r.sizeBuckets.isNotEmpty) ...[
          Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (r.ratingBuckets.isNotEmpty) ...[
                const Label('Sebaran rating'),
                const SizedBox(height: 8),
                _Buckets(buckets: r.ratingBuckets),
              ],
              if (r.ratingBuckets.isNotEmpty && r.sizeBuckets.isNotEmpty) const SizedBox(height: 14),
              if (r.sizeBuckets.isNotEmpty) ...[
                const Label('Sebaran jumlah ulasan'),
                const SizedBox(height: 8),
                _Buckets(buckets: r.sizeBuckets),
              ],
            ]),
          ),
          const SizedBox(height: 8),
        ],
        if (r.aiStrategy != null && r.aiStrategy!.isNotEmpty) ...[
          Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Label('Strategi'),
              const SizedBox(height: 8),
              ...r.aiStrategy!.map((x) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Text('• $x'))),
            ]),
          ),
          const SizedBox(height: 8),
        ],
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Label('Temuan'),
            const SizedBox(height: 8),
            ...r.insights.map((x) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Text('• $x'))),
          ]),
        ),
        const SizedBox(height: 8),
        if (r.leaders.isNotEmpty)
          Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Label('Pemimpin pasar'),
              const SizedBox(height: 8),
              ...r.leaders.take(5).map((p) => ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(p.name),
                    subtitle: Text('★ ${dec(p.rating)} · ${fmtNum(p.reviews)} ulasan', style: t.bodySmall),
                    onTap: () => onOpen(p),
                  )),
            ]),
          ),
        const SizedBox(height: 60),
      ],
    );
  }
}

/// Batang horizontal sederhana untuk rating_buckets / size_buckets (pengganti grafik web).
class _Buckets extends StatelessWidget {
  const _Buckets({required this.buckets});
  final List<(String, int)> buckets;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final max = buckets.fold<int>(1, (a, b) => b.$2 > a ? b.$2 : a);
    return Column(
      children: buckets
          .map((b) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(children: [
                  SizedBox(width: 58, child: Text(b.$1, style: t.bodySmall)),
                  Expanded(
                    child: FractionallySizedBox(
                      alignment: Alignment.centerLeft,
                      widthFactor: (b.$2 / max).clamp(0.02, 1),
                      child: Container(height: 10, color: RaqioColors.sunk, foregroundDecoration: const BoxDecoration(border: Border.fromBorderSide(BorderSide(color: RaqioColors.line)))),
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(width: 30, child: Text('${b.$2}', style: t.bodySmall, textAlign: TextAlign.right)),
                ]),
              ))
          .toList(),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.sub);
  final String label, value, sub;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: const BoxDecoration(border: Border(right: BorderSide(color: RaqioColors.line), bottom: BorderSide(color: RaqioColors.line))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
          Label(label),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontSize: 24, letterSpacing: -0.8)),
          Text(sub, style: Theme.of(context).textTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
        ]),
      );
}

class _Players extends StatelessWidget {
  const _Players({required this.rows, required this.total, required this.filter, required this.rival, required this.onFilter, required this.onSearch, required this.onOpen});
  final List<Place> rows;
  final int total;
  final String filter;
  final bool rival;
  final void Function(String) onFilter;
  final void Function(String) onSearch;
  final void Function(Place) onOpen;

  @override
  Widget build(BuildContext context) {
    final filters = <(String, String)>[
      ('all', 'Semua'),
      if (!rival) ('prospect', 'Prospek'),
      ('wa', 'Bisa WhatsApp'),
      ('noweb', 'Tanpa website'),
      ('gem', 'Hidden gem'),
      ('weak', 'Rating rendah, ramai'),
    ];
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: TextField(
            decoration: const InputDecoration(hintText: 'Cari nama, alamat, kategori, @ig', prefixIcon: Icon(Icons.search, size: 18), isDense: true),
            onChanged: onSearch,
          ),
        ),
        SizedBox(
          height: 48,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            children: filters
                .map((f) => Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(label: Text(f.$2), selected: filter == f.$1, onSelected: (_) => onFilter(f.$1), showCheckmark: false),
                    ))
                .toList(),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Align(alignment: Alignment.centerLeft, child: Label('${rows.length} dari $total bisnis')),
        ),
        Expanded(
          child: rows.isEmpty
              ? const Center(child: Text('Tidak ada bisnis yang cocok.'))
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 70),
                  itemCount: rows.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 6),
                  itemBuilder: (context, i) => PlaceTile(p: rows[i], rival: rival, onTap: () => onOpen(rows[i])),
                ),
        ),
      ],
    );
  }
}

class _Prospects extends StatelessWidget {
  const _Prospects({required this.r, required this.rival, required this.onOpen});
  final Report r;
  final bool rival;
  final void Function(Place) onOpen;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    if (rival) {
      final leaders = r.leaders;
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Mode pelajari pesaing: tidak ada daftar prospek. Pelajari pemimpin pasar di bawah ini.', style: t.bodySmall),
          const SizedBox(height: 10),
          ...leaders.map((p) => Padding(padding: const EdgeInsets.only(bottom: 6), child: PlaceTile(p: p, rival: true, onTap: () => onOpen(p)))),
        ],
      );
    }
    final pros = r.all.where((p) => isProspect(p)).toList()..sort((a, b) => (b.leadScore ?? 0).compareTo(a.leadScore ?? 0));
    if (pros.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Panel(child: Text('Belum ada yang bisa dihubungi. Buka tab Pemain lalu tekan "Cek kontak" pada beberapa bisnis; prospeknya muncul di sini.', style: t.bodySmall)),
      );
    }
    final done = pros.where((p) => p.lead?.status.isNotEmpty == true).length;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 70),
      children: [
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('$done dari ${pros.length} sudah dihubungi', style: t.bodySmall),
            const SizedBox(height: 8),
            LinearProgressIndicator(value: pros.isEmpty ? 0 : done / pros.length, backgroundColor: RaqioColors.sunk, color: RaqioColors.good, minHeight: 4),
            const SizedBox(height: 8),
            Text('Diurutkan dari skor tertinggi. Ketuk untuk kirim WhatsApp dengan draf pesan dan tandai statusnya.', style: t.bodySmall),
          ]),
        ),
        const SizedBox(height: 8),
        ...pros.map((p) => Padding(padding: const EdgeInsets.only(bottom: 6), child: PlaceTile(p: p, rival: false, onTap: () => onOpen(p)))),
      ],
    );
  }
}

/// Baris bisnis yang dipakai di tab Pemain, Prospek, dan papan prospek.
class PlaceTile extends StatelessWidget {
  const PlaceTile({super.key, required this.p, required this.onTap, this.rival = false, this.subtitle});
  final Place p;
  final VoidCallback onTap;
  final bool rival;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final wa = waOf(p);
    final ls = p.leadScore;
    final st = p.lead?.status;
    return InkWell(
      onTap: onTap,
      child: Panel(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: Text(p.name, style: t.titleMedium)),
                if (ls != null) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    color: ls >= 60 ? RaqioColors.good : RaqioColors.sunk,
                    child: Text('$ls', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: ls >= 60 ? RaqioColors.bg : RaqioColors.muted)),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 3),
            Text(
              subtitle ?? [if (p.rating != null) '★ ${dec(p.rating)}', '${fmtNum(p.reviews)} ulasan', if (p.category.isNotEmpty) p.category].join(' · '),
              style: t.bodySmall,
            ),
            if (p.address.isNotEmpty) Text(p.address, style: t.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 6),
            Wrap(spacing: 4, runSpacing: 4, children: [
              if (isGem(p)) const Badge2('hidden gem', color: RaqioColors.good),
              if (isWeak(p)) const Badge2('rating rendah', color: RaqioColors.bad),
              if (p.branches > 1) Badge2('${p.branches} cabang'),
              if (isProspect(p, rival: rival)) const Badge2('prospek', color: RaqioColors.good),
              if (wa.isNotEmpty) const Badge2('WhatsApp'),
              if (p.instagram.isNotEmpty) Badge2('@${p.instagram}'),
              if (p.website.isNotEmpty) Badge2(host(p.website)),
              if (!p.detailed) const Badge2('belum dicek'),
              if (st != null && st.isNotEmpty) Badge2(leadLabel[st] ?? st, color: RaqioColors.text),
            ]),
          ],
        ),
      ),
    );
  }
}
