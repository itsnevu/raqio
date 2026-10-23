import 'package:flutter/material.dart';

import '../biz.dart';
import '../models.dart';
import '../theme.dart';
import 'report_screen.dart';

/// Hasil mode Bandingkan: satu skor peluang per wilayah, terlihat di mana pemain masih sedikit.
class CompareScreen extends StatelessWidget {
  const CompareScreen({super.key, required this.c});
  final Compare c;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final areas = [...c.areas]..sort((a, b) => b.opportunity.compareTo(a.opportunity));
    return Scaffold(
      appBar: AppBar(title: Text('Bandingkan · ${c.industry}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Skor peluang 0–100 per wilayah: makin tinggi, makin terbuka pasarnya untukmu.', style: t.bodySmall),
          const SizedBox(height: 12),
          ...areas.asMap().entries.map((e) {
            final i = e.key;
            final a = e.value;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(a.area, style: t.titleLarge)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      color: i == 0 ? RaqioColors.good : RaqioColors.sunk,
                      child: Text('${a.opportunity}',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: i == 0 ? RaqioColors.bg : RaqioColors.text)),
                    ),
                  ]),
                  const SizedBox(height: 4),
                  Text('skor peluang${i == 0 ? " · paling terbuka" : ""}', style: t.bodySmall),
                  const SizedBox(height: 10),
                  Wrap(spacing: 4, runSpacing: 4, children: [
                    Badge2('${a.businesses}${a.capped ? "+" : ""} bisnis'),
                    Badge2('rating ${a.avgRating == null ? "-" : dec(a.avgRating)}'),
                    Badge2('3 teratas ${a.top3Share}%'),
                    Badge2('website ${a.websitePct}%'),
                    Badge2('WA ${a.whatsappPct}%'),
                    if (a.gems > 0) Badge2('${a.gems} hidden gem', color: RaqioColors.good),
                    if (a.weak > 0) Badge2('${a.weak} rapuh', color: RaqioColors.bad),
                    Badge2('${a.prospects} prospek', color: RaqioColors.good),
                  ]),
                  const SizedBox(height: 10),
                  OutlinedButton(
                    onPressed: a.reportId == 0
                        ? null
                        : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ReportScreen(reportId: a.reportId))),
                    child: const Text('BUKA LAPORAN'),
                  ),
                ]),
              ),
            );
          }),
          if (c.insights.isNotEmpty) ...[
            const SizedBox(height: 8),
            Panel(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Label('Temuan'),
                const SizedBox(height: 8),
                ...c.insights.map((x) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Text('• $x'))),
              ]),
            ),
          ],
          const SizedBox(height: 30),
        ],
      ),
    );
  }
}
