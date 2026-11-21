import type { NextConfig } from "next";

// Semua endpoint data dilayani Go API (apps/api). Path fetch di frontend sama persis dengan versi lama,
// Next hanya meneruskan. /docs, /openapi.yaml, dan /metrics sengaja TIDAK diteruskan: akses langsung ke Go
// (Swagger UI memuat aset dari cdnjs yang tidak diizinkan CSP Next, dan /metrics bukan untuk browser).
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
  "/watch/alerts",
  "/watch/alerts/:path*",
  "/business",
  "/chat",
  "/chat/:path*",
  "/log",
  "/log/:path*",
  "/run",
  "/stop",
  // halaman audit publik + logo bisnis (API kampanye lewat /api/campaigns, lihat beforeFiles)
  "/audit/:path*",
  "/u/:path*",
  "/logo/:path*",
  // peringkat publik dan lencana
  "/rank",
  "/rank/:path*",
  "/badge/:path*",
  "/stats", // angka total data terkumpul (publik)
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // NEXT_DIST_DIR hanya untuk verifikasi build sambil `next dev` masih memakai .next (Dockerfile memakai default .next)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    return {
      // API kampanye: path /campaigns dipakai halaman Next, jadi klien memanggil /api/campaigns yang diteruskan sebelum routing halaman
      beforeFiles: [
        { source: "/api/campaigns", destination: `${API}/campaigns` },
        { source: "/api/campaigns/:path*", destination: `${API}/campaigns/:path*` },
      ],
      afterFiles: API_PATHS.map((source) => ({ source, destination: `${API}${source}` })),
      fallback: [],
    };
  },
  async headers() {
    // Content-Security-Policy dipasang middleware.ts (butuh nonce per request).
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
