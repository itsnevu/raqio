import Link from "next/link";
import type { ReactNode } from "react";

/** FlatCta (measured: h 40, radius 6px, 14px/500). `primary` is the ONLY place --accent-primary fills a button. */
type Props = { href: string; children: ReactNode; variant?: "primary" | "ink" | "outline" | "ghost"; arrow?: boolean; className?: string };
const styles = {
  primary: "bg-accent text-fg",
  ink: "bg-ink text-fg",
  outline: "border border-current/25 text-current hover:border-current/60",
  ghost: "text-current",
};
export function Button({ href, children, variant = "primary", arrow = true, className = "" }: Props) {
  return (
    <Link href={href} className={`group/cta relative inline-flex h-10 items-center gap-3 overflow-hidden rounded-md pl-4 ${arrow ? "pr-1" : "pr-4"} text-sm font-medium transition-colors duration-300 ${styles[variant]} ${className}`}>
      <span>{children}</span>
      {arrow && <ArrowBox tone={variant === "ink" ? "light" : variant === "primary" ? "onAccent" : "current"} />}
    </Link>
  );
}

/** 32px arrow box; the arrow slides out right and back in from the left on hover. */
export function ArrowBox({ tone = "onAccent" }: { tone?: "onAccent" | "light" | "current" | "accent" }) {
  const bg = { onAccent: "bg-fg/15 text-fg", light: "bg-fg text-ink", current: "bg-current/10 text-current", accent: "bg-accent text-fg" }[tone];
  return (
    <span className={`relative grid size-8 place-items-center overflow-hidden rounded-[4px] ${bg}`} aria-hidden>
      <svg className="size-4 transition-transform duration-500 ease-expo group-hover/cta:translate-x-6 group-hover/card:translate-x-6" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" /></svg>
      <svg className="absolute size-4 -translate-x-6 transition-transform duration-500 ease-expo group-hover/cta:translate-x-0 group-hover/card:translate-x-0" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" /></svg>
    </span>
  );
}
