// robots.txt: halaman publik boleh diindeks (landing, /top, metodologi, legal); halaman aplikasi tidak.
import type { MetadataRoute } from "next";

const BASE = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/market", "/prospects", "/watch", "/settings", "/chat", "/campaigns", "/login", "/register", "/forgot", "/reset", "/p/", "/audit/"],
    }],
    sitemap: BASE + "/sitemap.xml",
  };
}
