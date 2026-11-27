"use client";
import { useRef, type ReactNode } from "react";
import { useScrollReveal } from "@/lib/motion/hooks";

/**
 * scale.com ScrollRevealSection (decision D1): an absolutely positioned backdrop (`origin-top`) grows from inset 24px
 * with 16px top corners to full bleed. The content never moves, and the backdrop is the dedicated background layer.
 */
export function ScrollRevealSection({ children, backdrop = "bg-light", theme = "light", className = "", label }: { children: ReactNode; backdrop?: string; theme?: "light" | "dark"; className?: string; label?: string }) {
  const root = useRef<HTMLElement>(null); const bd = useRef<HTMLDivElement>(null);
  useScrollReveal(root, bd);
  return (
    <section ref={root} data-theme={theme} aria-label={label} className={`relative isolate w-full ${className}`}>
      <div ref={bd} aria-hidden className={`pointer-events-none absolute inset-0 z-0 origin-top overflow-hidden rounded-t-2xl ${backdrop}`} />
      <div className="relative z-[1] isolate min-h-[60vh]">{children}</div>
    </section>
  );
}
