import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { actions, describeError, isMutatingStep, isToolStep, quotaText, splitSteps, stepText } from "./steps";

describe("langkah agent", () => {
  it("memecah log per baris dan mengenali baris tool", () => {
    expect(splitSteps("🔧 a({})\n\nmembaca\r\n  \n")).toEqual(["🔧 a({})", "membaca"]);
    expect(isToolStep("🔧 a({})")).toBe(true);
    expect(isToolStep("membaca")).toBe(false);
  });
  it("label tool dikenal, argumen non-boolean ikut, tool asing pakai namanya", () => {
    expect(stepText('🔧 search_competitors({"q":"kopi","fresh":true})')).toBe("Mencari bisnis di lokasi (bisa beberapa menit)… (kopi)");
    expect(stepText("🔧 tool_baru({})")).toBe("tool_baru");
    expect(stepText("🔧 tanpa kurung")).toBe("tanpa kurung");
    expect(stepText("baris biasa")).toBe("baris biasa");
  });
  it("tool yang mengubah data terdeteksi, tool baca tidak", () => {
    expect(isMutatingStep("🔧 set_lead_status({})")).toBe(true);
    expect(isMutatingStep("🔧 watch_area({})")).toBe(true);
    expect(isMutatingStep("🔧 search_competitors({})")).toBe(false);
    expect(isMutatingStep("🔧 list_watches({})")).toBe(false);
    expect(isMutatingStep("membaca")).toBe(false);
  });
});

describe("pesan error dan aksi", () => {
  it("memetakan 409, 402, 503, dan kunci API kosong", () => {
    expect(describeError(new ApiError(409, "sibuk", "chat_busy")).code).toBe("busy");
    expect(describeError(new ApiError(409, "sibuk", "job_running")).code).toBe("busy");
    expect(describeError(new ApiError(402, "habis", "quota_exceeded")).code).toBe("quota");
    expect(describeError(new ApiError(503, "mati", "chat_disabled")).code).toBe("disabled");
    expect(describeError(new ApiError(500, "OPENROUTER_API_KEY belum diisi")).code).toBe("nokey");
    expect(describeError(new Error("x"))).toEqual({ error: "x", code: "other" });
  });
  it("aksi dari kata kunci jawaban dan teks kuota", () => {
    expect(actions("Prospek bisa dihubungi lewat WhatsApp").map(([h]) => h)).toEqual(["/market", "/prospects"]);
    expect(actions("Wilayah ini dipantau").map(([h]) => h)).toEqual(["/market", "/watch"]);
    expect(quotaText(null)).toBe("");
    expect(quotaText({ used: 3, limit: 50 })).toBe("Sisa kuota chat bulan ini: 47 dari 50.");
    expect(quotaText({ used: 51, limit: 50 })).toBe("Kuota chat bulan ini habis.");
  });
});
