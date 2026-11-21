"use client";
import { num } from "@/lib/biz";
import type { Compare } from "@/lib/market/types";

export default function CompareView({ c, onOpen }: { c: Compare; onOpen: (id: number) => void }) {
  if (!c.areas.length) return <div className="empty">Belum ada data untuk dibandingkan.</div>;
  return (
    <>
      <div className="rh"><div><h2>{c.industry} · {c.areas.length} wilayah</h2><div className="meta">Diurutkan dari skor peluang tertinggi</div></div></div>
      <div className="card"><h3>Kesimpulan</h3><ul>{c.insights.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      <div className="tcard"><div className="tw"><table>
        <thead><tr><th>Wilayah</th><th>Skor peluang</th><th>Bisnis</th><th>Rating</th><th className="hide-m">Ulasan/bisnis</th><th className="hide-m">Top 3</th><th className="hide-m">Hidden gem</th><th className="hide-m">Rating rendah</th><th>Website</th><th>WhatsApp</th><th>Prospek</th></tr></thead>
        <tbody>
          {c.areas.map((a, i) => (
            <tr key={a.report_id} className={i ? "" : "cmp-best"}>
              <td><div className="nm">{a.area}</div><button type="button" className="mini" onClick={() => onOpen(a.report_id)}>Buka laporan</button></td>
              <td className="score">{a.opportunity}</td><td>{a.businesses}{a.capped ? "+" : ""}</td><td>{a.avg_rating ?? "-"}</td><td className="hide-m">{num(a.reviews_per_business)}</td>
              <td className="hide-m">{a.top3_share}%</td><td className="hide-m">{a.gems}</td><td className="hide-m">{a.weak}</td><td>{a.website_pct}%</td><td>{a.whatsapp_pct}%</td><td>{a.prospects}</td>
            </tr>
          ))}
        </tbody>
      </table></div></div>
    </>
  );
}
