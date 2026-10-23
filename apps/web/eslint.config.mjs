import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import jsxA11y from "eslint-plugin-jsx-a11y";

// eslint-config-next 15.5 masih format eslintrc, dijembatani FlatCompat.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts", "lib/api.gen.d.ts", "tsconfig.tsbuildinfo"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // plugin jsx-a11y sudah didaftarkan eslint-config-next; di sini hanya aturan "recommended"-nya yang diaktifkan
  { files: ["**/*.{jsx,tsx}"], rules: { ...jsxA11y.flatConfigs.recommended.rules, "jsx-a11y/label-has-associated-control": ["error", { depth: 3 }] } },
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
];

export default config;
