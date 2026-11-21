// Filter cepat dan pengurutan tabel bisnis. Fungsi murni supaya mudah dites; `applyView` selalu mengembalikan array baru.
import { type Biz, clean, isGem, isProspect, isWeak, waOf } from "../biz";
import type { SortKey, View } from "./types";

export type Filter = { key: string; label: string; test: (p: Biz, rival: boolean) => boolean };

export const FILTERS: Filter[] = [
  { key: "all", label: "Semua", test: () => true },
  { key: "prospect", label: "Prospek", test: (p, r) => isProspect(p, r) },
  { key: "followup", label: "Follow up", test: (p) => !!p.lead && !!p.lead.status && !["deal", "tolak"].includes(p.lead.status) },
  { key: "wa", label: "Bisa WhatsApp", test: (p) => !!waOf(p) },
  { key: "web", label: "Punya website", test: (p) => !!p.website },
  { key: "noweb", label: "Tanpa website", test: (p) => !!p._detailed && !p.website },
  { key: "ig", label: "Punya IG", test: (p) => !!p.instagram },
  { key: "gem", label: "Hidden gem", test: (p) => isGem(p) },
  { key: "weak", label: "Rating rendah, ramai", test: (p) => isWeak(p) },
];

export const filterByKey = (key: string): Filter => FILTERS.find((f) => f.key === key) ?? FILTERS[0]!;
/** Filter yang tampil; mode pesaing tidak punya konsep prospek atau follow up. */
export const visibleFilters = (rival: boolean) => FILTERS.filter((f) => !(rival && (f.key === "prospect" || f.key === "followup")));
export const countFilters = (all: Biz[], rival: boolean): Map<string, number> =>
  new Map(FILTERS.map((f) => [f.key, all.filter((p) => f.test(p, rival)).length]));

const SORT: Record<SortKey, (p: Biz) => number | string> = {
  name: (p) => clean(p.name).toLowerCase(),
  rating: (p) => (p.rating || 0) * 1e6 + (p.reviews || 0),
  reviews: (p) => p.reviews || 0,
  rpm: (p) => p.reviews_per_month ?? -1,
  lead: (p) => p.lead_score ?? -1,
  website: (p) => (p.website ? 1 : 0),
  instagram: (p) => (p.instagram ? 1 : 0),
  dist: (p) => p.dist_km ?? 999,
};
export const isSortKey = (k: string): k is SortKey => k in SORT;

export const matchesQuery = (p: Biz, q: string) =>
  !q || [p.name, p.address, p.category, p.instagram, p.website, p.phone].join(" ").toLowerCase().includes(q.toLowerCase());

export function sortRows(rows: Biz[], sort: SortKey, dir: 1 | -1): Biz[] {
  const k = SORT[sort] ?? SORT.reviews;
  return [...rows].sort((a, b) => {
    const x = k(a), y = k(b);
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  });
}

export function applyView(all: Biz[], view: View, rival: boolean): Biz[] {
  const f = filterByKey(view.filter);
  const rows = all.filter((p) => f.test(p, rival) && matchesQuery(p, view.q));
  return sortRows(rows, view.sort, view.dir);
}

export const DEFAULT_VIEW: View = { q: "", filter: "all", sort: "reviews", dir: -1, open: null };

/** Arah default saat ganti kolom: nama dan jarak naik, selain itu turun. Klik kolom yang sama membalik arah. */
export function toggleSort(view: View, key: SortKey): View {
  return { ...view, sort: key, dir: view.sort === key ? ((-view.dir) as 1 | -1) : key === "name" || key === "dist" ? 1 : -1 };
}

export function setFilter(view: View, key: string): View {
  return { ...view, filter: key, open: null, ...(key === "prospect" || key === "followup" ? { sort: "lead" as const, dir: -1 as const } : {}) };
}
