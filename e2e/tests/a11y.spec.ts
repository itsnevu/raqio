import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginAs } from "../lib/api";

// Pelanggaran serious/critical menggagalkan tes; moderate hanya dicatat sebagai peringatan.
async function audit(page: import("@playwright/test").Page, name: string) {
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const warn = res.violations.filter((v) => v.impact === "moderate");
  if (warn.length) console.warn(`[a11y] ${name}: ${warn.length} moderate: ${warn.map((w) => w.id).join(", ")}`);
  expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node)`), `${name} serious/critical`).toEqual([]);
}

test.describe("aksesibilitas", () => {
  test("halaman login", async ({ page }) => {
    await page.goto("/login?manual=1");
    await audit(page, "login");
  });

  test("halaman riset", async ({ context, page }) => {
    await loginAs(context);
    await page.goto("/market");
    await page.waitForLoadState("networkidle");
    await audit(page, "market");
  });

  test("halaman pengaturan", async ({ context, page }) => {
    await loginAs(context);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await audit(page, "settings");
  });
});
