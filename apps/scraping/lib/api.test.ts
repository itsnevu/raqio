import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, errMsg, parseError, request } from "./api";

const res = (status: number, body: string | null, ct = "application/json") =>
  new Response(body, { status, headers: body == null ? {} : { "Content-Type": ct } });

afterEach(() => vi.unstubAllGlobals());

describe("parseError", () => {
  it("membaca {error, code}", () => {
    const e = parseError(402, { error: "Kuota riset habis", code: "quota_exceeded" });
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(402);
    expect(e.code).toBe("quota_exceeded");
    expect(e.message).toBe("Kuota riset habis");
  });
  it("pesan baku per status kalau body bukan JSON error", () => {
    expect(parseError(401, null).message).toBe("Sesi berakhir. Masuk lagi.");
    expect(parseError(500, "<html>Internal</html>").message).toContain("Server bermasalah");
    expect(parseError(418, {}).message).toBe("Gagal (HTTP 418).");
    expect(parseError(409, "sibuk").message).toBe("sibuk");
  });
});

describe("request / api", () => {
  it("mengirim JSON dengan Content-Type dan Accept", async () => {
    const fetchMock = vi.fn(async () => res(200, '{"ok":true,"job":7}'));
    vi.stubGlobal("fetch", fetchMock);
    const j = await api<{ job: number }>("/market/run", { method: "POST", json: { industry: "a", area: "b" } });
    expect(j.job).toBe(7);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/market/run");
    expect(init.body).toBe('{"industry":"a","area":"b"}');
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
    expect((init.headers as Headers).get("Accept")).toBe("application/json");
    expect(init.credentials).toBe("same-origin");
  });
  it("melempar ApiError dengan code untuk respons non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(409, '{"error":"Masih ada proses yang berjalan.","code":"job_running"}')));
    await expect(api("/market/run")).rejects.toMatchObject({ status: 409, code: "job_running", message: "Masih ada proses yang berjalan." });
  });
  it("respons 202 dikembalikan dengan status oleh request()", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(202, '{"ok":true,"job":9,"pending":true}')));
    const r = await request<{ job: number }>("/market/detail", { method: "POST", json: {} });
    expect(r.status).toBe(202);
    expect(r.data.job).toBe(9);
  });
  it("body kosong dan body non-JSON tidak membuat crash", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(200, null)));
    expect(await api("/x")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => res(200, "teks", "text/plain")));
    expect(await api("/x")).toBe("teks");
  });
  it("kegagalan jaringan jadi ApiError status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(api("/x")).rejects.toMatchObject({ status: 0 });
    expect(errMsg(new ApiError(0, "Tidak bisa terhubung"))).toBe("Tidak bisa terhubung");
    expect(errMsg("apa", "fallback")).toBe("fallback");
  });
});
