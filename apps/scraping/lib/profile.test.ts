import { describe, expect, it } from "vitest";
import { type Biz, draft } from "./biz";
import { byFit, fitOf, hasProfile } from "./profile";

const biz = (o: Partial<Biz>) => ({ name: "Salon A", _detailed: true, rating: 4.8, reviews: 200, website: "https://a.id", instagram: "a", ...o }) as Biz;

describe("profil bisnis", () => {
  it("siap kalau jenis dan nama terisi", () => {
    expect(hasProfile({})).toBe(false);
    expect(hasProfile({ kind: "usaha", name: " " })).toBe(false);
    expect(hasProfile({ kind: "perorangan", name: "Sari" })).toBe(true);
  });
  it("mencocokkan celah yang bisa dibantu saja", () => {
    expect(fitOf(biz({ website: undefined, instagram: undefined }), { solves: ["website"] }).matches).toEqual(["tanpa website"]);
    expect(fitOf(biz({}), { solves: ["website"] }).score).toBe(0);
  });
  it("tidak menyimpulkan apa pun kalau detail belum dicek", () => {
    expect(fitOf(biz({ _detailed: false, website: undefined }), { solves: ["website"] }).matches).toEqual([]);
  });
  it("menurunkan yang termasuk daftar hindari", () => {
    const pet = biz({ name: "Magadisa", category: "Salon Hewan Peliharaan", website: undefined, lead_score: 99 });
    const hair = biz({ name: "Salon B", lead_score: 10 });
    const profile = { solves: ["website" as const], avoid: "hewan, klinik" };
    expect(fitOf(pet, profile).avoid).toBe("hewan");
    expect([pet, hair].sort(byFit(profile))[0]).toBe(hair);
  });
  it("draf memakai nama dari profil, tanpa profil tetap netral", () => {
    expect(draft(biz({}), "salon", "Kemang", "foto produk", { kind: "agensi", name: "Kita" })).toContain("Saya dari Kita.");
    expect(draft(biz({}), "salon", "Kemang", "foto produk", { kind: "perorangan", name: "Sari" })).toContain("Saya Sari.");
    expect(draft(biz({}), "salon", "Kemang", "foto produk", {})).toContain("salam kenal. Saya lihat");
  });
});
