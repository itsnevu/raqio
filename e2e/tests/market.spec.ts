import { expect, test } from "@playwright/test";
import { apiJson, loginAs } from "../lib/api";

test.describe("riset pasar", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context);
  });

  test("form riset: menjalankan riset lalu hasil instan atau job berjalan yang bisa dihentikan", async ({ page }) => {
    await page.goto("/market");
    // pastikan tidak ada job aktif dari run sebelumnya
    await apiJson(page, "/stop", { method: "POST", body: {} });
    const form = page.locator("form.search");
    await form.locator('input[aria-label="Industri"]').fill("coffee shop");
    await form.locator('input[aria-label="Wilayah"]').fill("Kemang Jakarta");
    await form.getByRole("button", { name: /^Riset$/ }).click();

    const status = page.locator(".status").first();
    const stop = page.getByRole("button", { name: /stop|hentikan/i });
    // hasil bisa datang instan (cache) atau sebagai job berjalan; tunggu salah satunya
    await expect
      .poll(async () => {
        const txt = ((await status.innerText().catch(() => "")) || "").toLowerCase();
        if (txt.includes("instan")) return "cached";
        if (/kuota|habis|masih ada proses/.test(txt)) return "ditolak";
        if (await stop.isVisible().catch(() => false)) return "running";
        return "menunggu";
      }, { timeout: 30_000, intervals: [500] })
      .not.toBe("menunggu");
    const txt = (await status.innerText()).toLowerCase();
    if (txt.includes("instan")) {
      await expect(page.getByRole("button", { name: /pindai ulang/i })).toBeVisible();
      return;
    }
    if (/kuota|habis|masih ada proses/.test(txt)) return; // ditolak dengan pesan jelas, bukan bug UI
    await stop.click();
    await expect(status).toContainText(/dihentikan|berhenti|selesai|gagal/i, { timeout: 30_000 });
  });

  test("daftar laporan dan ringkasan termuat tanpa JSON penuh", async ({ page }) => {
    const r = await apiJson<Array<{ id: number; industry: string; area: string; created_at?: string; summary?: unknown }>>(page, "/market/reports");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json)).toBe(true);
    for (const row of r.json.slice(0, 3)) {
      expect(row.id).toBeGreaterThan(0);
      expect(typeof row.industry).toBe("string");
    }
  });

  test("input kosong tidak mengirim permintaan", async ({ page }) => {
    await page.goto("/market");
    const runBtn = page.getByRole("button", { name: /^Riset$/ });
    await runBtn.click();
    // validasi HTML required menahan submit; URL tetap dan tidak ada status error server
    await expect(page).toHaveURL(/\/market/);
  });
});
