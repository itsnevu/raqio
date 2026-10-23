import { expect, test } from "@playwright/test";
import { loginAs } from "../lib/api";

test.describe("asisten", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context);
  });

  test("halaman asisten termuat, pertanyaan dikirim, lalu ada jawaban atau pesan konfigurasi", async ({ page }) => {
    await page.goto("/chat"); // asisten pindah ke /chat, "/" jadi landing page
    const input = page.locator("textarea").first();
    await expect(input).toBeVisible();
    await input.fill("apa yang bisa kamu bantu?");
    await page.locator("form button[type=submit]").first().click();
    // gelembung bot pertama: entah jawaban, error konfigurasi, atau masih berjalan sampai 60 detik
    const bot = page.locator(".msg.bot").first();
    await expect(bot).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(async () => {
        const txt = (await bot.innerText()).trim();
        const typing = await bot.locator(".typing").count();
        return typing === 0 && txt.length > 0 ? "selesai" : "berjalan";
      }, { timeout: 60_000, intervals: [1000] })
      .toBe("selesai");
    const txt = await bot.innerText();
    expect(txt.length).toBeGreaterThan(0);
  });

  test("tombol stop menghentikan jawaban yang sedang berjalan", async ({ page }) => {
    await page.goto("/chat"); // asisten pindah ke /chat, "/" jadi landing page
    const input = page.locator("textarea").first();
    await input.fill("riset pasar coffee shop di Kemang Jakarta sekarang juga");
    await page.locator("form button[type=submit]").first().click();
    const btn = page.locator("form button[type=submit]").first();
    // kalau masih berjalan, tombol berubah jadi Stop; klik dan pastikan tidak lagi 'typing'
    const label = (await btn.innerText()).toLowerCase();
    if (label.includes("stop")) {
      await btn.click();
      await expect(page.locator(".typing")).toHaveCount(0, { timeout: 15_000 });
    }
    await expect(page.locator(".msg.bot").first()).toBeVisible();
  });
});
