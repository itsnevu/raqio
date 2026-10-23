import { describe, expect, it } from "vitest";
import { igUrl, mailtoUrl, safeHttpUrl, safeNext } from "./safe";

const O = "https://app.raqio.id";

describe("safeNext (open redirect)", () => {
  it("menerima path internal", () => {
    expect(safeNext("/prospects?x=1#a", O)).toBe("/prospects?x=1#a");
    expect(safeNext("/settings?invite=abc", O)).toBe("/settings?invite=abc");
  });
  it("menolak protocol-relative, backslash, skema, dan nilai kosong", () => {
    expect(safeNext("//evil.com", O)).toBe("/market");
    expect(safeNext("/\\evil.com", O)).toBe("/market");
    expect(safeNext("/\\\\evil.com/x", O)).toBe("/market");
    expect(safeNext("https://evil.com/market", O)).toBe("/market");
    expect(safeNext("javascript:alert(1)", O)).toBe("/market");
    expect(safeNext("market", O)).toBe("/market");
    expect(safeNext("", O)).toBe("/market");
    expect(safeNext(null, O)).toBe("/market");
    expect(safeNext("/x\u0000y", O)).toBe("/market");
  });
  it("fallback bisa diganti", () => {
    expect(safeNext("//evil.com", O, "/")).toBe("/");
  });
});

describe("safeHttpUrl", () => {
  it("hanya http(s)", () => {
    expect(safeHttpUrl("https://x.id/a?b=1")).toBe("https://x.id/a?b=1");
    expect(safeHttpUrl("http://x.id")).toBe("http://x.id/");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hi")).toBeNull();
    expect(safeHttpUrl("x.id")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
  it("username IG dan email divalidasi", () => {
    expect(igUrl("@kopi.enak_1")).toBe("https://instagram.com/kopi.enak_1");
    expect(igUrl("a/b")).toBeNull();
    expect(mailtoUrl("a@b.id")).toBe("mailto:a@b.id");
    expect(mailtoUrl("a@b.id?subject=x")).toBeNull();
    expect(mailtoUrl("<x>")).toBeNull();
  });
});
