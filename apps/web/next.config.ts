import type { NextConfig } from "next";

// Semua endpoint data dilayani Go API (apps/api). Path fetch di frontend sama persis dengan versi lama,
// Next hanya meneruskan. Halaman IG lama masih dirender Python, tapi lewat Go (tetap wajib login).
const API = process.env.API_URL || "http://127.0.0.1:8080";

const API_PATHS = [
  "/auth/:path*",
  "/org",
  "/org/:path*",
  "/jobs",
  "/billing/:path*",
  "/market/:path+",
  "/prospects/data",
  "/watch/data",
  "/business",
  "/chat",
  "/chat/:path*",
  "/log",
  "/run",
  "/ask",
  "/stop",
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
      afterFiles: API_PATHS.map((source) => ({ source, destination: `${API}${source}` })),
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
