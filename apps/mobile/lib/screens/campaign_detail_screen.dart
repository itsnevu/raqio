import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/client.dart';
import '../app.dart';
import '../biz.dart';
import '../models.dart';
import '../theme.dart';
import 'place_sheet.dart' show openUrl;

/// Detail kampanye: progres, daftar penerima, dan alur kirim satu klik (mode manual).
/// Port halaman /campaigns/[id] web.
class CampaignDetailScreen extends StatefulWidget {
  const CampaignDetailScreen({super.key, required this.id});
  final int id;

  @override
  State<CampaignDetailScreen> createState() => _CampaignDetailScreenState();
}

class _CampaignDetailScreenState extends State<CampaignDetailScreen> {
  Campaign? _c;
  List<Recipient> _recipients = [];
  NextRecipient? _next;
  bool _busy = false;
  Timer? _autoTimer;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _autoTimer?.cancel();
    super.dispose();
  }

  ApiClient get _api => ApiScope.of(context);

  Future<void> _load() async {
    final d = await guard(context, () => _api.campaign(widget.id));
    if (!mounted || d == null) return;
    NextRecipient? next;
    if (d.campaign.mode == 'manual' && d.campaign.status == 'running') {
      next = await guard(context, () => _api.nextRecipient(widget.id));
      if (!mounted) return;
    }
    setState(() {
      _c = d.campaign;
      _recipients = d.recipients;
      _next = next;
    });
    // mode otomatis: worker yang mengirim, muat ulang berkala untuk melihat progres
    _autoTimer?.cancel();
    if (d.campaign.mode == 'auto' && d.campaign.status == 'running') {
      _autoTimer = Timer(const Duration(seconds: 15), _load);
    }
  }

  Future<void> _act(Future<void> Function() fn, String okMsg) async {
    setState(() => _busy = true);
    final ok = await guardOk(context, fn);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      toast(context, okMsg);
      _load();
    }
  }

  Future<void> _mark(String status) async {
    final r = _next?.recipient;
    if (r == null) return;
    await _act(() => _api.markRecipient(widget.id, r.id, status), status == 'sent' ? 'Ditandai terkirim' : 'Dilewati');
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final c = _c;
    if (c == null) {
      return Scaffold(appBar: AppBar(title: const Text('Kampanye')), body: const Center(child: CircularProgressIndicator(strokeWidth: 2)));
    }
    final r = _next?.recipient;
    return Scaffold(
      appBar: AppBar(
        title: Text(c.name),
        actions: [
          if (c.status == 'draft')
            TextButton(onPressed: _busy ? null : () => _act(() => _api.startCampaign(c.id), 'Kampanye dimulai'), child: const Text('MULAI', style: TextStyle(color: RaqioColors.good))),
          if (c.status == 'paused')
            TextButton(onPressed: _busy ? null : () => _act(() => _api.startCampaign(c.id), 'Dilanjutkan'), child: const Text('LANJUTKAN', style: TextStyle(color: RaqioColors.good))),
          if (c.status == 'running')
            TextButton(onPressed: _busy ? null : () => _act(() => _api.pauseCampaign(c.id), 'Dijeda'), child: const Text('JEDA')),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              '${channelLabel[c.channel] ?? c.channel} · ${c.mode == "auto" ? "otomatis" : "satu klik"} · ${campaignStatusLabel[c.status] ?? c.status} · ${c.progressPct}% dari ${c.total} penerima',
              style: t.bodySmall,
            ),
            const SizedBox(height: 8),
            LinearProgressIndicator(value: c.progressPct / 100, backgroundColor: RaqioColors.sunk, color: RaqioColors.text, minHeight: 3),
            const SizedBox(height: 14),
            if (c.mode == 'manual' && c.status == 'running' && r != null)
              Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text('Kirim ke ${r.name}', style: t.titleMedium)),
                    Text('${_next!.left} tersisa', style: t.bodySmall),
                  ]),
                  Text(r.toAddr, style: t.bodySmall),
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    color: RaqioColors.sunk,
                    child: Text(r.rendered, style: t.bodySmall),
                  ),
                  const SizedBox(height: 10),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: RaqioColors.good, foregroundColor: RaqioColors.bg),
                      onPressed: r.link.isEmpty ? null : () => openUrl(context, r.link),
                      child: Text(c.channel == 'whatsapp'
                          ? 'BUKA WHATSAPP'
                          : c.channel == 'instagram'
                              ? 'BUKA PROFIL IG'
                              : 'BUKA EMAIL'),
                    ),
                    OutlinedButton(
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: r.rendered));
                        if (context.mounted) toast(context, 'Pesan tersalin');
                      },
                      child: const Text('SALIN PESAN'),
                    ),
                    if (r.auditUrl.isNotEmpty) OutlinedButton(onPressed: () => openUrl(context, r.auditUrl), child: const Text('LIHAT AUDIT')),
                    OutlinedButton(onPressed: _busy ? null : () => _mark('sent'), child: const Text('SUDAH DIKIRIM')),
                    TextButton(onPressed: _busy ? null : () => _mark('skipped'), child: const Text('Lewati')),
                  ]),
                  if (c.channel == 'instagram') ...[
                    const SizedBox(height: 6),
                    Text('Pesan disalin, tempel di DM profil yang terbuka. Satu per satu supaya akunmu aman.', style: t.bodySmall),
                  ],
                ]),
              ),
            if (c.mode == 'manual' && c.status == 'running' && _next?.done == true)
              Panel(child: Text('Semua penerima sudah diproses.', style: t.bodySmall)),
            if (c.mode == 'auto' && c.status == 'running')
              Panel(child: Text('Worker sedang mengirim dengan jeda ${c.throttleSec} detik. Daftar di bawah diperbarui otomatis.', style: t.bodySmall)),
            const SizedBox(height: 14),
            const Label('Penerima'),
            const SizedBox(height: 8),
            ..._recipients.map((x) => Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: RaqioColors.line))),
                  child: Row(children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(x.name),
                        Text(
                          [if (x.toAddr.isNotEmpty) x.toAddr, if (x.sentAt != null && x.sentAt!.isNotEmpty) fmtDate(x.sentAt!, withTime: true), if (x.error.isNotEmpty) x.error]
                              .join(' · '),
                          style: t.bodySmall,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ]),
                    ),
                    Badge2(
                      recipientStatusLabel[x.status] ?? x.status,
                      color: switch (x.status) {
                        'sent' || 'replied' => RaqioColors.good,
                        'failed' => RaqioColors.bad,
                        _ => RaqioColors.muted,
                      },
                    ),
                  ]),
                )),
            const SizedBox(height: 30),
          ],
        ),
      ),
    );
  }
}
