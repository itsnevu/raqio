import { describe, expect, it } from "vitest";
import { publicOrigin } from "./publicOrigin";

const req = (url: string, h: Record<string, string>) => ({ url, headers: new Headers(h) });

describe("publicOrigin", () => {
  it("uses the proxied host and scheme instead of the internal listen address", () => {
    expect(publicOrigin(req("http://localhost:3121/market", { host: "app.raqio.id", "x-forwarded-proto": "https" }))).toBe("https://app.raqio.id");
  });
  it("prefers X-Forwarded-Host and takes the first value of a list", () => {
    expect(publicOrigin(req("http://localhost:3121/", { host: "127.0.0.1:3121", "x-forwarded-host": "app.raqio.id, proxy", "x-forwarded-proto": "https, http" }))).toBe("https://app.raqio.id");
  });
  it("falls back to the request origin in dev", () => {
    expect(publicOrigin(req("http://localhost:3002/market", {}))).toBe("http://localhost:3002");
  });
});
