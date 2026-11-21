// Setup tes DOM (proyek "dom" di vitest.config.ts): matcher jest-dom untuk expect() dan bersih-bersih DOM tiap tes.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {}
});
