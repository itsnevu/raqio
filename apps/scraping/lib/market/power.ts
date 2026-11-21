// Skor kekuatan: rata-rata Bayesian. Rating ditarik ke rata-rata pasar sampai ulasannya cukup banyak.
// Sumber kebenaran angka ini worker (market.py power_scores, disimpan sebagai p.power_score dan dipakai
// peringkat leaders); formula di bawah hanya fallback untuk laporan lama yang belum menyimpannya.
// Mengembalikan Map kunci bisnis -> skor; tidak menulis apa pun ke objek bisnis.
import { type Biz, leadKey } from "../biz";

export const bizKey = (p: Biz, i: number) => leadKey(p) || `${p.name}#${i}`;

export function powerScores(all: Biz[]): Map<string, number> {
  const out = new Map<string, number>();
  const rated = all.filter((p) => p.rating);
  if (!rated.length) return out;
  const C = rated.reduce((s, p) => s + (p.rating || 0), 0) / rated.length;
  const sorted = rated.map((p) => p.reviews || 0).sort((a, b) => a - b);
  const m = Math.max(sorted[Math.floor(sorted.length / 2)] || 1, 10);
  all.forEach((p, i) => {
    if (typeof p.power_score === "number") {
      out.set(bizKey(p, i), p.power_score);
      return;
    }
    if (!p.rating) return;
    const v = p.reviews || 0;
    out.set(bizKey(p, i), (v / (v + m)) * (p.rating || 0) + (m / (v + m)) * C);
  });
  return out;
}
