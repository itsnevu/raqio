"use client";
import { useRef, type ReactNode } from "react";
import { useSectionWidth } from "@/lib/motion/hooks";

/**
 * scale.com `Section`: rounded-3xl inner card whose width goes 90% → 100%, scrubbed `top bottom → bottom 75%`, power3.out.
 * Transform-only version: a background layer is scaled with scaleX .9 → 1, so the text is never squashed.
 */
export function Section({ children, card = "bg-fg", theme = "light", className = "", innerClassName = "", label }: { children: ReactNode; card?: string; theme?: "light" | "dark"; className?: string; innerClassName?: string; label?: string }) {
  const root = useRef<HTMLElement>(null); const bg = useRef<HTMLDivElement>(null);
  useSectionWidth(root, bg);
  return (
    <section ref={root} data-theme={theme} aria-label={label} className={`relative isolate ${className}`}>
      <div className={`relative isolate ${innerClassName}`}>
        <div ref={bg} aria-hidden className={`absolute inset-0 -z-10 rounded-3xl ${card}`} />
        {children}
      </div>
    </section>
  );
}
