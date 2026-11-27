"use client";
import { useRef } from "react";
import Link from "next/link";
import { useT } from "@/content/i18n";
import { useScaleIn } from "@/lib/motion/hooks";
import { Glyph } from "@/components/ui/Glyph";
import { ArrowBox } from "@/components/ui/Button";

/**
 * CardGrid: 3 columns (measured 380px each, 8px gap), header5 titles, 64px icon tile.
 * Hover: a fill layer goes scaleY 0 → 1 from the bottom over 500ms ease-out (accent-2/3/4); the CTA rises y 10 → 0.
 * Text stays --ink, which passes on every fill (7.0 / 10.3 / 6.1:1).
 */
const fills = { a2: "bg-accent-2", a3: "bg-accent-3", a4: "bg-accent-4" };
export function CardGrid() {
  const { cardGrid, ui } = useT();
  const root = useRef<HTMLElement>(null);
  useScaleIn(root, "[data-card]", 0.96, 0.06);
  return (
    <section ref={root} data-theme="light" aria-label={ui.sections.products} className="relative bg-fg py-16 md:py-24">
      <div className="grid-layout">
        <h2 className="header3 col-span-8 mb-10 md:col-span-6 md:col-start-2">{cardGrid.title}</h2>
        <ul className="col-span-8 grid gap-2 md:col-span-10 md:col-start-2 md:grid-cols-2 xl:grid-cols-4">
          {cardGrid.cards.map((c) => (
            <li key={c.title} data-card>
              <Link href={c.cta.href} className="group/card relative flex h-full min-h-[420px] flex-col gap-6 overflow-hidden rounded-card bg-card p-6 text-ink xl:p-10">
                <span aria-hidden className={`absolute inset-0 origin-bottom scale-y-0 transition-transform duration-500 ease-out group-hover/card:scale-y-100 group-focus-visible/card:scale-y-100 ${fills[c.fill as keyof typeof fills]}`} />
                <Glyph name={({ search: "research", chat: "reach", chart: "close" } as Record<string, string>)[c.icon] ?? c.icon} className="relative size-16" />
                <h3 className="header5 relative">{c.title}</h3>
                <span className="relative mt-auto flex flex-col gap-6">
                  <span className="body2 text-ink-muted transition-colors duration-500 group-hover/card:text-ink">{c.body}</span>
                  <span className="inline-flex h-10 w-fit translate-y-2.5 items-center gap-3 rounded-md bg-fg pl-4 pr-1 text-sm font-medium opacity-90 transition-all duration-500 ease-out group-hover/card:translate-y-0 group-hover/card:bg-ink group-hover/card:text-fg group-hover/card:opacity-100">
                    {c.cta.label}<ArrowBox tone="current" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
