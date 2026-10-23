// sitemap.xml: halaman statis publik + seluruh halaman peringkat /top/<industri>/<wilayah> dari API
// (mesin SEO programatik; tiap pasangan yang layak tayang otomatis ikut terindeks). Gagal mengambil
// daftar pasangan tidak mematikan sitemap — halaman statis tetap dikirim.
import type { MetadataRoute } from "next";

const BASE = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const API = process.env.API_URL || "http://127.0.0.1:8080";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [
    { url: BASE + "/", changeFrequency: "weekly", priority: 1 },
    { url: BASE + "/top", changeFrequency: "daily", priority: 0.9 },
    { url: BASE + "/metodologi", changeFrequency: "monthly", priority: 0.5 },
    { url: BASE + "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { url: BASE + "/terms", changeFrequency: "yearly", priority: 0.3 },
  ];
  try {
    const r = await fetch(API + "/rank/pairs", { next: { revalidate: 3600 } });
    const j = (await r.json()) as { items?: { industry: string; area: string; updated?: string }[] };
    for (const it of j.items || []) {
      urls.push({
        url: `${BASE}/top/${encodeURIComponent(it.industry.toLowerCase())}/${encodeURIComponent(it.area.toLowerCase())}`,
        lastModified: it.updated,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch {
    // API belum siap: sitemap statis saja
  }
  return urls;
}
