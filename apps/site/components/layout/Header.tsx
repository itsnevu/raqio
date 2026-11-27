"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { type NavItem } from "@/content/site";
import { useLang, type Lang } from "@/content/i18n";
import { LOGIN_URL } from "@/content/pages";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { useSectionTheme } from "@/lib/motion/hooks";

const OPEN_DELAY = 80; // intent delay (brief)
const CLOSE_DELAY = 120;
const tones = { a2: "from-accent-2/80", a3: "from-accent-3/80", a4: "from-accent-4/80" };

export function Header() {
  const { t, lang, setLang } = useLang(); const nav = t.nav; const ui = t.ui;
  useSectionTheme();
  const [open, setOpen] = useState<number | null>(null);
  const [mobile, setMobile] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const baseId = useId();
  // brief: transparent over the hero; backdrop-blur + hairline border after 40px of scroll
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 40); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);

  const schedule = useCallback((i: number | null, ms: number) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(i), ms); }, []);
  const close = useCallback((refocus = false) => { const i = open; window.clearTimeout(timer.current); setOpen(null); if (refocus && i != null) triggers.current[i]?.focus(); }, [open]);

  // Esc closes from anywhere; click outside closes
  useEffect(() => {
    if (open == null) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") close(true); };
    const onDown = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest("[data-header]")) close(); };
    window.addEventListener("keydown", onKey); window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [open, close]);

  const links = () => [...(panel.current?.querySelectorAll<HTMLAnchorElement>("[data-menu-link]") ?? [])];
  const onTriggerKey = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(i); requestAnimationFrame(() => requestAnimationFrame(() => links()[0]?.focus())); }
    if (e.key === "ArrowRight") { e.preventDefault(); triggers.current[(i + 1) % nav.length]?.focus(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); triggers.current[(i - 1 + nav.length) % nav.length]?.focus(); }
  };
  // arrows move between items; Tab is trapped inside the open panel (brief: full focus trap)
  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const ls = links(); const k = ls.indexOf(document.activeElement as HTMLAnchorElement); if (!ls.length) return;
    const go = (n: number) => { e.preventDefault(); ls[(n + ls.length) % ls.length].focus(); };
    if (e.key === "ArrowDown") go(k + 1); else if (e.key === "ArrowUp") go(k - 1);
    else if (e.key === "Tab") go(e.shiftKey ? k - 1 : k + 1);
    else if (e.key === "Home") go(0); else if (e.key === "End") go(ls.length - 1);
  };

  const active = open != null ? nav[open] : null;
  return (
    <header data-header className="fixed inset-x-0 top-0 z-50" data-open={open != null || undefined} onMouseLeave={() => schedule(null, CLOSE_DELAY)}>
      {/* bar: 88px measured (py-6 + h-10); colours flip through --nav-* set by useSectionTheme */}
      <div className={`relative z-20 border-b transition-[background-color,color,border-color,backdrop-filter] duration-300 ${open != null ? "border-transparent bg-transparent text-ink" : `bg-(--nav-bg) text-(--nav-text) ${scrolled ? "border-(--nav-text)/10" : "border-transparent"}`}`}>
        <div className="grid-layout items-center py-4 md:py-6">
          <Link href="/" aria-label={ui.home} className="col-span-3 md:col-span-1"><Logo /></Link>
          <nav aria-label={ui.main} className="hidden md:col-span-7 md:col-start-2 md:flex md:gap-7">
            {nav.map((item, i) => (
              <button key={item.label} ref={(el) => { triggers.current[i] = el; }} type="button" aria-haspopup="true" aria-expanded={open === i} aria-controls={`${baseId}-panel`}
                onMouseEnter={() => schedule(i, open == null ? OPEN_DELAY : 0)} onFocus={() => open != null && open !== i && setOpen(i)} onKeyDown={onTriggerKey(i)} onClick={() => setOpen(open === i ? null : i)}
                className={`h-10 text-sm transition-opacity duration-200 ${open != null && open !== i ? "opacity-40" : "opacity-100"}`}>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="col-span-5 flex items-center justify-end gap-2 md:col-span-4 md:col-start-9">
            <span className="hidden gap-2 md:flex">
              <LangSwitch lang={lang} setLang={setLang} label={ui.language} />
              <Button href={`${LOGIN_URL}&lang=${lang}`} variant="outline" arrow={false}>{ui.login}</Button>
              <Button href="/start" arrow={false}>{ui.getStarted}</Button>
            </span>
            <button type="button" className="grid size-10 place-items-center rounded-lg md:hidden" aria-label={mobile ? ui.closeMenu : ui.openMenu} aria-expanded={mobile} onClick={() => setMobile(!mobile)}>
              <svg viewBox="0 0 20 20" className="size-5" aria-hidden><path d={mobile ? "M4 4l12 12M16 4 4 16" : "M3 6h14M3 14h14"} stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* mega-menu panel: measured rgba(255,255,255,.92) + blur-lg + 0 18px 60px -20px; scaleY .85 → 1 from the top */}
      <div id={`${baseId}-panel`} ref={panel} role="region" aria-label={active ? `${active.label} ${ui.menuSuffix}` : ui.menu} onKeyDown={onPanelKey}
        onMouseEnter={() => window.clearTimeout(timer.current)}
        className={`absolute inset-x-0 top-0 z-10 origin-top bg-fg/92 text-ink shadow-[0_18px_60px_-20px_rgb(10_10_15/0.16)] backdrop-blur-lg transition-[transform,opacity] ${open != null ? "visible scale-y-100 opacity-100 duration-[600ms] ease-expo" : "invisible scale-y-[.85] opacity-0 duration-[230ms] ease-[var(--ease-tw)]"}`}>
        <div className="pb-11 pt-[132px]">
          {nav.map((item, i) => <MenuContent key={item.label} item={item} visible={open === i} />)}
        </div>
      </div>

      {mobile && <MobileSheet nav={nav} ui={ui} lang={lang} setLang={setLang} onClose={() => setMobile(false)} />}
    </header>
  );
}

function MenuContent({ item, visible }: { item: NavItem; visible: boolean }) {
  return (
    <div aria-hidden={!visible} inert={!visible}
      className={`grid-layout transition-[opacity,transform] duration-200 ease-expo ${visible ? "relative translate-y-0 opacity-100 delay-75" : "pointer-events-none absolute inset-x-0 top-[132px] -translate-y-3 opacity-0"}`}>
      {item.columns.map((col, c) => (
        <div key={c} className={`col-span-2 flex flex-col gap-6 ${c === 0 ? "md:col-start-2" : "md:col-start-4"}`}>
          {col.map((grp) => (
            <div key={grp.heading}>
              {/* measured: sans 14/20, ls .7px, grey, sentence case */}
              <p className="mb-2 text-sm leading-5 tracking-[.05em] text-ink-muted">{grp.heading}</p>
              <ul className="flex flex-col">
                {grp.links.map((l) => (
                  <li key={l.label}>
                    <Link data-menu-link href={l.href} tabIndex={visible ? 0 : -1} className="group/link relative inline-block py-[3px] text-[20px] leading-[1.4] tracking-[-.01em] transition-colors duration-150 hover:text-accent focus-visible:text-accent">
                      {l.label}
                      <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent transition-transform duration-300 ease-expo group-hover/link:scale-x-100 group-focus-visible/link:scale-x-100" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
      <div className="col-span-6 md:col-start-7">
        {"cards" in item.media ? (
          <div className="grid grid-cols-2 gap-3">
            {item.media.cards.map((c) => (
              <Link key={c.href} href={c.href} tabIndex={visible ? 0 : -1} data-menu-link className="group/card flex flex-col gap-3">
                <span className="block aspect-[16/9] overflow-hidden rounded-lg bg-surface-2">{c.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 ease-expo group-hover/card:scale-105" />)}</span>
                <span className="detail-mono text-ink-muted">{c.tag}</span>
                <span className="text-base leading-6">{c.title}</span>
              </Link>
            ))}
          </div>
        ) : (
          // measured tile 705 × 192–324 at 1440; gradient placeholder (no third-party imagery)
          <div className={`relative flex aspect-[1024/571] max-h-[324px] w-full items-end overflow-hidden rounded-card bg-gradient-to-br ${tones[item.media.tone]} to-ink p-6 transition-opacity duration-[240ms]`}>
            {item.media.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.media.image} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />)}
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" aria-hidden />
            <span className="relative header5 text-fg">{item.media.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MobileSheet({ nav, ui, lang, setLang, onClose }: { nav: NavItem[]; ui: ReturnType<typeof useLang>["t"]["ui"]; lang: Lang; setLang: (l: Lang) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("a,button")?.focus(); const k = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  let n = 0;
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={ui.menu} className="fixed inset-0 top-[72px] z-10 overflow-y-auto bg-light px-6 pb-10 pt-4 text-ink md:hidden">
      {nav.map((item) => (
        <details key={item.label} className="border-b border-ink/10 py-3" open={item === nav[0]}>
          <summary className="cursor-pointer list-none text-2xl" style={{ animation: `sheet-in .3s var(--ease-expo) ${n++ * 30}ms both` }}>{item.label}</summary>
          <ul className="mt-3 flex flex-col gap-2">
            {item.columns.flat().flatMap((g) => g.links).map((l) => (
              <li key={l.label} style={{ animation: `sheet-in .3s var(--ease-expo) ${n++ * 30}ms both` }}><Link href={l.href} onClick={onClose} className="text-lg text-ink-muted">{l.label}</Link></li>
            ))}
          </ul>
        </details>
      ))}
      <div className="mt-8 flex flex-wrap items-center gap-2"><LangSwitch lang={lang} setLang={setLang} label={ui.language} /><Button href={`${LOGIN_URL}&lang=${lang}`} variant="outline" arrow={false}>{ui.login}</Button><Button href="/start">{ui.getStarted}</Button></div>
      <style>{`@keyframes sheet-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

/** EN / ID switch: active language underlined (as on the current Raqio site). */
function LangSwitch({ lang, setLang, label }: { lang: Lang; setLang: (l: Lang) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="mr-2 flex items-center gap-1 text-xs font-medium">
      {(["en", "id"] as const).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
          className={`relative px-1.5 py-2 uppercase transition-opacity ${lang === l ? "opacity-100" : "opacity-50 hover:opacity-80"}`}>
          {l}<span aria-hidden className={`absolute inset-x-1.5 bottom-1 h-px origin-left bg-current transition-transform duration-300 ease-expo ${lang === l ? "scale-x-100" : "scale-x-0"}`} />
        </button>
      ))}
    </div>
  );
}
