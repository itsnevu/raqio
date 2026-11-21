import { describe, expect, it } from "vitest";
import type { Biz } from "../biz";
import { DEFAULT_VIEW, FILTERS, applyView, countFilters, filterByKey, setFilter, sortRows, toggleSort, visibleFilters } from "./filters";
import { bizKey, powerScores } from "./power";
import { areaName, nominatimUrl } from "./geo";
import { EST_SEC_PER_AREA, ageText, etaText, parseOutcome, parseProgress } from "./progress";
import { findByKey, mergeDetail, setLeadIn, updateBiz } from "./report";
import type { Report } from "./types";
import { isReport, keyPoints, looksLikeSelf, normalizeReport, verdict } from "./verdict";

const biz = (o: Partial<Biz> = {}): Biz => ({ name: "Kopi Enak", ...o });
const report = (o: Partial<Report> = {}): Report => ({
  id: 1,
  industry: "coffee shop",
  area: "Kemang",
  created: "2026-10-01T00:00:00Z",
  summary: { businesses: 40, top3_share: 55, avg_rating: 4.6 },
  digital: { sampled: 20, website: 40, instagram: 50, whatsapp: 70, phone: 90 },
  insights: [],
  rating_buckets: [],
  size_buckets: [["<50", 20], ["50-200", 15], ["200+", 5]],
  leaders: [biz({ name: "Kopi Raja - Cabang Kemang", reviews: 900, rating: 4.8 })],
  all: [],
  ...o,
});

describe("filters", () => {
  const all = [
    biz({ key: "a", name: "A", _detailed: true, reviews: 50, phone: "0812345678", lead: { status: "dihubungi" } }),
    biz({ key: "b", name: "B", _detailed: true, reviews: 500, website: "https://b.id", instagram: "b" }),
    biz({ key: "c", name: "C", reviews: 10, rating: 4.9, lead: { status: "deal" } }),
  ];
  it("prospect hanya yang punya celah dan kontak", () => {
    expect(applyView(all, { ...DEFAULT_VIEW, filter: "prospect" }, false).map((p) => p.key)).toEqual(["a"]);
  });
  it("followup tidak memasukkan deal/tolak", () => {
    expect(applyView(all, { ...DEFAULT_VIEW, filter: "followup" }, false).map((p) => p.key)).toEqual(["a"]);
  });
  it("filtered berubah setelah status lead diubah secara immutable", () => {
    const view = { ...DEFAULT_VIEW, filter: "followup" };
    const before = applyView(all, view, false);
    const next = updateBiz(all, all[1]!, (p) => ({ ...p, lead: { status: "tertarik" } }));
    expect(next).not.toBe(all);
    expect(all[1]!.lead).toBeUndefined();
    expect(applyView(next, view, false).map((p) => p.key)).toEqual(["b", "a"]);
    expect(before.length).toBe(1);
  });
  it("mode pesaing menyembunyikan prospek dan follow up", () => {
    expect(visibleFilters(true).map((f) => f.key)).not.toContain("prospect");
    expect(applyView(all, { ...DEFAULT_VIEW, filter: "prospect" }, true)).toEqual([]);
  });
  it("pencarian tidak peka huruf besar", () => {
    expect(applyView(all, { ...DEFAULT_VIEW, q: "b.id" }, false).map((p) => p.key)).toEqual(["b"]);
  });
  it("hitung per filter dan kunci tak dikenal jatuh ke Semua", () => {
    expect(countFilters(all, false).get("web")).toBe(1);
    expect(filterByKey("nope").key).toBe("all");
    expect(FILTERS.length).toBe(9);
  });
  it("sort dan toggle arah", () => {
    expect(sortRows(all, "reviews", -1).map((p) => p.key)).toEqual(["b", "a", "c"]);
    expect(sortRows(all, "name", 1).map((p) => p.key)).toEqual(["a", "b", "c"]);
    const v1 = toggleSort(DEFAULT_VIEW, "name");
    expect(v1.dir).toBe(1);
    expect(toggleSort(v1, "name").dir).toBe(-1);
    expect(toggleSort(DEFAULT_VIEW, "lead").dir).toBe(-1);
    expect(setFilter(DEFAULT_VIEW, "prospect").sort).toBe("lead");
    expect(setFilter({ ...DEFAULT_VIEW, open: "x" }, "wa").open).toBeNull();
  });
});

