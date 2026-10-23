import { expect, test } from "@playwright/test";
import { DEMO, ensureDemo } from "../lib/api";

test.describe("login", () => {
  test.beforeAll(async () => {
    await ensureDemo();
  });

  test("login demo sukses lalu masuk ke riset", async ({ page }) => {
    await page.goto("/login?manual=1");
    await page.getByLabel(/email/i).fill(DEMO.email);
    await page.getByLabel(/password/i).fill(DEMO.password);
    await page.locator("form.box button.btn:not(.ghost)").click();
    await expect(page).toHaveURL(/\/market/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("password salah menampilkan pesan error yang dapat diakses", async ({ page }) => {
    await page.goto("/login?manual=1");
    await page.getByLabel(/email/i).fill(DEMO.email);
    await page.getByLabel(/password/i).fill("salah-sekali-123");
    await page.locator("form.box button.btn:not(.ghost)").click();
    await expect(page.getByRole("alert").filter({ hasText: /salah|gagal|tidak/i }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("parameter next tidak bisa membawa keluar origin (open redirect)", async ({ page }) => {
    await page.goto("/login?manual=1&next=/%5Cevil.example.com");
    await page.getByLabel(/email/i).fill(DEMO.email);
    await page.getByLabel(/password/i).fill(DEMO.password);
    await page.locator("form.box button.btn:not(.ghost)").click();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).origin).toBe(new URL(process.env.E2E_BASE_URL || "http://localhost:3000").origin);
    expect(page.url()).not.toMatch(/evil\.example\.com/);
  });

  test("tombol coba tanpa daftar tersedia di halaman login", async ({ page }) => {
    await page.goto("/login?manual=1");
    await expect(page.getByRole("button", { name: /coba tanpa daftar/i })).toBeVisible();
  });
});
