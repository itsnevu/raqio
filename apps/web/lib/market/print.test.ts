import { describe, expect, it } from "vitest";
import type { Biz } from "../biz";
import { digitalRows, gemsOf, leadersOf, prospectsOf, topCategories, weakOf } from "./print";
import type { Report } from "./types";

const biz = (o: Partial<Biz>): Biz => ({ name: "X", ...o });
const all = [
  biz({ key: "a", name: "A", category: "Kafe", rating: 4.9, reviews: 50, _detailed: true, phone: "081234567890", lead_score: 80 }),
  biz({ key: "b", name: "B", category: "Kafe", rating: 4.1, reviews: 400, _detailed: true, website: "https://b.id", instagram: "b" }),
  biz({ key: "c", name: "C", category: "Restoran", rating: 4.5, reviews: 700, _detailed: true, phone: "081234567891", lead_score: 30, website: "https://c.id" }),
  biz({ key: "d", name: "D", rating: 4.8, reviews: 20, _detailed: true, instagram: "d", lead_score: 60 }),
];
const R = { industry: "kafe", area: "Kemang", leaders: [], digital: { sampled: 4, website: 50, instagram: 50, whatsapp: 50, phone: 50 } } as unknown as Report;

describe("laporan cetak", () => {
  it("komposisi kategori menggabungkan sisa ke Lainnya", () => {
    expect(topCategories(all, 1)).toEqual([["Kafe", 2], ["Lainnya", 2]]);
    expect(topCategories(all)).toEqual([["Kafe", 2], ["Restoran", 1], ["Lainnya", 1]]);
  });
  it("pemimpin dari ulasan terbanyak bila leaders kosong, hidden gem dan pemain lemah sesuai aturan", () => {
    expect(leadersOf(R, all, 2).map((p) => p.key)).toEqual(["c", "b"]);
    expect(gemsOf(all).map((p) => p.key)).toEqual(["a", "d"]);
    expect(weakOf(all).map((p) => p.key)).toEqual(["b"]);
  });
  it("prospek diurutkan dari skor tertinggi dan kosong di mode pesaing", () => {
    // b: rating rendah dan punya IG tapi tanpa skor, jadi paling bawah; c: 700 ulasan masih di bawah batas 800
    expect(prospectsOf(all, false).map((p) => p.key)).toEqual(["a", "d", "c", "b"]);
    expect(prospectsOf(all, true)).toEqual([]);
    expect(digitalRows(R.digital).map(([k]) => k)).toEqual(["Bisa WhatsApp", "Punya telepon", "Punya website", "Instagram terdeteksi"]);
  });
});
