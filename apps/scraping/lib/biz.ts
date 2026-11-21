// Helper bersama (port dari templates/shell.js dan market.html). Semua fungsi murni: tidak memutasi argumen.
import { apiPost } from "./api";
import { invalidate, PROSPECTS_KEY } from "./cache";

export type Lead = { status?: string; note?: string | null; remind?: string | null; assignee?: string | null; updated?: string };

export type Biz = {
  key?: string;
  place_id?: string;
  maps_url?: string;
  name: string;
  category?: string;
  address?: string;
  price?: string;
  rating?: number;
  reviews?: number;
  reviews_per_month?: number | null;
  phone?: string;
  website?: string;
  instagram?: string;
  instagram_shared?: boolean;
  logo_key?: string; // logo dari worker (GET /logo/<key>)
  emails?: string[];
  dist_km?: number | null;
  branches_in_area?: number;
  brand_group?: number;
  power_score?: number | null; // rata-rata Bayesian dari worker (standards.leaders); dihitung ulang di web hanya untuk laporan lama
  rank?: number; // peringkat resmi di leaders (1..10)
  lead_score?: number | null;
  lead_reasons?: string[];
  lead?: Lead | null;
  _detailed?: boolean;
  detail_src?: "fresh" | "db" | string; // string lain = nama sumber (overture, osm, ...)
  ig_src?: "maps" | "website" | string;
  seen_before?: boolean;
  // sumber data selain Google Maps (worker: services/scraper/sources)
  sources?: string[]; // ["maps", "overture", ...]
  on_maps?: boolean; // false = hanya ditemukan di sumber lain (tidak ada rating, tidak ikut peringkat)
  src_fields?: Record<string, string>; // kontak mana yang diisi dari sumber mana, mis. { phone: "overture" }
  confidence?: number; // skor keyakinan sumber lain (0..1)
  src_url?: string; // halaman asal (Facebook page, node OSM)
  web_ok?: boolean; // website sudah dicek hidup saat pindaian
  // untuk papan prospek
  industry?: string;
  area?: string;
  report_id?: number;
};

export const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/[-]/g, "") // karakter PUA dari ikon Maps
    .replace(/\s*·\s*$/, "")
    .trim();

export const num = (n: number | null | undefined) =>
  n == null
    ? "-"
    : n >= 1e6
      ? (n / 1e6).toFixed(1).replace(".", ",") + " jt"
      : n >= 1e4
        ? Math.round(n / 1e3) + " rb"
        : Number(n).toLocaleString("id-ID");

export const dec = (x: unknown) => String(x).replace(".", ",");
export const today = () => new Date().toISOString().slice(0, 10);

export const LEAD_ST = ["baru", "dihubungi", "tertarik", "deal", "tolak"] as const;
export type LeadStatus = (typeof LEAD_ST)[number];
export const ST_LABEL: Record<string, string> = {
  baru: "Baru",
  dihubungi: "Dihubungi",
  tertarik: "Tertarik",
  deal: "Deal",
  tolak: "Tidak jadi",
};

