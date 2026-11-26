// Profil bisnis pengguna (disimpan di org_settings.profile): dasar draf pesan, kecocokan prospek, dan konteks asisten AI.
// Kecocokan dihitung dari fakta riset dan pilihan pengguna saja, tanpa tebakan AI.
import { type Biz, clean, gapsOf } from "./biz";

export type ProfileKind = "usaha" | "perorangan" | "agensi";
export type Solve = "website" | "instagram" | "ulasan" | "layanan" | "maps";
export type BusinessProfile = {
  kind?: ProfileKind; name?: string; customers?: string; area?: string; strengths?: string; avoid?: string; solves?: Solve[];
};

export const KINDS: [ProfileKind, string, string][] = [
  ["usaha", "Usaha", "Punya produk atau toko"],
  ["perorangan", "Perorangan", "Freelancer atau konsultan"],
  ["agensi", "Agensi", "Tim yang melayani klien"],
];
export const SOLVES: [Solve, string][] = [
  ["website", "Belum punya website"],
  ["instagram", "Instagram tidak ditemukan"],
  ["ulasan", "Ulasan masih sedikit"],
  ["layanan", "Rating rendah"],
  ["maps", "Tidak muncul di Google Maps"],
];

/** Profil dianggap siap kalau jenis dan nama sudah diisi (jasa tersimpan terpisah sebagai offer). */
export const hasProfile = (p: BusinessProfile) => !!(p.kind && p.name?.trim());

const isGap: Record<Solve, (g: string) => boolean> = {
  website: (g) => g === "tanpa website",
  instagram: (g) => g === "IG tidak ditemukan",
  ulasan: (g) => g === "review sedikit",
  layanan: (g) => g.startsWith("rating "),
  maps: (g) => g === "tidak di hasil Maps",
};

export type Fit = { score: number; matches: string[]; avoid: string | null };

/** Cocok = celah bisnis ini termasuk yang bisa dibantu. Kata di "hindari" yang muncul di nama/kategori menurunkan urutan. */
export function fitOf(p: Biz, profile: BusinessProfile): Fit {
  const gaps = gapsOf(p) || [];
  const matches = (profile.solves || []).flatMap((s) => gaps.filter((g) => isGap[s]?.(g)));
  const text = `${clean(p.name)} ${clean(p.category || "")}`.toLowerCase();
  const avoid = (profile.avoid || "").toLowerCase().split(/[,;\n]/).map((w) => w.trim()).filter((w) => w.length >= 3).find((w) => text.includes(w)) ?? null;
  return { score: avoid ? -1 : matches.length, matches, avoid };
}

/** Pembanding untuk sort: paling cocok dulu, lalu skor prospek. */
export const byFit = (profile: BusinessProfile) => (a: Biz, b: Biz) =>
  fitOf(b, profile).score - fitOf(a, profile).score || (b.lead_score || 0) - (a.lead_score || 0);
