import { expect, request, type BrowserContext, type Page } from "@playwright/test";

export const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
export const API = process.env.E2E_API_URL || "http://localhost:8080";
export const DEMO = { email: process.env.E2E_USER || "demo@raqio.local", password: process.env.E2E_PASS || "demo12345" };

const cookieOf = (setCookie: string[] | undefined) => {
  const raw = (setCookie || []).find((c) => c.startsWith("raqio_session="));
  if (!raw) return null;
  const [pair] = raw.split(";");
  const [name, value] = (pair || "").split("=");
  return name && value ? { name, value } : null;
};

async function putCookie(ctx: BrowserContext, cookie: { name: string; value: string }) {
  const u = new URL(BASE);
  await ctx.addCookies([{ name: cookie.name, value: cookie.value, domain: u.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
}

/** Login lewat API Go langsung lalu pasang cookie ke konteks browser. */
export async function loginAs(ctx: BrowserContext, email = DEMO.email, password = DEMO.password) {
  const rq = await request.newContext({ baseURL: API });
  const r = await rq.post("/auth/login", { data: { email, password }, headers: { "Content-Type": "application/json" } });
  expect(r.status(), "login API").toBe(200);
  const cookie = cookieOf(r.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value));
  expect(cookie, "cookie sesi").not.toBeNull();
  await putCookie(ctx, cookie!);
  await rq.dispose();
}

/** Sesi tamu lewat API; IP dipalsukan unik supaya tidak kena limiter tamu di dev (API mempercayai XFF dari localhost). */
export async function guestSession(ctx: BrowserContext) {
  const rq = await request.newContext({ baseURL: API });
  const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
  const r = await rq.post("/auth/guest", { data: {}, headers: { "Content-Type": "application/json", "X-Forwarded-For": ip } });
  expect([200, 429], "guest API").toContain(r.status());
  if (r.status() === 429) throw new Error("limiter tamu aktif, coba lagi nanti");
  const cookie = cookieOf(r.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value));
  expect(cookie).not.toBeNull();
  await putCookie(ctx, cookie!);
  const body = (await r.json()) as { expires_in_hours: number; limits: { runs: number } };
  await rq.dispose();
  return body;
}

/** Panggil API lewat browser (cookie ikut, same-origin lewat rewrite Next). */
export async function apiJson<T = Record<string, unknown>>(page: Page, path: string, init?: { method?: string; body?: unknown }) {
  const r = await page.request.fetch(path, {
    method: init?.method || "GET",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    data: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: r.status(), json: (await r.json().catch(() => ({}))) as T };
}

/** Pastikan akun demo ada (register membalas 200 juga bila sudah ada). */
export async function ensureDemo() {
  const rq = await request.newContext({ baseURL: API });
  const r = await rq.post("/auth/register", {
    data: { email: DEMO.email, password: DEMO.password, name: "Demo", org: "Demo Org" },
    headers: { "Content-Type": "application/json" },
  });
  expect([200, 409]).toContain(r.status());
  await rq.dispose();
}
