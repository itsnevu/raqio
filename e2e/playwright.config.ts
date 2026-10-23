import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL: frontend (Next). E2E_API_URL: Go API langsung, dipakai helper untuk membuat sesi tanpa UI.
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  fullyParallel: false,
  reporter: [["list"], ["html", { outputFolder: "report", open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "id-ID",
    viewport: { width: 1360, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
