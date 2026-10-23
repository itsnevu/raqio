import { expect, test } from "@playwright/test";
import { apiJson, guestSession } from "../lib/api";

test.describe("mode tamu", () => {
  test("sesi tamu masuk ke riset dengan banner dan kuota", async ({ context, page }) => {
    const g = await guestSession(context);
    expect(g.limits.runs).toBeGreaterThan(0);
    await page.goto("/market");
    await expect(page).toHaveURL(/\/market/);
    await expect(page.locator(".notice[data-id=guest]")).toBeVisible();
    const me = await apiJson<{ guest: boolean; plan: string; limits: { runs: number } }>(page, "/auth/me");
    expect(me.status).toBe(200);
    expect(me.json.guest).toBe(true);
    expect(me.json.plan).toBe("guest");
  });

  test("tamu tidak boleh memaksa pindai ulang dan tidak bisa membuat API key", async ({ context, page }) => {
    await guestSession(context);
    await page.goto("/market");
    const fresh = await apiJson<{ code?: string }>(page, "/market/run", { method: "POST", body: { industry: "coffee shop", area: "Kemang Jakarta", fresh: true } });
    expect([403, 409]).toContain(fresh.status);
    const key = await apiJson(page, "/org/api-keys", { method: "POST", body: { label: "x" } });
    expect(key.status).toBe(403);
  });

  test("pengunjung tanpa sesi diarahkan ke login (atau auto tamu di dev)", async ({ page }) => {
    const r = await page.request.fetch("/market", { maxRedirects: 0 });
    expect([307, 302, 200]).toContain(r.status());
    if (r.status() !== 200) expect(r.headers()["location"] || "").toMatch(/\/login/);
  });
});
