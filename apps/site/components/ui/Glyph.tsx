/**
 * Raqio glyphs: original monoline illustrations (64×64, round joins). Drawn for Raqio's features;
 * the style (bold line art in place of a generic icon tile) follows the reference, the drawings are our own.
 */
import type { ReactNode } from "react";

const G: Record<string, ReactNode> = {
  // Competitor Scraping
  area: (<><path d="M32 46 8 36l24-10 24 10-24 10Z" /><path d="M8 43l24 10 24-10" /><path d="M8 50l24 10 24-10" /><path d="M32 26c-4.5-5.5-7-9-7-12.5a7 7 0 1 1 14 0c0 3.5-2.5 7-7 12.5Z" /><circle cx="32" cy="13.5" r="2.4" /></>),
  compare: (<><circle cx="24" cy="26" r="13" /><circle cx="40" cy="26" r="13" /><path d="M14 58V50M24 58V46M34 58V52M44 58V44M54 58V49" /></>),
  prospects: (<><circle cx="30" cy="34" r="20" /><circle cx="30" cy="34" r="12" /><circle cx="30" cy="34" r="4" /><path d="M30 34 52 12M46 12h6v6" /><circle cx="12" cy="12" r="2.5" /><circle cx="54" cy="52" r="2.5" /></>),
  monitor: (<><path d="M8 46a24 24 0 0 1 48 0" /><path d="M16 46a16 16 0 0 1 32 0" /><path d="M24 46a8 8 0 0 1 16 0" /><path d="M32 46 48 24" /><circle cx="42" cy="34" r="2.5" /><circle cx="20" cy="30" r="2" /><path d="M6 52h52" /></>),
  // WA-Suite
  inbox: (<><rect x="16" y="6" width="40" height="20" rx="8" /><path d="M42 26l6 6v-6" /><rect x="6" y="34" width="40" height="20" rx="8" /><path d="M14 54v6l6-6" /><path d="M14 42h22M14 47h14" /><circle cx="25" cy="16" r="1.6" fill="currentColor" stroke="none" /><circle cx="31" cy="16" r="1.6" fill="currentColor" stroke="none" /><circle cx="37" cy="16" r="1.6" fill="currentColor" stroke="none" /></>),
  assign: (<><circle cx="32" cy="14" r="6" /><path d="M32 20v10M32 30 14 42M32 30v12M32 30l18 12" /><circle cx="14" cy="46" r="5" /><circle cx="32" cy="46" r="5" /><circle cx="50" cy="46" r="5" /><path d="M8 58c0-4 3-6 6-6s6 2 6 6M26 58c0-4 3-6 6-6s6 2 6 6M44 58c0-4 3-6 6-6s6 2 6 6" /></>),
  templates: (<><rect x="10" y="12" width="44" height="40" rx="9" /><path d="M10 22h44" /><path d="M32 30l2.2 5.8L40 38l-5.8 2.2L32 46l-2.2-5.8L24 38l5.8-2.2Z" /></>),
  rules: (<><path d="M32 6 44 18 32 30 20 18Z" /><path d="M20 18H10v20M44 18h10v20" /><rect x="4" y="38" width="12" height="10" rx="3" /><rect x="48" y="38" width="12" height="10" rx="3" /><path d="M32 30v12" /><circle cx="32" cy="48" r="6" /><path d="M29 48l2 2 4-4" /></>),
  // solutions
  research: (<>{[12, 20, 28].map((y) => [8, 15, 22].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" fill="currentColor" stroke="none" />))}<circle cx="38" cy="36" r="13" /><path d="M47.5 45.5 57 55" /></>),
  reach: (<><path d="M6 30 56 8 42 54 30 36Z" /><path d="M30 36 56 8" /><path d="M8 46c5-3 9-3 14 0M6 54c7-4 13-4 20 0" /></>),
  close: (<><circle cx="24" cy="30" r="14" /><circle cx="40" cy="30" r="14" /><path d="M26 54l5 5 10-11" /></>),
  // security / principles
  lattice: (<><path d="M32 6 54 18v28L32 58 10 46V18Z" /><path d="M32 6v22M32 36v22M10 18l18.5 11.5M35.5 34.5 54 46M54 18 35.5 29.5M28.5 34.5 10 46" /><circle cx="32" cy="32" r="4" fill="currentColor" stroke="none" /></>),
  roles: (<><circle cx="32" cy="14" r="6" /><path d="M21 36a11 11 0 0 1 22 0" /><circle cx="12" cy="28" r="4.5" /><path d="M4 46a8 8 0 0 1 16 0" /><circle cx="52" cy="28" r="4.5" /><path d="M44 46a8 8 0 0 1 16 0" /><path d="M4 54h56" /></>),
  key: (<><circle cx="18" cy="32" r="10" /><circle cx="18" cy="32" r="3" /><path d="M28 32h28M44 32v8M52 32v12" /><circle cx="44" cy="44" r="2.5" /><circle cx="52" cy="48" r="2.5" /></>),
  audit: (<><rect x="8" y="6" width="26" height="44" rx="5" /><path d="M14 16h14M14 24h14M14 32h9" /><circle cx="47" cy="44" r="11" /><path d="M47 37v7l5 3" /><path d="M34 44h2" /></>),
  lock: (<><rect x="20" y="26" width="24" height="20" rx="5" /><path d="M25 26v-5a7 7 0 0 1 14 0v5" /><circle cx="32" cy="35" r="2.4" /><path d="M32 37.4V41" /><path d="M4 18h10M10 14l4 4-4 4" /><path d="M50 50h10M56 46l4 4-4 4" /><path d="M4 50h8M50 18h8" strokeDasharray="2 4" /></>),
  globe: (<><circle cx="32" cy="32" r="24" /><ellipse cx="32" cy="32" rx="10" ry="24" /><path d="M8 32h48M12 20h40M12 44h40" /></>),
  eye: (<><path d="M32 4 60 32 32 60 4 32Z" /><path d="M14 32c5-7 11-10 18-10s13 3 18 10c-5 7-11 10-18 10s-13-3-18-10Z" /><circle cx="32" cy="32" r="5" /></>),
  areas: (<><path d="M6 20l14-6 12 6 14-6v32l-14 6-12-6-14 6Z" /><path d="M20 14v32M32 20v32" /><path d="M46 14l12 6v32l-12-6" /><circle cx="40" cy="30" r="3" /></>),
  owners: (<><rect x="6" y="8" width="22" height="22" rx="5" /><rect x="36" y="34" width="22" height="22" rx="5" /><path d="M28 19h12a7 7 0 0 1 7 7v4" /><path d="M43 27l4 4 4-4" /><circle cx="17" cy="19" r="3" /><circle cx="47" cy="45" r="3" /></>),
};

export function Glyph({ name, className = "size-16" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {G[name] ?? G.research}
    </svg>
  );
}
export const glyphNames = Object.keys(G);
