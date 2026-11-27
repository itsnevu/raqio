"use client";
import Link from "next/link";
import Brand, { BrandMark } from "@/components/Brand";
import { AGENTS, AgentGlyph } from "@/components/agents";
import { safeHttpUrl } from "@/lib/safe";
import type { ReactNode } from "react";
import { useAccessText } from "@/lib/access-lang";

/**
 * Bingkai halaman akses (masuk, daftar, lupa, reset). Bahasa visualnya sama dengan halaman /demo di situs Raqio:
 * form di kiri dengan input 46px, panel pastel di kanan. Halaman ini adalah satu-satunya pintu login Raqio (SSO):
 * sesi yang dibuat di sini juga dibaca WA-Suite.
 */
export default function AccessLayout({ children, aside = true }: { children: ReactNode; aside?: boolean }) {
  const t = useAccessText();
  const marketing = safeHttpUrl(process.env.NEXT_PUBLIC_MARKETING_URL ??
    (process.env.NODE_ENV === "development" ? "http://localhost:3003" : undefined));
  return (
    <main className="loginp access-shell">
      <header className="access-top">
        <Brand />
        {marketing && <a className="access-back" href={marketing}>
          <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M13 8H3m4-4L3 8l4 4" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {t.back}
        </a>}
      </header>
      <div className={aside ? "access-split" : "access-split access-split--single"}>
        <div className="access-form">{children}</div>
        {aside && <aside className="access-panel" aria-labelledby="access-panel-title">
          <p className="access-eyebrow"><BrandMark className="access-eyebrow-mark" />{t.eyebrow}</p>
          <h2 id="access-panel-title">{t.panelTitle}</h2>
          <ul className="access-agents">
            {AGENTS.map((a) => (
              <li key={a.key}>
                <AgentGlyph agent={a} />
                <span><b>{a.name}</b><span>{t.agents[a.key] ?? a.body}</span></span>
              </li>
            ))}
          </ul>
          <p className="access-panel-note">{t.panelNote}</p>
        </aside>}
      </div>
      <footer className="access-legal" aria-label={t.legalLabel}>
        <p>{t.legal[0]}<Link href="/terms">{t.legal[1]}</Link>{t.legal[2]}<Link href="/privacy">{t.legal[3]}</Link>{t.legal[4]}</p>
      </footer>
    </main>
  );
}
