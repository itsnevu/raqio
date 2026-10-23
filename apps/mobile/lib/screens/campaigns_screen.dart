import 'dart:async';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../biz.dart';
import '../models.dart';
import '../theme.dart';
import 'campaign_detail_screen.dart';

/// Kampanye: dari riset ke klien. Kirim pesan personal ke prospek lewat WhatsApp, Instagram, atau
/// email; setiap kiriman otomatis menandai prospek "dihubungi". Port halaman /campaigns web.
class CampaignsScreen extends StatefulWidget {
  const CampaignsScreen({super.key, this.openWizard = false});

  /// true = langsung buka wizard kampanye baru (dari tombol di papan Prospek).
  final bool openWizard;

  @override
  State<CampaignsScreen> createState() => _CampaignsScreenState();
}

class _CampaignsScreenState extends State<CampaignsScreen> {
  List<Campaign>? _list;
  Map<String, CampaignTemplate> _templates = {};
  bool _wizardOpened = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  ApiClient get _api => ApiScope.of(context);

  Future<void> _load() async {
    final r = await guard(context, _api.campaigns);
    if (!mounted || r == null) return;
    setState(() {
      _list = r.campaigns;
      _templates = r.templates;
    });
    if (widget.openWizard && !_wizardOpened) {
      _wizardOpened = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _new());
    }
  }

  Future<void> _new() async {
    if (_templates.isEmpty) return;
    final id = await Navigator.of(context).push<int>(MaterialPageRoute(builder: (_) => NewCampaignScreen(templates: _templates)));
    if (id != null && mounted) {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => CampaignDetailScreen(id: id)));
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final list = _list;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Kampanye'),
        actions: [
          TextButton(onPressed: _templates.isEmpty ? null : _new, child: const Text('+ BARU', style: TextStyle(color: RaqioColors.good))),
        ],
      ),
      body: list == null
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    'Pesan personal ke prospek lewat WhatsApp, Instagram, atau email, lengkap dengan tautan audit per bisnis. Setiap kiriman otomatis menandai prospek "dihubungi".',
                    style: t.bodySmall,
                  ),
                  const SizedBox(height: 14),
                  if (list.isEmpty)
                    Panel(child: Text('Belum ada kampanye. Buat satu dari prospek di papan: pilih saluran, cek pratinjau pesan, lalu kirim.', style: t.bodySmall)),
                  ...list.map((c) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: InkWell(
                          onTap: () async {
                            await Navigator.of(context).push(MaterialPageRoute(builder: (_) => CampaignDetailScreen(id: c.id)));
                            _load();
                          },
                          child: Panel(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(children: [
                                  Expanded(child: Text(c.name, style: t.titleMedium)),
                                  Badge2(campaignStatusLabel[c.status] ?? c.status,
                                      color: c.status == 'running' ? RaqioColors.good : RaqioColors.muted),
                                ]),
                                const SizedBox(height: 3),
                                Text(
                                  '${channelLabel[c.channel] ?? c.channel} · ${c.mode == "auto" ? "otomatis" : "satu klik"} · ${fmtDate(c.createdAt)}',
                                  style: t.bodySmall,
                                ),
                                const SizedBox(height: 8),
                                LinearProgressIndicator(
                                    value: c.progressPct / 100, backgroundColor: RaqioColors.sunk, color: RaqioColors.text, minHeight: 3),
                                const SizedBox(height: 6),
                                Text(
                                  '${(c.counts["sent"] ?? 0) + (c.counts["replied"] ?? 0)} terkirim · ${c.counts["replied"] ?? 0} dibalas · ${c.total} penerima',
                                  style: t.bodySmall,
                                ),
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

/// Wizard kampanye baru: pilih prospek, saluran dan cara kirim, pesan + pratinjau.
class NewCampaignScreen extends StatefulWidget {
  const NewCampaignScreen({super.key, required this.templates});
  final Map<String, CampaignTemplate> templates;

  @override
  State<NewCampaignScreen> createState() => _NewCampaignScreenState();
}

class _NewCampaignScreenState extends State<NewCampaignScreen> {
  String _channel = 'whatsapp';
  String _mode = 'manual';
  final _name = TextEditingController();
  late final _subject = TextEditingController(text: widget.templates['email']?.subject ?? '');
  late final _template = TextEditingController(text: widget.templates['whatsapp']?.body ?? '');
  final _area = TextEditingController();
  int _throttle = 90;
  int _minScore = 50;
  final Set<String> _statuses = {'baru'};
  int _limit = 50;
  CampaignPreview? _preview;
  bool _busy = false;
  String _error = '';
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _refreshPreview();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    for (final c in [_name, _subject, _template, _area]) {
      c.dispose();
    }
    super.dispose();
  }

  ApiClient get _api => ApiScope.of(context);

  Map<String, Object?> get _select => {'min_score': _minScore, 'area': _area.text.trim(), 'statuses': _statuses.toList(), 'limit': _limit};

  void _refreshPreview() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      try {
        final p = await _api.previewCampaign(channel: _channel, template: _template.text, subject: _subject.text, select: _select);
        if (mounted) setState(() => _preview = p);
      } catch (_) {
        if (mounted) setState(() => _preview = null);
      }
    });
  }

  void _pickChannel(String ch) {
    setState(() {
      _channel = ch;
      _template.text = widget.templates[ch]?.body ?? '';
      if (!canAuto(ch)) _mode = 'manual';
    });
    _refreshPreview();
  }

  Future<void> _create() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final r = await _api.createCampaign(
        name: _name.text.trim(),
        channel: _channel,
        mode: _mode,
        subject: _subject.text,
        template: _template.text,
        throttleSec: _throttle,
        select: _select,
      );
      if (!mounted) return;
      if (r.skipped > 0) {
        toast(context,
            '${r.skipped} prospek dilewati karena tidak punya ${_channel == "email" ? "email" : _channel == "instagram" ? "akun Instagram" : "nomor WhatsApp"}');
      }
      Navigator.of(context).pop(r.id);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String get _hint => switch (_channel) {
        'whatsapp' => _mode == 'auto'
            ? 'Dikirim worker lewat gateway WhatsApp Business (Fonnte, Wablas, atau generic) dengan jeda antar pesan. Atur di Akun > Pengirim.'
            : 'Tiap prospek dibuka di wa.me dengan pesan sudah terisi; kamu tinggal tekan kirim. Aman dari pemblokiran nomor.',
        'instagram' => 'Instagram selalu satu klik: profil dibuka, pesan disalin otomatis. DM massal otomatis membuat akun diblokir.',
        _ => _mode == 'auto'
            ? 'Dikirim worker lewat SMTP dengan jeda, membawa tautan berhenti berlangganan. Butuh email terverifikasi.'
            : 'Dibuka di aplikasi email kamu dengan subjek dan isi terisi.',
      };

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final p = _preview;
    return Scaffold(
      appBar: AppBar(title: const Text('Kampanye baru')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Label('1. Pilih prospek'),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: TextFormField(
                initialValue: '$_minScore',
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Skor minimal'),
                onChanged: (v) {
                  _minScore = int.tryParse(v) ?? 50;
                  _refreshPreview();
                },
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextFormField(
                initialValue: '$_limit',
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Maks penerima'),
                onChanged: (v) {
                  _limit = int.tryParse(v) ?? 50;
                  _refreshPreview();
                },
              ),
            ),
          ]),
          const SizedBox(height: 8),
          TextField(
            controller: _area,
            decoration: const InputDecoration(labelText: 'Wilayah (opsional)', hintText: 'mis. Kemang'),
            onChanged: (_) => _refreshPreview(),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            children: ['baru', 'dihubungi', 'tertarik']
                .map((s) => FilterChip(
                      label: Text(leadLabel[s] ?? s),
                      selected: _statuses.contains(s),
                      showCheckmark: false,
                      onSelected: (on) {
                        setState(() => on ? _statuses.add(s) : _statuses.remove(s));
                        _refreshPreview();
                      },
                    ))
                .toList(),
          ),
          const SizedBox(height: 6),
          Text(p != null ? '${p.matched} prospek cocok, ${p.reachable} punya kontak untuk saluran ini.' : 'Menghitung…', style: t.bodySmall),
          const Divider(height: 28),
          const Label('2. Saluran dan cara kirim'),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            segments: campaignChannels.map((ch) => ButtonSegment(value: ch, label: Text(channelLabel[ch]!))).toList(),
            selected: {_channel},
            onSelectionChanged: (s) => _pickChannel(s.first),
            showSelectedIcon: false,
          ),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            segments: [
              const ButtonSegment(value: 'manual', label: Text('Satu klik (aman)')),
              ButtonSegment(value: 'auto', label: const Text('Otomatis'), enabled: canAuto(_channel)),
            ],
            selected: {_mode},
            onSelectionChanged: (s) => setState(() => _mode = s.first),
            showSelectedIcon: false,
          ),
          const SizedBox(height: 8),
          Text(_hint, style: t.bodySmall),
          if (_mode == 'auto') ...[
            const SizedBox(height: 8),
            TextFormField(
              initialValue: '$_throttle',
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Jeda antar pesan (detik)'),
              onChanged: (v) => _throttle = int.tryParse(v) ?? 90,
            ),
          ],
          const SizedBox(height: 8),
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'Nama kampanye (opsional)', hintText: 'mis. Coffee shop Kemang, Oktober')),
          const Divider(height: 28),
          const Label('3. Pesan'),
          const SizedBox(height: 8),
          if (_channel == 'email') ...[
            TextField(controller: _subject, decoration: const InputDecoration(labelText: 'Subjek'), onChanged: (_) => _refreshPreview()),
            const SizedBox(height: 8),
          ],
          TextField(
            controller: _template,
            maxLines: 8,
            decoration: const InputDecoration(labelText: 'Template'),
            onChanged: (_) => _refreshPreview(),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 4,
            runSpacing: 4,
            children: campaignVars
                .map((v) => ActionChip(
                      label: Text(v, style: const TextStyle(fontSize: 11)),
                      onPressed: () {
                        _template.text = '${_template.text} $v';
                        _refreshPreview();
                      },
                    ))
                .toList(),
          ),
          const SizedBox(height: 12),
          Panel(
            color: RaqioColors.sunk,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Label('Pratinjau untuk ${p?.sampleName.isNotEmpty == true ? p!.sampleName : "prospek pertama"}'),
              if (_channel == 'email' && p?.subject.isNotEmpty == true) ...[
                const SizedBox(height: 6),
                Text('Subjek: ${p!.subject}', style: t.bodySmall),
              ],
              const SizedBox(height: 8),
              Text(p?.rendered.isNotEmpty == true ? p!.rendered : '(tidak ada prospek yang cocok)', style: t.bodySmall),
            ]),
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(_error, style: const TextStyle(color: RaqioColors.bad, fontSize: 13)),
          ],
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _busy || p == null || p.reachable == 0 ? null : _create,
              child: Text(_busy ? 'MEMBUAT…' : 'BUAT KAMPANYE (${p?.reachable ?? 0} PENERIMA)'),
            ),
          ),
          const SizedBox(height: 30),
        ],
      ),
    );
  }
}
