import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app.dart';
import '../biz.dart';
import '../models.dart';
import '../theme.dart';

/// Panel detail bisnis (bottom sheet): kontak, WhatsApp dengan draf, cek kontak, status follow up.
Future<void> showPlaceSheet(
  BuildContext context,
  Place p, {
  int? reportId,
  String? industry,
  String? area,
  String offer = '',
  VoidCallback? onChange,
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (context, scroll) => _PlaceSheet(
        p: p,
        reportId: reportId ?? p.reportId,
        industry: industry ?? p.industry,
        area: area ?? p.area,
        offer: offer,
        onChange: onChange,
        scroll: scroll,
      ),
    ),
  );
}

Future<void> openUrl(BuildContext context, String url) async {
  final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) toast(context, 'Tidak bisa membuka tautan.');
}

class _PlaceSheet extends StatefulWidget {
  const _PlaceSheet({required this.p, required this.reportId, required this.industry, required this.area, required this.offer, required this.onChange, required this.scroll});
  final Place p;
  final int? reportId;
  final String industry;
  final String area;
  final String offer;
  final VoidCallback? onChange;
  final ScrollController scroll;

  @override
  State<_PlaceSheet> createState() => _PlaceSheetState();
}

class _PlaceSheetState extends State<_PlaceSheet> {
  late String _status = widget.p.lead?.status ?? '';
  late final _note = TextEditingController(text: widget.p.lead?.note ?? '');
  late String _remind = widget.p.lead?.remind ?? '';
  bool _checking = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Place get p => widget.p;
  String get _draft => draft(p, industry: widget.industry, area: widget.area, offer: widget.offer);

  Future<void> _check() async {
    final rid = widget.reportId;
    if (rid == null) return;
    setState(() => _checking = true);
    final got = await guard(context, () => ApiScope.of(context).detail(rid, p.key));
    if (!mounted) return;
    setState(() => _checking = false);
    if (got != null) {
      p.merge(got.raw);
      widget.onChange?.call();
      toast(context, 'Kontak diperbarui');
      setState(() {});
    }
  }

  Future<void> _save() async {
    final api = ApiScope.of(context);
    final ok = await guardOk(context, () => api.setLead(p, status: _status.isEmpty ? 'baru' : _status, note: _note.text, remind: _remind));
    if (!ok || !mounted) return;
    widget.onChange?.call();
    toast(context, 'Tersimpan');
  }

  Future<void> _wa() async {
    final wa = waOf(p);
    if (wa.isEmpty) return;
    await openUrl(context, '$wa?text=${Uri.encodeComponent(_draft)}');
    if (!mounted) return;
    if (_status.isEmpty || _status == 'baru') {
      setState(() => _status = 'dihubungi');
      await _save();
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final wa = waOf(p);
    final unk = Text(p.detailed ? 'tidak ada' : 'belum dicek', style: const TextStyle(color: RaqioColors.faint));
    return ListView(
      controller: widget.scroll,
      padding: const EdgeInsets.fromLTRB(18, 14, 18, 30),
      children: [
        Text(p.name, style: t.titleLarge),
        const SizedBox(height: 2),
        Text([if (p.category.isNotEmpty) p.category, if (widget.area.isNotEmpty) widget.area].join(' · '), style: t.bodySmall),
        const SizedBox(height: 12),
        Panel(
          padding: EdgeInsets.zero,
          child: Row(children: [
            _Big(p.rating == null ? '-' : dec(p.rating), 'rating'),
            _Big(fmtNum(p.reviews), 'ulasan'),
            _Big(p.leadScore?.toString() ?? '-', 'skor prospek', last: true),
          ]),
        ),
        if (p.leadReasons.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(spacing: 4, runSpacing: 4, children: p.leadReasons.map((x) => Badge2(x)).toList()),
        ],
        const Divider(height: 28),
        const Label('Kontak'),
        const SizedBox(height: 8),
        _Kv('Telepon', p.phone.isNotEmpty ? Text(fmtPhone(p)) : unk),
        _Kv('Website', p.website.isNotEmpty ? _Link(host(p.website), p.website) : unk),
        _Kv('Instagram', p.instagram.isNotEmpty ? _Link('@${p.instagram}', 'https://instagram.com/${p.instagram}') : unk),
        _Kv('Email', p.emails.isNotEmpty ? Text(p.emails.join('\n')) : const Text('tidak ada', style: TextStyle(color: RaqioColors.faint))),
        _Kv('Alamat', Text(p.address.isEmpty ? '-' : p.address)),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          if (wa.isNotEmpty)
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: RaqioColors.good, foregroundColor: RaqioColors.bg),
              onPressed: _wa,
              icon: const Icon(Icons.chat, size: 16),
              label: const Text('KIRIM WHATSAPP'),
            ),
          if (p.mapsUrl.isNotEmpty) OutlinedButton(onPressed: () => openUrl(context, p.mapsUrl), child: const Text('BUKA DI MAPS')),
          if (!p.detailed && widget.reportId != null)
            OutlinedButton(onPressed: _checking ? null : _check, child: Text(_checking ? 'MEMBUKA GOOGLE MAPS… (±15 DETIK)' : 'CEK KONTAK SEKARANG')),
        ]),
        const Divider(height: 28),
        const Label('Follow up'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: leadStatuses
              .map((s) => ChoiceChip(label: Text(leadLabel[s]!), selected: _status == s, showCheckmark: false, onSelected: (_) => setState(() => _status = s)))
              .toList(),
        ),
        const SizedBox(height: 12),
        TextField(controller: _note, maxLines: 2, decoration: const InputDecoration(labelText: 'Catatan', hintText: 'mis. pemiliknya Pak Budi, minta dihubungi sore')),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: Text(_remind.isEmpty ? 'Tanpa pengingat' : 'Ingatkan ${fmtDate(_remind)}', style: t.bodySmall)),
          TextButton(
            onPressed: () async {
              final d = await showDatePicker(context: context, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)), initialDate: DateTime.now());
              if (d != null) setState(() => _remind = d.toIso8601String().substring(0, 10));
            },
            child: const Text('Pilih tanggal'),
          ),
          if (_remind.isNotEmpty) TextButton(onPressed: () => setState(() => _remind = ''), child: const Text('Hapus')),
        ]),
        const SizedBox(height: 6),
        SizedBox(width: double.infinity, child: FilledButton(onPressed: _save, child: const Text('SIMPAN'))),
        const Divider(height: 28),
        const Label('Draf pesan'),
        const SizedBox(height: 8),
        Text(_draft, style: t.bodySmall),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: _draft));
            if (context.mounted) toast(context, 'Draf tersalin');
          },
          child: const Text('SALIN DRAF'),
        ),
      ],
    );
  }
}

class _Big extends StatelessWidget {
  const _Big(this.v, this.l, {this.last = false});
  final String v, l;
  final bool last;
  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(border: Border(right: last ? BorderSide.none : const BorderSide(color: RaqioColors.line))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(v, style: const TextStyle(fontSize: 24, letterSpacing: -0.8)),
            Text(l, style: Theme.of(context).textTheme.bodySmall),
          ]),
        ),
      );
}

class _Kv extends StatelessWidget {
  const _Kv(this.k, this.v);
  final String k;
  final Widget v;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 90, child: Text(k, style: Theme.of(context).textTheme.bodySmall)),
          Expanded(child: v),
        ]),
      );
}

class _Link extends StatelessWidget {
  const _Link(this.text, this.url);
  final String text, url;
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () => openUrl(context, url),
        child: Text(text, style: const TextStyle(decoration: TextDecoration.underline, decorationColor: RaqioColors.faint)),
      );
}
