"use client";
// Strip angka total data yang sudah terkumpul (GET /stats, publik): bisnis, laporan, pasangan, logo, riset, cek kontak.
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

export type PublicStats = {
  businesses: number; scanned_rows: number; reports: number; pairs: number; logos: number; runs: number; details: number; chats: number;
  rank_views_7d: number; updated: string;
};

export const fmtN = (n: number) => new Intl.NumberFormat("id-ID").format(n || 0);

export default function StatsStrip() {
  const [s, setS] = useState<PublicStats | null>(null);
  useEffect(() => { apiGet<PublicStats>("/stats").then(setS).catch(() => setS(null)); }, []);
  if (!s || !s.reports) return null;
  const items: [number, string, string][] = [
    [s.businesses, "bisnis terkumpul", "di laporan terbaru tiap industri × wilayah"],
    [s.scanned_rows, "baris dipindai", "semua pindaian, termasuk pindai ulang"],
    [s.pairs, "industri × wilayah", `${fmtN(s.reports)} laporan`],
    [s.runs, "riset dijalankan", `${fmtN(s.details)} cek kontak · ${fmtN(s.chats)} jawaban asisten`],
    [s.logos, "logo bisnis", "dari website, Instagram, foto Maps"],
  ];
  return (
    <div className="stats" role="group" aria-label="Total data yang sudah terkumpul">
      {items.map(([n, label, sub]) => (
        <div key={label} className="stat"><b>{fmtN(n)}</b><span>{label}</span><small>{sub}</small></div>
      ))}
    </div>
  );
}
