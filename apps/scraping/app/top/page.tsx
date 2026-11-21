"use client";
// Indeks peringkat publik: pasangan industri + wilayah yang punya peringkat skor terbuka.
import Link from "next/link";
import { useEffect, useState } from "react";
import "./top.css";
import { apiGet, errMsg } from "@/lib/api";

type Pair = { industry: string; area: string; updated: string; businesses: number };
const slug = (s: string) => encodeURIComponent(s.trim().toLowerCase());

export default function TopIndexPage() {
  const [items, setItems] = useState<Pair[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    apiGet<{ items: Pair[] }>("/rank/pairs").then((j) => setItems(j.items)).catch((e) => setErr(errMsg(e, "Gagal memuat")));
  }, []);
  const shown = (items || []).filter((p) => !q || (p.industry + " " + p.area).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="wrap topp">
      <h1>Siapa yang terbaik di kotamu?</h1>
      <p className="lead">Peringkat bisnis lokal per industri dan wilayah dengan <b>skor terbuka</b>: rating terkoreksi jumlah ulasan, skala logaritmik, dan kemudahan dihubungi. Bukan sekadar siapa yang paling banyak ulasan.</p>
      <label className="search-l">
        <span className="sr-only">Cari industri atau wilayah</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari: coffee shop, salon, Kemang, Bandung…" />
      </label>
      {err && <p className="err" role="alert">{err}</p>}
      {items && shown.length === 0 && <p className="muted">Belum ada peringkat untuk pencarian itu. Minta riset di wilayahmu lewat halaman Riset.</p>}
      <div className="pairs">
        {shown.map((p) => (
          <Link key={p.industry + p.area} href={`/top/${slug(p.industry)}/${slug(p.area)}`} className="pair">
            <b>{p.industry}</b>
            <span>{p.area}</span>
            <small>{p.businesses} bisnis · {new Date(p.updated).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</small>
          </Link>
        ))}
      </div>
      <p className="muted foot">Rumus, ambang kelayakan, dan riwayat perubahan standar terbuka di <Link href="/metodologi">/metodologi</Link>. Posisi peringkat tidak bisa dibeli. Pemilik bisnis bisa mengklaim halamannya gratis untuk melihat komponen skor dan cara menaikkannya.</p>
    </div>
  );
}
