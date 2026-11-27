// Empat agent Raqio. Copy dan glyph sama dengan situs (apps/site/content/id.ts cardGrid, components/ui/Glyph.tsx).
// Satu sesi Raqio (cookie raqio_session dari API Go) membuka semuanya; Customer Service Agent berjalan di WA-Suite.
import type { ReactNode } from "react";

export type AgentKey = "research" | "seo" | "marketing" | "cs";
export type Agent = { key: AgentKey; name: string; body: string; product: string; path?: string; glyph: ReactNode };

const dots = [12, 20, 28].flatMap((y) => [8, 15, 22].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" fill="currentColor" stroke="none" />));

export const AGENTS: Agent[] = [
  {
    key: "research", name: "Research Agent", product: "Competitor Scraping", path: "/market",
    body: "Memetakan setiap usaha di industri dan wilayah Anda, lalu memberi skor prospek 0–100. Usaha dengan skor 40 ke atas layak dihubungi.",
    glyph: <>{dots}<circle cx="38" cy="36" r="13" /><path d="M47.5 45.5 57 55" /></>,
  },
  {
    key: "seo", name: "SEO Agent", product: "Competitor Scraping", path: "/top",
    body: "Menghitung skor peringkat 0–100 per industri dan wilayah: 60% kualitas ulasan, 25% skala usaha, 15% jangkauan.",
    glyph: <><circle cx="30" cy="34" r="20" /><circle cx="30" cy="34" r="12" /><circle cx="30" cy="34" r="4" /><path d="M30 34 52 12M46 12h6v6" /><circle cx="12" cy="12" r="2.5" /><circle cx="54" cy="52" r="2.5" /></>,
  },
  {
    key: "marketing", name: "Marketing Agent", product: "Competitor Scraping", path: "/campaigns",
    body: "Menyusun dan mengirim pesan personal lewat WhatsApp, Instagram, dan email ke prospek yang dipilih berdasarkan skornya.",
    glyph: <><path d="M6 30 56 8 42 54 30 36Z" /><path d="M30 36 56 8" /><path d="M8 46c5-3 9-3 14 0M6 54c7-4 13-4 20 0" /></>,
  },
  {
    key: "cs", name: "Customer Service Agent", product: "WA-Suite",
    body: "Mengelola dashboard WhatsApp tim, deal, dan pengingat DP. Chat yang belum dibalas 4 jam operasional dihitung tidak terjawab.",
    glyph: <><rect x="16" y="6" width="40" height="20" rx="8" /><path d="M42 26l6 6v-6" /><rect x="6" y="34" width="40" height="20" rx="8" /><path d="M14 54v6l6-6" /><path d="M14 42h22M14 47h14" /><circle cx="25" cy="16" r="1.6" fill="currentColor" stroke="none" /><circle cx="31" cy="16" r="1.6" fill="currentColor" stroke="none" /><circle cx="37" cy="16" r="1.6" fill="currentColor" stroke="none" /></>,
  },
];

export function AgentGlyph({ agent, className = "agent-glyph" }: { agent: Agent; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {agent.glyph}
    </svg>
  );
}

/** Kotak panah 32px seperti tombol situs (apps/site/components/ui/Button.tsx ArrowBox). */
export function ArrowBox() {
  return (
    <span className="arrow-box" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" /></svg>
      <svg viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" /></svg>
    </span>
  );
}
