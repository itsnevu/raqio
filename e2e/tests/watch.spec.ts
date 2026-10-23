import { expect, test } from "@playwright/test";
import { apiJson, loginAs } from "../lib/api";

test.describe("pantau", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context);
  });

  test("halaman pantau termuat dan data watch bisa dibaca", async ({ page }) => {
    await page.goto("/watch");
    await expect(page.getByRole("heading", { level: 1, name: /pantau/i })).toBeVisible();
    const r = await apiJson<unknown[]>(page, "/watch/data");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json)).toBe(true);
    const alerts = await apiJson<{ alerts: unknown[]; unread: number }>(page, "/watch/alerts");
    expect(alerts.status).toBe(200);
    expect(Array.isArray(alerts.json.alerts)).toBe(true);
  });

  test("toggle pantau pada laporan pertama kalau ada", async ({ page }) => {
    const reports = await apiJson<Array<{ id: number; industry: string; area: string }>>(page, "/market/reports");
    test.skip(reports.json.length === 0, "belum ada laporan di org demo");
    const first = reports.json[0]!;
    const on = await apiJson<{ ok: boolean }>(page, "/market/watch", { method: "POST", body: { industry: first.industry, area: first.area, on: true } });
    expect([200, 402]).toContain(on.status);
    if (on.status === 200) {
      const off = await apiJson<{ ok: boolean }>(page, "/market/watch", { method: "POST", body: { industry: first.industry, area: first.area, on: false } });
      expect(off.status).toBe(200);
    }
  });
});
