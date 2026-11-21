import { describe, expect, it } from "vitest";
import { checkArea, looksLikeArea, nominatimSearchUrl } from "./geo";

const fakeFetch = (rows: unknown[], ok = true) => (async () => ({ ok, json: async () => rows })) as unknown as typeof fetch;

describe("validasi wilayah", () => {
  it("menolak isian asal sebelum ke geocoder", () => {
    for (const bad of ["te", "xxxx", "qwrtp", "aaaa"]) expect(looksLikeArea(bad), bad).toBe(false);
    expect(looksLikeArea("asdf")).toBe(true); // lolos aturan dasar, ditolak geocoder (tidak ada di peta)
    for (const good of ["Kemang Jakarta", "Dago Bandung", "Gading Serpong"]) expect(looksLikeArea(good), good).toBe(true);
  });
  it("URL pencarian dibatasi Indonesia", () => {
    expect(nominatimSearchUrl("Kemang Jakarta")).toContain("countrycodes=id");
    expect(nominatimSearchUrl("Kemang Jakarta")).toContain("q=Kemang%20Jakarta");
  });
  it("wilayah yang ditemukan dipakai dengan nama ringkas", async () => {
    const r = await checkArea("  kemang   jakarta ", fakeFetch([{ address: { suburb: "Kemang", city: "Jakarta Selatan" } }]));
    expect(r).toEqual({ ok: true, name: "kemang jakarta" });
  });
  it("wilayah yang tidak ditemukan ditolak dengan alasan", async () => {
    const r = await checkArea("Zxcvbnm Kota", fakeFetch([]));
    expect(r.ok).toBe(false);
  });
  it("jaringan gagal tidak memblokir", async () => {
    const r = await checkArea("Tebet Jakarta", (async () => { throw new Error("offline"); }) as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, name: "Tebet Jakarta" });
  });
});
