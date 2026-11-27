"use client";
import Link from "next/link";
import { useRef } from "react";
import { useT } from "@/content/i18n";
import { Logo } from "@/components/ui/Logo";
import { useWordReveal } from "@/lib/motion/hooks";

// TODO(raqio): replace href "#" with the real profile URLs
const socials = [
  { name: "Instagram", href: "#", icon: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></> },
  { name: "LinkedIn", href: "#", icon: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7.5 10.5V17M7.5 7.2v.1M11 17v-6.5M11 13.5c0-2 1.2-3 2.8-3s2.7 1 2.7 3V17" strokeLinecap="round" /></> },
  { name: "YouTube", href: "#", icon: <><rect x="2.5" y="5" width="19" height="14" rx="4" /><path d="M10 9.2v5.6l4.8-2.8L10 9.2Z" fill="currentColor" /></> },
];

/** Footer (measured): bg black, pt-40 md, gap-32, 5 link columns, header1 wordmark (116px at 1440), socials, mono 13px small print. Wordmark reveals per word. */
export function Footer() {
  const { footer, ui } = useT();
  const root = useRef<HTMLElement>(null); const mark = useRef<HTMLParagraphElement>(null);
  useWordReveal(root, mark, { from: 0, y: 40, stagger: 0.06, duration: 0.7, start: "top 90%" });
  return (
    <footer ref={root} data-theme="dark" className="flex flex-col gap-12 bg-ink pb-6 pt-8 text-fg md:gap-32 md:pt-40">
      <div className="grid-layout gap-y-10">
        <Link href="/" aria-label={ui.home} className="col-span-8 md:col-span-1"><Logo /></Link>
        {footer.columns.map((c, i) => (
          <nav key={c.heading} aria-label={c.heading} className={`col-span-4 flex flex-col gap-4 md:col-span-2 ${i === 0 ? "md:col-start-3" : ""}`}>
            <p className="detail-mono text-fg-muted">{c.heading}</p>
            <ul className="flex flex-col gap-2">{c.links.map((l) => <li key={l.label}><Link href={l.href} className="text-sm font-semibold capitalize underline-offset-4 transition-colors hover:underline">{l.label}</Link></li>)}</ul>
          </nav>
        ))}
      </div>
      <div className="grid-layout"><p ref={mark} className="header1 col-span-full text-balance">{footer.wordmark}</p></div>
      <div className="flex flex-col justify-between gap-6 px-6 md:flex-row md:items-center">
        <div className="flex gap-2">
          {socials.map((s) => (
            <a key={s.name} href={s.href} aria-label={`Raqio ${s.name}`} target="_blank" rel="noreferrer" className="grid size-12 place-items-center rounded-lg bg-surface-2 text-fg-muted transition-colors hover:text-fg">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>{s.icon}</svg>
            </a>
          ))}
        </div>
        <div className="detail-mono flex flex-col gap-2 text-fg-muted md:text-right">
          <span>© {new Date().getFullYear()} Raqio</span><span>{ui.legal}</span>
        </div>
      </div>
    </footer>
  );
}
