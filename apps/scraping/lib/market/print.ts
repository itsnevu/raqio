// Helper murni laporan siap cetak: memilih dan mengurutkan baris tiap bagian. Tanpa DOM.
import { type Biz, clean, isGem, isProspect, isWeak } from "../biz";
import type { Report } from "./types";

const byReviews = (a: Biz, b: Biz) => (b.reviews || 0) - (a.reviews || 0);

/** Komposisi kategori: n teratas, sisanya digabung "Lainnya". */
export function topCategories(all: Biz[], n = 8): [string, number][] {
  const cats: Record<string, number> = {};
  all.forEach((p) => {
    const c = clean(p.category) || "Lainnya";
    cats[c] = (cats[c] || 0) + 1;
  });
  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, n), rest = sorted.slice(n).reduce((s, x) => s + x[1], 0);
  if (rest) top.push(["Lainnya", rest]);
  return top;
}

export const leadersOf = (R: Report, all: Biz[], n = 10): Biz[] =>
  (R.leaders && R.leaders.length ? [...R.leaders] : [...all].sort(byReviews)).slice(0, n);

export const gemsOf = (all: Biz[], n = 10): Biz[] =>
  all.filter(isGem).sort((a, b) => (b.rating || 0) - (a.rating || 0) || byReviews(a, b)).slice(0, n);

export const weakOf = (all: Biz[], n = 10): Biz[] => all.filter(isWeak).sort(byReviews).slice(0, n);

export const prospectsOf = (all: Biz[], rival: boolean, n = 40): Biz[] =>
  all
    .filter((p) => isProspect(p, rival))
    .sort((a, b) => (b.lead_score ?? -1) - (a.lead_score ?? -1) || byReviews(a, b))
    .slice(0, n);

export const digitalRows = (d: Report["digital"]): [string, number][] => [
  ["Bisa WhatsApp", d.whatsapp],
  ["Punya telepon", d.phone],
  ["Punya website", d.website],
  ["Instagram terdeteksi", d.instagram],
];

export const fmtLongDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("id-ID", { dateStyle: "long" });
};
