import type { Biz } from "../biz";

export type Summary = { businesses: number; maps_businesses?: number; extra_businesses?: number; capped?: boolean; avg_rating?: number | null; median_reviews?: number; total_reviews?: number; top3_share: number };
export type Digital = { sampled: number; website: number; instagram: number; whatsapp: number; phone: number };
/** Dari mana data laporan berasal (dihitung worker; laporan lama tidak punya, dihitung ulang dari `all`). */
export type Provider = { name: string; label: string; status: "ok" | "empty" | "skipped" | "error"; found: number; seconds: number; note: string };
export type Verify = { checked: number; up: number; down: number; dropped_closed: number; dropped_conf: number; dropped_contact: number };
export type Sources = {
  maps: number; seen_before: number; detail_fresh: number; detail_db: number; detail_none: number; ig_maps: number; ig_website: number; ig_other: number;
  // laporan multi-sumber (worker dengan paket sources); laporan lama tidak punya
  total?: number; by_source?: Record<string, number>; maps_only?: number; multi?: number; extra_only?: number; enriched?: number;
  providers?: Provider[]; verify?: Verify;
};
export type Quality = { brands: number; raw: number; kept: number; invalid_or_closed: number; out_of_area: number; duplicates_merged: number; chains: number };
export type Report = {
  id?: number;
  industry: string;
  area: string;
  created: string;
  summary: Summary;
  digital: Digital;
  sources?: Sources;
  data_quality?: Quality | null;
  all?: Biz[];
  leaders?: Biz[];
  insights: string[];
  ai_strategy?: string[] | null;
  rating_buckets: [string, number][];
  size_buckets: [string, number][];
};
export type ReportRow = { id: number; industry: string; area: string; created_at?: string; created?: string; summary?: unknown; cached?: boolean };
export type Watch = { industry: string; area: string };
export type CompareArea = {
  area: string; report_id: number; opportunity: number; businesses: number; capped?: boolean; avg_rating?: number | null; reviews_per_business: number;
  top3_share: number; gems: number; weak: number; website_pct: number; whatsapp_pct: number; prospects: number;
};
export type Compare = { industry: string; areas: CompareArea[]; insights: string[] };
export type SortKey = "name" | "rating" | "reviews" | "rpm" | "lead" | "website" | "instagram" | "dist";
export type View = { q: string; filter: string; sort: SortKey; dir: 1 | -1; open: string | null };
export type Tab = "sum" | "players" | "pros";
export type Goal = "client" | "rival";
export type Mode = "one" | "cmp";

/** Status riset sebagai data, bukan JSX. */
export type StatusMsg =
  | { kind: "idle" }
  | { kind: "info"; text: string }
  | { kind: "error"; text: string; upgrade?: boolean } // upgrade: kuota habis, tampilkan tautan ke Pengaturan
  | { kind: "cached"; ageHours: number; reportId: number }
  | { kind: "running" };

export type RunArgs = { industry: string; area: string; fresh?: boolean; mode?: Mode };
export type RunResult = { ok?: boolean; job?: number | null; cached?: boolean; report_id?: number; age_hours?: number };
