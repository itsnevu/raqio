// Alat bantu tes DOM: mock fetch per "METHOD /path" dan fixture profil/org. Bukan berkas tes (tidak cocok pola *.test.*).
import { vi } from "vitest";
import type { Me, Org } from "@/lib/api";

export const json = (body: unknown, status = 200) =>
  new Response(body == null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export type MockReq = { url: string; method: string; body: unknown; init: RequestInit };
export type Route = unknown | Response | ((r: MockReq) => unknown | Response | Promise<unknown | Response>);

/**
 * Ganti global fetch dengan router kecil. Kunci: "GET /chat/sessions" (tanpa query). Nilai: objek JSON (status 200),
 * Response, atau fungsi yang menerima permintaan. Path tanpa mock dibalas 404 supaya kesalahan tes terlihat.
 */
export function mockFetch(routes: Record<string, Route>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init.method || "GET").toUpperCase();
    const path = url.split("?")[0] || url;
    const key = method + " " + path;
    if (!(key in routes)) return json({ error: "tidak ada mock untuk " + key }, 404);
    const r = routes[key];
    let body: unknown = null;
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const out = typeof r === "function" ? await (r as (q: MockReq) => unknown)({ url, method, body, init }) : r;
    return out instanceof Response ? out : json(out);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Body JSON dari panggilan fetch terakhir ke path tertentu (method POST). */
export function lastBody(fn: ReturnType<typeof mockFetch>, path: string, method = "POST"): unknown {
  const call = [...fn.mock.calls].reverse().find(([u, i]) => String(u).split("?")[0] === path && ((i as RequestInit | undefined)?.method || "GET").toUpperCase() === method);
  if (!call) return undefined;
  const b = (call[1] as RequestInit | undefined)?.body;
  return typeof b === "string" ? JSON.parse(b) : b;
}

export const LIMITS = { runs: 3, details: 10, watches: 1, areas: 3, members: 2, chats: 50, queue: 3 };

export const me = (over: Partial<Me> = {}): Me => ({
  email: "a@b.id", org_id: "org1", role: "owner", plan: "free", verified: true, guest: false, limits: LIMITS, orgs: [], ...over,
});

export const org = (over: Partial<Org> = {}): Org => ({ name: "Tim A", plan: "free", members: [], usage: { chat: 3 }, limits: LIMITS, ...over });
