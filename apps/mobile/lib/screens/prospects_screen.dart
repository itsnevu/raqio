import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../biz.dart';
import '../models.dart';
import '../theme.dart';
import 'campaigns_screen.dart';
import 'place_sheet.dart';
import 'report_screen.dart' show PlaceTile;

const _next = {'baru': 'dihubungi', 'dihubungi': 'tertarik', 'tertarik': 'deal'};

String _stOf(Place p) {
  final s = p.lead?.status ?? '';
  return s.isEmpty ? 'baru' : s;
}

bool _isDue(Place p) {
  final l = p.lead;
  if (l == null || l.remind.isEmpty) return false;
  final today = DateTime.now().toIso8601String().substring(0, 10);
  return l.remind.compareTo(today) <= 0 && l.status != 'deal' && l.status != 'tolak';
}

/// Papan prospek lintas laporan. Di HP, kolom kanban jadi tab per status.
class ProspectsScreen extends StatefulWidget {
  const ProspectsScreen({super.key});

  @override
  State<ProspectsScreen> createState() => _ProspectsScreenState();
}

class _ProspectsScreenState extends State<ProspectsScreen> {
  List<Place>? _items;
  String _status = 'baru';
  bool _dueOnly = false;
  String _offer = '';
  String _q = '';
  String _area = ''; // batasi ke satu riset ("industri · wilayah"); kosong = semua
  final _offerCtl = TextEditingController();

