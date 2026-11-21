import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = { distDir: ".next-marketing", poweredByHeader: false, outputFileTracingRoot: path.resolve(process.cwd(),"../.."), images:{formats:["image/avif","image/webp"]} };
export default config;
