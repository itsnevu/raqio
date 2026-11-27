"use client";
import { useT } from "@/content/i18n";
import { Button } from "@/components/ui/Button";
import { ScrollRevealSection } from "@/components/ui/ScrollRevealSection";

/**
 * VideoCta: scale.com uses a foundry-tan panel (col-start-2, span 10) inside ScrollRevealSection bg-white.
 * Here the panel is --accent-2 with --ink text (7.01:1) and an ink button. A neutral report preview stands in for the video
 * (no extra accent, so at most two accents are on screen).
 */
const rows = [
  { name: "Klinik Sehat Sentosa", area: "Kebayoran Baru", score: 86 },
  { name: "Dental Care Plus", area: "Senopati", score: 74 },
  { name: "Klinik Pratama Melati", area: "Gandaria", score: 61 },
  { name: "Smile Studio", area: "Blok M", score: 48 },
];

export function VideoCta() {
  const { videoCta, ui } = useT();
  return (
    <ScrollRevealSection backdrop="bg-fg" theme="light" label={ui.sections.demo} className="pb-16 md:pb-24">
      <div className="grid-layout">
        <div className="relative col-span-8 isolate grid gap-10 overflow-hidden rounded-3xl bg-accent-2 p-8 text-ink md:col-span-10 md:col-start-2 md:min-h-[460px] md:grid-cols-2 md:items-center md:p-14">
          <div className="flex flex-col gap-5">
            <h2 className="header2 max-w-[14ch] text-balance">{videoCta.title}</h2>
            <p className="body1 max-w-[34ch]">{videoCta.body}</p>
            <div><Button href={videoCta.cta.href} variant="ink">{videoCta.cta.label}</Button></div>
          </div>
          {/* illustrative sample report (fictional businesses) */}
          <figure data-parallax="10" aria-label={ui.report.label} className="rounded-2xl bg-ink p-5 text-fg shadow-[0_30px_60px_-30px_rgb(10_10_15/.6)] md:p-6">
            <ul className="flex flex-col divide-y divide-line">
              {rows.map((r) => (
                <li key={r.name} className="flex items-center gap-4 py-3">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm">{r.name}</span><span className="block text-xs text-fg-muted">{r.area}</span></span>
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-fg/70" style={{ width: `${r.score}%` }} /></span>
                  <span className="w-8 text-right text-sm tabular-nums">{r.score}</span>
                </li>
              ))}
            </ul>
          </figure>
        </div>
      </div>
    </ScrollRevealSection>
  );
}