  @override
  void dispose() {
    _offerCtl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  ApiClient get _api => ApiScope.of(context);

  Future<void> _load() async {
    final api = _api;
    final items = await guard(context, api.prospects);
    if (!mounted) return;
    final st = await guard(context, api.settings);
    if (!mounted) return;
    setState(() {
      if (items != null) _items = items;
      if (st != null) {
        _offer = st.offer;
        if (_offerCtl.text.isEmpty) _offerCtl.text = st.offer == defaultOffer ? '' : st.offer;
      }
    });
  }

  Future<void> _move(Place p, String status) async {
    if (_stOf(p) == status) return;
    final api = _api;
    final ok = await guardOk(context, () => api.setLead(p, status: status));
    if (!ok || !mounted) return;
    toast(context, '${p.name} dipindah ke ${leadLabel[status]}');
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final items = _items;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Prospek'),
        actions: [
          TextButton(
            onPressed: () async {
              await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CampaignsScreen(openWizard: true)));
              _load();
            },
            child: const Text('KAMPANYE', style: TextStyle(color: RaqioColors.good)),
          ),
        ],
      ),
      body: items == null
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
          : items.isEmpty
              ? Padding(padding: const EdgeInsets.all(16), child: Panel(child: Text('Belum ada prospek. Prospek muncul otomatis setelah kamu riset satu industri dan wilayah.', style: t.bodySmall)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: Builder(builder: (context) {
                    final due = items.where(_isDue).length;
                    int cnt(String s) => items.where((p) => _stOf(p) == s).length;
                    final areas = {for (final p in items) '${p.industry} · ${p.area}'}.toList();
                    final q = _q.toLowerCase();
                    final rows = items
                        .where((p) =>
                            _stOf(p) == _status &&
                            (!_dueOnly || _isDue(p)) &&
                            (_area.isEmpty || '${p.industry} · ${p.area}' == _area) &&
                            (q.isEmpty ||
                                '${p.name} ${p.area} ${p.industry} ${p.category} ${p.lead?.note ?? ""}'.toLowerCase().contains(q)))
                        .toList();
                    return ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Panel(
                          padding: EdgeInsets.zero,
                          child: Row(children: [
                            _Cell('Total', '${items.length}'),
                            _Cell('Jatuh tempo', '$due', color: due > 0 ? RaqioColors.bad : null),
                            _Cell('Berjalan', '${cnt("dihubungi") + cnt("tertarik")}'),
                            _Cell('Deal', '${cnt("deal")}', last: true),
                          ]),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          decoration: const InputDecoration(hintText: 'Cari nama, wilayah, catatan', prefixIcon: Icon(Icons.search, size: 18), isDense: true),
                          onChanged: (v) => setState(() => _q = v),
                        ),
                        const SizedBox(height: 8),
                        if (areas.length > 1)
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(children: [
                              Padding(
                                padding: const EdgeInsets.only(right: 6),
                                child: ChoiceChip(label: const Text('Semua riset'), selected: _area.isEmpty, showCheckmark: false, onSelected: (_) => setState(() => _area = '')),
                              ),
                              ...areas.map((a) => Padding(
                                    padding: const EdgeInsets.only(right: 6),
                                    child: ChoiceChip(label: Text(a), selected: _area == a, showCheckmark: false, onSelected: (_) => setState(() => _area = a)),
                                  )),
                            ]),
                          ),
                        if (areas.length > 1) const SizedBox(height: 8),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: [
                              ...leadStatuses.map((s) => Padding(
                                    padding: const EdgeInsets.only(right: 6),
                                    child: ChoiceChip(label: Text('${leadLabel[s]} ${cnt(s)}'), selected: _status == s, showCheckmark: false, onSelected: (_) => setState(() => _status = s)),
                                  )),
                              FilterChip(label: const Text('Jatuh tempo'), selected: _dueOnly, showCheckmark: false, onSelected: (v) => setState(() => _dueOnly = v)),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _offerCtl,
                          decoration: const InputDecoration(
                            labelText: 'Jasa yang kamu tawarkan (dipakai di draf pesan)',
                            hintText: 'mis. bikin website dan katalog online',
                            isDense: true,
                          ),
                          onSubmitted: (v) async {
                            final ok = await guardOk(context, () => _api.saveSettings(offer: v));
                            if (!ok || !mounted) return;
                            setState(() => _offer = v);
                            if (context.mounted) toast(context, 'Tersimpan, dipakai di semua draf pesan');
                          },
                        ),
                        const SizedBox(height: 10),
                        if (rows.isEmpty)
                          Panel(child: Text(_status == 'baru' ? 'Kosong. Mulai dari skor tertinggi di laporan.' : 'Kosong', style: t.bodySmall))
                        else
                          ...rows.map((p) {
                            final nxt = _next[_stOf(p)];
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Column(children: [
                                PlaceTile(
                                  p: p,
                                  subtitle: '${p.industry} · ${p.area}${p.rating != null ? " · ★ ${dec(p.rating)}" : ""}',
                                  onTap: () => showPlaceSheet(context, p, offer: _offer, onChange: () => setState(() {})),
                                ),
                                Container(
                                  decoration: const BoxDecoration(border: Border(left: BorderSide(color: RaqioColors.line), right: BorderSide(color: RaqioColors.line), bottom: BorderSide(color: RaqioColors.line))),
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  child: Row(children: [
                                    if (_isDue(p)) const Badge2('Follow up hari ini', color: RaqioColors.bad),
                                    if (p.lead?.note.isNotEmpty == true) Expanded(child: Text(p.lead!.note, style: t.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis)) else const Spacer(),
                                    if (waOf(p).isNotEmpty)
                                      TextButton(
                                        onPressed: () async {
                                          await openUrl(context, '${waOf(p)}?text=${Uri.encodeComponent(draft(p, industry: p.industry, area: p.area, offer: _offer))}');
                                          if (_stOf(p) == 'baru') _move(p, 'dihubungi');
                                        },
                                        child: const Text('WhatsApp', style: TextStyle(color: RaqioColors.good)),
                                      ),
                                    if (nxt != null) TextButton(onPressed: () => _move(p, nxt), child: Text('${leadLabel[nxt]} →')),
                                  ]),
                                ),
                              ]),
                            );
                          }),
                      ],
                    );
                  }),
                ),
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell(this.l, this.v, {this.color, this.last = false});
  final String l, v;
  final Color? color;
  final bool last;
  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(border: Border(right: last ? BorderSide.none : const BorderSide(color: RaqioColors.line))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Label(l),
            Text(v, style: TextStyle(fontSize: 24, letterSpacing: -0.8, color: color)),
          ]),
        ),
      );
}
