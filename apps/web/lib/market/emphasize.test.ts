import { describe, expect, it } from "vitest";
import { emphasizeParts } from "./emphasize";

const marked = (s: string) => emphasizeParts(s).filter((p) => p.k).map((p) => p.t);

describe("emphasizeParts", () => {
  it("menyorot persentase, rating, dan jumlah dengan satuannya", () => {
    expect(marked("70% belum punya website, rating rata-rata 4,67 dari 99 bisnis")).toEqual(["70%", "website", "rating", "4,67", "99 bisnis"]);
  });
  it("menyorot kata kunci tanpa peduli huruf besar kecil", () => {
    expect(marked("Celah paling besar: Prospek bisa WhatsApp")).toEqual(["Celah", "Prospek", "WhatsApp"]);
  });
  it("teks tanpa kata kunci tetap utuh", () => {
    const parts = emphasizeParts("Pasar ini biasa saja.");
    expect(parts).toEqual([{ t: "Pasar ini biasa saja.", k: false }]);
  });
  it("menyusun ulang teks tanpa kehilangan karakter", () => {
    const s = "3 teratas memegang 32% ulasan, sisanya kecil-kecil";
    expect(emphasizeParts(s).map((p) => p.t).join("")).toBe(s);
  });
});
