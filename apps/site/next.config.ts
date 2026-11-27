import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  // old product URLs → agent pages
  async redirects() { return [
    { source: "/market-research", destination: "/agents/research", permanent: true },
    { source: "/wa-suite", destination: "/agents/customer-service", permanent: true },
  ]; },
};
export default config;
