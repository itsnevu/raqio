import { beforeAll, describe, expect, it } from "vitest";
import { verifyToken } from "./auth";

// Membuat token persis seperti Go: sid.exp.base64url(HMAC-SHA256(sid.exp))
async function sign(sid: string, exp: number, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sid + "." + exp));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${sid}.${exp}.${b64}`;
}

describe("verifyToken", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = "rahasia-tes-yang-cukup-panjang";
  });
  it("menerima token valid", async () => {
    expect(await verifyToken(await sign("abc", Date.now() + 60000, "rahasia-tes-yang-cukup-panjang"))).toBe(true);
  });
  it("menolak token kedaluwarsa", async () => {
    expect(await verifyToken(await sign("abc", Date.now() - 1, "rahasia-tes-yang-cukup-panjang"))).toBe(false);
  });
  it("menolak tanda tangan dari secret lain", async () => {
    expect(await verifyToken(await sign("abc", Date.now() + 60000, "secret-salah"))).toBe(false);
  });
  it("menolak format rusak dan kosong", async () => {
    expect(await verifyToken("abc.def")).toBe(false);
    expect(await verifyToken(undefined)).toBe(false);
  });
});