describe("powerScores", () => {
  it("mengembalikan Map tanpa menulis ke objek", () => {
    const all = [biz({ key: "x", rating: 5, reviews: 2 }), biz({ key: "y", rating: 4.5, reviews: 400 }), biz({ key: "z" })];
    const m = powerScores(all);
    expect(m.size).toBe(2);
    expect(m.get("x")!).toBeLessThan(5); // rating 5 dari 2 ulasan ditarik ke rata-rata pasar
    expect(m.get("x")!).toBeGreaterThan(4.75);
    expect("_power" in all[0]!).toBe(false);
    expect(bizKey(biz(), 3)).toBe("Kopi Enak#3");
    expect(powerScores([]).size).toBe(0);
  });
  it("memakai power_score tersimpan dari worker bila ada (laporan baru)", () => {
    const all = [biz({ key: "besar", rating: 4.2, reviews: 3000, power_score: 4.202 }), biz({ key: "bagus", rating: 4.8, reviews: 400, power_score: 4.784 })];
    const m = powerScores(all);
    expect(m.get("besar")).toBe(4.202); // nilai worker dipakai apa adanya, bukan dihitung ulang
    expect(m.get("bagus")).toBe(4.784);
  });
});

describe("progress", () => {
  it("membaca langkah dan persentase", () => {
    expect(parseProgress("")).toEqual({ step: 0, pct: 3, compare: null });
    expect(parseProgress("[1/5] cari\n[3/5] ig").step).toBe(3);
    const c = parseProgress("[compare] wilayah 2/4: Tebet\n[2/5] x");
    expect(c.compare).toEqual({ i: 2, n: 4, area: "Tebet" });
    expect(c.pct).toBeCloseTo(30);
  });
  it("membaca hasil akhir", () => {
    expect(parseOutcome("...\nREPORT_PG_ID=12\n").reportId).toBe(12);
    expect(parseOutcome("x\nCOMPARE_DONE").compareDone).toBe(true);
    expect(parseOutcome("a\nGagal maps\n[selesai, exit code 1]\n").failReason).toBe("Gagal maps");
    expect(parseOutcome("log", "timeout worker").failReason).toBe("timeout worker");
  });
  it("hitung mundur estimasi", () => {
    expect(etaText(null, 1, 0)).toBe("± 5:30 lagi"); // belum mulai: anggaran penuh (330 detik/wilayah, termasuk sumber lain)
    expect(etaText(1000, 1, 1_120_000)).toBe("± 3:30 lagi"); // 120 detik berjalan, sisa 210
    expect(etaText(1000, 3, 1_000_000)).toBe("± 16:30 lagi"); // 3 wilayah = 3x anggaran
    expect(etaText(1000, 1, 1000_000 + EST_SEC_PER_AREA * 1000 + 1)).toBe("hampir selesai…");
  });
  it("format umur laporan", () => {
    expect(ageText(0)).toBe("kurang dari 1 jam");
    expect(ageText(5)).toBe("5 jam");
    expect(ageText(72)).toBe("3 hari");
  });
});

describe("geo", () => {
  it("menyusun nama wilayah dari jawaban Nominatim", () => {
    expect(areaName({ suburb: "Kelurahan Gading Serpong", county: "Kabupaten Tangerang" })).toBe("Gading Serpong Tangerang");
    expect(areaName({ village: "Dago", city: "Kota Bandung" })).toBe("Dago Bandung");
    expect(areaName({ town: "Ubud", county: "Kabupaten Gianyar" })).toBe("Ubud Gianyar");
    expect(areaName({ city: "Kota Administrasi Jakarta Selatan" })).toBe("Jakarta Selatan");
    expect(areaName({ town: "Sukabumi", city: "Sukabumi" })).toBe("Sukabumi"); // tanpa duplikat
    expect(areaName({})).toBe("");
  });
  it("membatasi zoom reverse geocoding 10 sampai 14", () => {
    expect(nominatimUrl(-6.2, 106.8, 5)).toContain("zoom=10");
    expect(nominatimUrl(-6.2, 106.8, 18)).toContain("zoom=14");
    expect(nominatimUrl(-6.2, 106.8, 12)).toContain("accept-language=id");
  });
});

