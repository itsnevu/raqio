import { defineConfig } from "vitest/config";
import path from "node:path";

// Dua proyek: tes logika murni (lib/**/*.test.ts) di Node, tes komponen React (**/*.test.tsx) di jsdom dengan jest-dom.
// JSX dikompilasi otomatis (tsconfig memakai "preserve" untuk Next).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  esbuild: { jsx: "automatic" },
  test: {
    env: { AUTH_SECRET: "rahasia-tes-yang-cukup-panjang" },
    projects: [
      { extends: true, test: { name: "node", include: ["lib/**/*.test.ts"], environment: "node" } },
      {
        extends: true,
        test: {
          name: "dom",
          include: ["**/*.test.tsx"],
          exclude: ["node_modules/**", ".next/**", ".next-build/**"],
          environment: "jsdom",
          setupFiles: ["./test/setup.ts"],
        },
      },
    ],
  },
});
