import { expect, test } from "@playwright/test";
import { DEMO, apiJson, loginAs } from "../lib/api";

test.describe("pengaturan", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context);
  });

  test("halaman pengaturan menampilkan org, anggota, dan notifikasi", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText(DEMO.email).first()).toBeVisible();
    await expect(page.locator(".badge").first()).toBeVisible();
    await expect(page.getByText(/notifikasi pantauan/i)).toBeVisible();
  });

  test("API key dibuat, dipakai sebagai bearer, lalu dicabut", async ({ page }) => {
    const created = await apiJson<{ ok: boolean; id: number; key: string; prefix: string }>(page, "/org/api-keys", { method: "POST", body: { label: "e2e", role: "analyst" } });
    expect(created.status).toBe(200);
    expect(created.json.key).toMatch(/^rq_/);
    const me = await page.request.fetch("/auth/me", { headers: { Authorization: "Bearer " + created.json.key } });
    expect(me.status()).toBe(200);
    const revoked = await apiJson<{ ok: boolean }>(page, "/org/api-keys/revoke", { method: "POST", body: { id: created.json.id } });
    expect(revoked.json.ok).toBe(true);
    const after = await page.request.fetch("/auth/me", { headers: { Authorization: "Bearer " + created.json.key } });
    expect(after.status()).toBe(401);
  });

  test("webhook URL internal ditolak", async ({ page }) => {
    // 169.254.169.254 (metadata cloud) harus ditolak bahkan saat dev mengizinkan loopback (ALLOW_INSECURE_WEBHOOK=1)
    const r = await apiJson<{ error?: string }>(page, "/org/settings", { method: "POST", body: { webhook_url: "https://169.254.169.254/latest/meta-data" } });
    expect([400, 403]).toContain(r.status);
  });
});
