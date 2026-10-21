import type { NextConfig } from "next";

// Semua endpoint data masih dilayani service Python (services/scraper/app.py).
// Path fetch di frontend tetap sama persis seperti versi HTML lama, Next hanya meneruskan.
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const BACKEND_PATHS = [
  "/market/:path+", // /market/reports, /market/report, /market/run, /market/lead, ...
  "/prospects/data",
  "/watch/data",
  "/business",
  "/chat",
  "/chat/:path*",
  "/log",
  "/run",
  "/ask",
  "/stop",
  // halaman lama yang masih dirender Python (belum diport)
  "/tools",
  "/competitors",
  "/report",
  "/static/:path*",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: BACKEND_PATHS.map((source) => ({
        source,
        destination: `${BACKEND}${source}`,
      })),
      fallback: [],
    };
  },
};

export default nextConfig;
