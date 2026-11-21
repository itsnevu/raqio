import { describe, expect, it } from "vitest";
import { clean, draft, fmtPhone, gapsOf, isGem, isProspect, isWeak, num, waOf, type Biz } from "./biz";

const biz = (o: Partial<Biz> = {}): Biz => ({ name: "Kopi Enak - Kemang", ...o });

describe("waOf", () => {
  it("nomor HP 08 jadi wa.me 628", () => expect(waOf(biz({ phone: "0812-3456-7890" }))).toBe("https://wa.me/6281234567890"));
  it("nomor 62 langsung dipakai", () => expect(waOf(biz({ phone: "+62 812 3456 7890" }))).toBe("https://wa.me/6281234567890"));
  it("telepon kantor 021 bukan WhatsApp", () => expect(waOf(biz({ phone: "021-5551234" }))).toBe(""));
  it("kosong kalau tidak ada telepon", () => expect(waOf(biz())).toBe(""));
});

describe("fmtPhone", () => {
  it("format 4-4-sisa dan 62 jadi 0", () => expect(fmtPhone(biz({ phone: "6281234567890" }))).toBe("0812-3456-7890"));
});

describe("gapsOf", () => {
  it("null kalau belum dicek detail", () => expect(gapsOf(biz())).toBeNull());
  it("mendeteksi celah", () => {
    expect(gapsOf(biz({ _detailed: true, reviews: 20, rating: 4.0 }))).toEqual(["tanpa website", "IG tidak ditemukan", "review sedikit", "rating 4"]);
  });
  it("akun IG bersama dianggap tidak ditemukan", () => {
    expect(gapsOf(biz({ _detailed: true, website: "https://x.id", instagram: "brand", instagram_shared: true, reviews: 500, rating: 4.8 }))).toEqual(["IG tidak ditemukan"]);
  });
});

describe("klasifikasi", () => {
  it("hidden gem: rating tinggi, ulasan sedang", () => expect(isGem(biz({ rating: 4.8, reviews: 100 }))).toBe(true));
  it("bukan gem kalau ulasan terlalu banyak", () => expect(isGem(biz({ rating: 4.8, reviews: 300 }))).toBe(false));
  it("rapuh: ramai tapi rating rendah", () => expect(isWeak(biz({ rating: 4.1, reviews: 200 }))).toBe(true));
  it("prospek butuh celah, ulasan <= 800, dan kontak", () => {
    expect(isProspect(biz({ _detailed: true, reviews: 50, phone: "0812345678" }))).toBe(true);
    expect(isProspect(biz({ _detailed: true, reviews: 50 }))).toBe(false);
    expect(isProspect(biz({ _detailed: true, reviews: 900, phone: "0812345678" }))).toBe(false);
  });
  it("mode pesaing tidak pernah prospek", () => expect(isProspect(biz({ _detailed: true, reviews: 50, phone: "0812345678" }), true)).toBe(false));
});

describe("teks", () => {
  it("clean buang karakter PUA dan titik tengah", () => expect(clean("Kopi Enak ·")).toBe("Kopi Enak"));
  it("num format Indonesia", () => {
    expect(num(999)).toBe("999");
    expect(num(12000)).toBe("12 rb");
    expect(num(1500000)).toBe("1,5 jt");
    expect(num(null)).toBe("-");
  });
  it("draft menyebut nama pendek, pujian rating, dan celah", () => {
    const d = draft(biz({ _detailed: true, rating: 4.7, reviews: 80, phone: "0812345678" }), "coffee shop", "Kemang");
    expect(d).toContain("Kopi Enak punya rating 4,7 dari 80 ulasan");
    expect(d).toContain("belum ada website");
    expect(d).toContain("coffee shop di sekitar Kemang");
  });
});

describe("csv", () => {
  it("prefix ' untuk sel yang bisa jadi formula, kutip ganda digandakan", async () => {
    const { csvCell, csvText, withLead } = await import("./biz");
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+62812")).toBe("\"'+62812\"");
    expect(csvCell("-5")).toBe("\"'-5\"");
    expect(csvCell("@admin")).toBe("\"'@admin\"");
    expect(csvCell("\tx")).toBe("\"'\tx\"");
    expect(csvCell("Kopi Enak")).toBe("\"Kopi Enak\"");
    expect(csvCell(["a", "b"])).toBe("\"a b\"");
    expect(csvCell(null)).toBe("\"\"");
    expect(csvText(["n"], [["=1"]])).toBe("﻿\"n\"\n\"'=1\"");
    const p = biz({ lead: { status: "baru", note: "x" } });
    const n = withLead(p, { status: "deal" });
    expect(n.lead).toMatchObject({ status: "deal", note: "x" });
    expect(p.lead?.status).toBe("baru");
  });
});
