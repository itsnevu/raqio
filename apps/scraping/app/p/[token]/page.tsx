"use client";
// Halaman audit personal publik untuk satu prospek: posisi bisnisnya di antara pesaing terdekat, celah, dan penawaran.
// Dibagikan lewat variabel {audit} di pesan kampanye. Tanpa login, tanpa data pribadi selain nama bisnis publik.
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import "./audit.css";
import BizAvatar from "@/components/BizAvatar";
import { apiGet, errMsg } from "@/lib/api";

type Biz = { name: string; rating: number; reviews: number; category: string; has_website: boolean; has_instagram: boolean };
type Audit = {
  business: Biz; gap: string; rank: number; total: number; industry: string; area: string; competitors: Biz[];
  summary?: { avg_rating?: number; businesses?: number; top3_share?: number }; offer: { org: string; sender: string; phone: string; jasa: string }; created: string;
};

export default function AuditPage() {
  const { token } = useParams<{ token: string }>();
  const [a, setA] = useState<Audit | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    apiGet<Audit>("/audit/" + encodeURIComponent(token)).then(setA).catch((e) => setErr(errMsg(e, "Halaman tidak ditemukan")));
  }, [token]);
  if (err) return <div className="auditp"><div className="box"><h1>Halaman tidak ditemukan</h1><p>{err}</p></div></div>;
  if (!a) return <div className="auditp"><div className="box"><p>Memuat…</p></div></div>;
  const b = a.business;
  const wa = a.offer.phone ? `https://wa.me/${a.offer.phone}?text=${encodeURIComponent(`Halo ${a.offer.sender || a.offer.org}, saya dari ${b.name}, mau tanya soal ${a.offer.jasa || "penawarannya"}.`)}` : "";
  const avg = a.summary?.avg_rating;
  return (
    <div className="auditp">
      <div className="box">
        <div className="brand"><BizAvatar name={b.name} size={44} /><div><small>Audit singkat untuk</small><h1>{b.name}</h1></div></div>
        <p className="sub">{a.industry} di {a.area} · {a.total} bisnis dipindai dari Google Maps</p>

        <div className="kpis">
          <div><b>#{a.rank}</b><span>dari {a.total} berdasarkan jumlah ulasan</span></div>
          <div><b>{b.rating ? b.rating.toFixed(1) : "-"}</b><span>rating kamu{avg ? `, rata-rata pasar ${avg.toFixed(2)}` : ""}</span></div>
          <div><b>{b.reviews}</b><span>ulasan</span></div>
          <div><b>{b.has_website ? "Ada" : "Belum"}</b><span>website</span></div>
          <div><b>{b.has_instagram ? "Ada" : "Belum"}</b><span>Instagram ditemukan</span></div>
        </div>

        <h2>Celah yang terlihat</h2>
        <p className="gap">{a.gap}</p>

        <h2>5 pesaing terkuat di sekitar</h2>
        <table>
          <thead><tr><th>Bisnis</th><th>Rating</th><th>Ulasan</th><th>Website</th><th>IG</th></tr></thead>
          <tbody>
            {a.competitors.map((c) => (
              <tr key={c.name}><td><BizAvatar name={c.name} size={24} /> {c.name}</td><td>{c.rating ? c.rating.toFixed(1) : "-"}</td><td>{c.reviews}</td><td>{c.has_website ? "✓" : "–"}</td><td>{c.has_instagram ? "✓" : "–"}</td></tr>
            ))}
            <tr className="me"><td><BizAvatar name={b.name} size={24} /> {b.name} (kamu)</td><td>{b.rating ? b.rating.toFixed(1) : "-"}</td><td>{b.reviews}</td><td>{b.has_website ? "✓" : "–"}</td><td>{b.has_instagram ? "✓" : "–"}</td></tr>
          </tbody>
        </table>

        <div className="offer">
          <h2>{a.offer.org || "Kami"} bisa bantu</h2>
          <p>{a.offer.jasa ? `${a.offer.sender ? a.offer.sender + " dari " : ""}${a.offer.org} membantu bisnis ${a.industry} di ${a.area} untuk ${a.offer.jasa}.` : `Hubungi ${a.offer.sender || a.offer.org} untuk langkah berikutnya.`}</p>
          {wa && <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">Chat WhatsApp {a.offer.sender || a.offer.org}</a>}
        </div>
        <p className="foot">Data dari Google Maps, {new Date(a.created).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}. Dibuat dengan Raqio.</p>
      </div>
    </div>
  );
}