export const waOf = (p: Biz) => {
  let d = String(p.phone || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d.startsWith("628") && d.length >= 10 && d.length <= 15 ? "https://wa.me/" + d : "";
};

export const fmtPhone = (p: Biz) => {
  let d = String(p.phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("62")) d = "0" + d.slice(2);
  return d.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3");
};

export const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export const leadKey = (p: Biz) => p.key || p.place_id || p.maps_url || "";

export { getOffer, isDefaultOffer, setOffer } from "./settings";
import { getOffer } from "./settings";

export const short = (n: string) => (clean(n).split(/\s[-|@·,(]\s?/)[0] ?? "").trim();

export function gapsOf(p: Biz): string[] | null {
  if (!p._detailed) return null; // belum diambil detailnya: jangan disimpulkan tidak punya website
  const g: string[] = [];
  if (p.on_maps === false) g.push("tidak di hasil Maps");
  if (!p.website) g.push("tanpa website");
  if (!p.instagram || p.instagram_shared) g.push("IG tidak ditemukan");
  if (p.on_maps !== false && (p.reviews || 0) < 100) g.push("review sedikit");
  if (p.rating && p.rating < 4.3) g.push("rating " + p.rating);
  return g;
}
export const isGem = (p: Biz) => (p.rating ?? 0) >= 4.7 && (p.reviews ?? 0) >= 15 && (p.reviews ?? 0) < 300;
export const isWeak = (p: Biz) => !!p.rating && p.rating < 4.3 && (p.reviews ?? 0) >= 150;
export const isProspect = (p: Biz, rival = false) => {
  if (rival) return false;
  const g = gapsOf(p);
  return !!(g && g.length && (p.reviews ?? 0) <= 800 && (waOf(p) || p.instagram));
};

export function draft(p: Biz, industry?: string, area?: string, offer: string = getOffer()) {
  const r = p.lead_reasons || [];
  const g = gapsOf(p) || [];
  const praise =
    (p.rating ?? 0) >= 4.5
      ? `rating ${dec(p.rating)} dari ${p.reviews} ulasan di Google Maps, keren banget!`
      : `sudah ${p.reviews} ulasan di Google Maps.`;
  const why =
    g.includes("tanpa website") || r.includes("tanpa website")
      ? "Saya lihat belum ada website atau katalog online, padahal banyak calon pelanggan cek dulu di Google sebelum datang."
      : g.includes("IG tidak ditemukan") || r.includes("IG tidak ditemukan")
        ? "Saya belum menemukan Instagram resminya, padahal banyak pelanggan cari referensi di sana."
        : g.includes("review sedikit") || (p.reviews || 0) < 100
          ? "Ulasannya masih bisa ditambah supaya lebih sering muncul di pencarian."
          : "Masih ada ruang untuk tampil lebih menonjol dibanding pesaing sekitar.";
  return `Halo kak, salam kenal. Saya lihat ${short(p.name)} punya ${praise} ${why} Kebetulan saya bantu bisnis ${industry || ""} di sekitar ${area || ""} untuk ${offer}. Boleh saya kirim contoh singkatnya? Terima kasih 🙏`;
}

/** Gabungkan status lead baru dengan yang lama tanpa memutasi `p`. */
export const withLead = (p: Biz, patch: Partial<Lead>): Biz => ({
  ...p,
  lead: { status: "baru", ...(p.lead || {}), ...patch, updated: new Date().toISOString() },
});

/** Snapshot fitur bisnis SAAT lead dibuat — fondasi dataset kalibrasi skor lead (disimpan server sekali,
 *  tidak ditimpa pembaruan status). Hanya fakta yang sudah ada di baris, tanpa fetch tambahan. */
export const leadFeatures = (p: Biz) => ({
  rating: p.rating ?? null,
  reviews: p.reviews ?? null,
  website: !!p.website,
  instagram: !!p.instagram,
  whatsapp: !!waOf(p),
  branches: p.branches_in_area ?? 1,
  category: p.category || null,
  lead_score: p.lead_score ?? null,
  industry: p.industry || null,
  area: p.area || null,
});

/**
 * Simpan status follow up ke server. Mengembalikan salinan `p` dengan lead baru; `p` sendiri tidak diubah.
 * Melempar ApiError kalau gagal. `assignee` null = biarkan (server mempertahankan), "" = lepas penanggung jawab.
 */
export async function saveLead(p: Biz, patch: Partial<Lead>): Promise<Biz> {
  const next = withLead(p, patch);
  const lead = next.lead!;
  await apiPost("/market/lead", {
    key: leadKey(p),
    name: clean(p.name),
    status: lead.status,
    note: lead.note ?? null,
    remind: lead.remind ?? null,
    assignee: patch.assignee !== undefined ? patch.assignee : null,
    features: leadFeatures(p),
  });
  invalidate(PROSPECTS_KEY);
  return next;
}

/**
 * Satu sel CSV. Nilai yang diawali = + - @ TAB CR diberi prefix ' supaya Excel/Sheets tidak mengeksekusinya sebagai formula
 * (data scraping tidak tepercaya). Kutip ganda digandakan.
 */
export function csvCell(v: unknown): string {
  let s = String(Array.isArray(v) ? v.join(" ") : (v ?? ""));
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function csvText(header: string[], rows: unknown[][]): string {
  return "﻿" + [header.map(csvCell).join(",")].concat(rows.map((r) => r.map(csvCell).join(","))).join("\n");
}

export function downloadCsv(name: string, header: string[], rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([csvText(header, rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
