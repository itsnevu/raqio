import { FlatCompat } from "@eslint/eslintrc";
const config = [
  { ignores: [".next/**", ".next-marketing/**", "next-env.d.ts"] },
  ...new FlatCompat().extends("next/core-web-vitals", "next/typescript"),
];

export default config;