describe("report immutability", () => {
  const R = report({ all: [biz({ key: "a" }), biz({ key: "b" })], leaders: [biz({ key: "a" })] });
  it("setLeadIn membuat laporan baru dan menyentuh leaders juga", () => {
    const n = setLeadIn(R, R.all![0]!, { status: "deal" });
    expect(n).not.toBe(R);
    expect(n.all![0]!.lead?.status).toBe("deal");
    expect(n.leaders![0]!.lead?.status).toBe("deal");
    expect(R.all![0]!.lead).toBeUndefined();
  });
  it("mergeDetail menandai _detailed", () => {
    const n = mergeDetail(R, R.all![1]!, { phone: "0812", website: "https://x.id" });
    expect(n.all![1]).toMatchObject({ phone: "0812", _detailed: true });
    expect(findByKey(n, "b")?.website).toBe("https://x.id");
    expect(findByKey(n, "zzz")).toBeNull();
  });
});

describe("verdict", () => {
  it("calon klien: celah website, langkah hubungi prospek", () => {
    const all = [biz({ key: "a", _detailed: true, reviews: 50, phone: "0812345678", rating: 4.8 })];
    const v = verdict(report({ all }), all, false);
    expect(v.headline).toContain("dikuasai Kopi Raja");
    expect(v.why).toMatch(/^Ada \d celah yang bisa digarap: /);
    expect(v.why).toContain("60% belum punya website");
    expect(v.why).toContain("50% tidak terlihat aktif di Instagram");
    expect(v.why).toContain("30% tidak mencantumkan WhatsApp");
    expect(v.next[0]).toBe("Hubungi 1 bisnis yang punya celah.");
    expect(v.next[1]).toContain("website atau katalog online");
    expect(v.next[1]).toContain("kelola konten Instagram");
    expect(v.reasons[2]![0]).toBe(1);
  });
  it("tanpa prospek dan pasar merata", () => {
    const v = verdict(report({ summary: { businesses: 5, top3_share: 10 }, digital: { sampled: 0, website: 0, instagram: 0, whatsapp: 0, phone: 0 }, size_buckets: [] }), [], false);
    expect(v.headline).toContain("ramai dan merata");
    expect(v.next[0]).toBe("Belum ada bisnis yang cocok dihubungi.");
  });
  it("pesaing: menyebut pesaing rapuh dan pemimpin", () => {
    const all = [biz({ key: "w", name: "Warung Lemah", rating: 4.0, reviews: 300 })];
    const v = verdict(report({ all }), all, true);
    expect(v.headline).toContain("Kamu punya 40 pesaing");
    expect(v.why).toContain("Warung Lemah");
    expect(v.leaders?.length).toBe(1);
  });
  it("keyPoints dan deteksi industri sendiri", () => {
    const kp = keyPoints(report(), [], false);
    expect(kp).toHaveLength(3);
    expect(kp[0]![0]).toBe("40 bisnis. Seberapa padat?");
    expect(looksLikeSelf("digital agency")).toBe(true);
    expect(looksLikeSelf("coffee shop")).toBe(false);
  });
  it("isReport menolak respons error dan normalizeReport mengisi default", () => {
    expect(isReport({ error: "laporan tidak ada" })).toBe(false);
    expect(isReport(null)).toBe(false);
    expect(isReport(report())).toBe(true);
    const n = normalizeReport({ industry: "x", area: "y", created: "", summary: {} as Report["summary"], digital: {} as Report["digital"] } as Report);
    expect(n.all).toEqual([]);
    expect(n.summary.businesses).toBe(0);
    expect(n.digital.sampled).toBe(0);
    expect(() => verdict(n, [], false)).not.toThrow();
  });
});

describe("sumber lain", () => {
  it("bisnis yang hanya ada di sumber lain jadi celah profil Google Maps dan tag tidak di hasil Maps", async () => {
    const { gapsOf } = await import("../biz");
    const off: Biz = { name: "Salon Baru", _detailed: true, on_maps: false, phone: "6281211110001", sources: ["overture"], reviews: 0 };
    expect(gapsOf(off)).toEqual(["tidak di hasil Maps", "tanpa website", "IG tidak ditemukan"]);
    const R = normalizeReport({
      industry: "salon", area: "x", created: "2026-01-01T00:00:00Z", insights: [], rating_buckets: [], size_buckets: [],
      summary: { businesses: 10, top3_share: 20 }, digital: { sampled: 0, website: 0, instagram: 0, whatsapp: 0, phone: 0 },
      sources: { maps: 8, seen_before: 0, detail_fresh: 0, detail_db: 0, detail_none: 8, ig_maps: 0, ig_website: 0, ig_other: 0, total: 10, extra_only: 2 },
      all: [off],
    } as Report);
    const v = verdict(R, R.all || [], false);
    expect(v.why).toContain("2 bisnis tidak muncul di hasil Google Maps");
    expect(v.next[1]).toContain("profil Google Maps");
  });
});
