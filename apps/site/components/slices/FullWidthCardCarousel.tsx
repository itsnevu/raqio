"use client";
import { useRef } from "react";
import { useT } from "@/content/i18n";
import { useDragCarousel, useScaleIn } from "@/lib/motion/hooks";
import { Glyph } from "@/components/ui/Glyph";
import { ArrowBox } from "@/components/ui/Button";

/** FullWidthCardCarousel: full-bleed drag track, 404px cards, 40px icon tile. Cards enter scale .96 → 1 + opacity (measured BaseCard, power2.inOut). */
export function FullWidthCardCarousel() {
  const { carousel, ui } = useT();
  const root = useRef<HTMLDivElement>(null); const track = useRef<HTMLUListElement>(null);
  const api = useDragCarousel(track);
  useScaleIn(root, "[data-card]", 0.96, 0.04);
  return (
    <div ref={root} className="relative py-16 md:py-24">
      <div className="overflow-hidden px-6">
        <ul ref={track} className="flex cursor-grab touch-pan-y gap-2 select-none will-change-transform">
          {carousel.cards.map((c) => (
            <li key={c.title} data-card className="w-[300px] shrink-0 md:w-[404px]">
              <a href="/demo" draggable={false} className="group/card flex h-full min-h-[320px] flex-col justify-between gap-10 rounded-card bg-card p-6 text-ink transition-colors duration-500 hover:bg-card-2 md:p-8">
                <Glyph name={({ map: "area", chart: "compare", chat: "inbox", bell: "monitor", pin: "areas" } as Record<string, string>)[c.icon] ?? c.icon} className="size-14 text-ink" />
                <span className="flex flex-col gap-3">
                  <span className="text-2xl leading-[1.25] tracking-[-.01em]">{c.title}</span>
                  <span className="flex items-center justify-between"><span className="detail-mono text-ink-muted">{c.tag}</span><ArrowBox tone="current" /></span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid-layout mt-10 items-center">
        <h2 className="header3 col-span-8 md:col-span-6 md:col-start-2">{carousel.title}</h2>
        <div className="col-span-8 flex gap-2 md:col-span-2 md:col-start-10 md:justify-end">
          {(["prev", "next"] as const).map((d) => (
            <button key={d} type="button" onClick={() => api.current[d]()} aria-label={d === "prev" ? ui.prev : ui.next} className="grid size-10 place-items-center rounded-md border border-ink/15 transition-colors hover:border-ink/50">
              <svg viewBox="0 0 16 16" className={`size-4 ${d === "prev" ? "rotate-180" : ""}`} aria-hidden><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
