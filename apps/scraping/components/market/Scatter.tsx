"use client";
import type { ReactNode } from "react";
import { type Biz, isProspect, num } from "@/lib/biz";
import { bizKey } from "@/lib/market/power";
import { safeHttpUrl } from "@/lib/safe";
import { type Tip, tipHtml } from "./Tip";

export default function Scatter({ all, rival, tip, power }: { all: Biz[]; rival: boolean; tip: Tip; power: Map<string, number> }) {
  const pts = all.map((p, i) => ({ p, k: bizKey(p, i) })).filter(({ p }) => p.rating && (p.reviews || 0) > 0);
  if (pts.length < 3) return <div className="empty" style={{ padding: 30 }}>Data belum cukup.</div>;
  const W = 520, H = 300, L = 38, Rr = 10, T = 22, B = 30;
  const lx = (v: number) => Math.log10(v), xs = pts.map(({ p }) => lx(p.reviews || 1)), ys = pts.map(({ p }) => p.rating || 0);
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.max(1, Math.floor((Math.min(...ys) - 0.1) * 10) / 10), y1 = 5.12;
  const X = (v: number) => L + ((lx(v) - x0) / (x1 - x0 || 1)) * (W - L - Rr), Y = (v: number) => T + ((y1 - v) / (y1 - y0 || 1)) * (H - T - B);
  const med = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)] ?? 0; };
  const mx = med(pts.map(({ p }) => p.reviews || 0)), my = med(ys);
  const grid: ReactNode[] = [];
  for (let e = x0; e <= x1; e++) { const xv = X(10 ** e); grid.push(<g key={"x" + e}><line className="grid" x1={xv} x2={xv} y1={T} y2={H - B} /><text x={xv} y={H - B + 16} textAnchor="middle">{num(10 ** e)}</text></g>); }
  for (let r = Math.ceil(y0 * 2) / 2; r <= 5.001; r += 0.5) { const yv = Y(r); grid.push(<g key={"y" + r}><line className="grid" x1={L} x2={W - Rr} y1={yv} y2={yv} /><text x={L - 6} y={yv + 4} textAnchor="end">{r.toFixed(1).replace(".", ",")}</text></g>); }
  const order = [...pts].sort((a, b) => (isProspect(a.p, rival) ? 1 : 0) - (isProspect(b.p, rival) ? 1 : 0));
  const open = (p: Biz) => {
    const u = safeHttpUrl(p.maps_url);
    if (u) window.open(u, "_blank", "noopener,noreferrer");
  };
  return (
    <svg className="sc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sebaran rating terhadap jumlah ulasan">
      {grid}
      <line className="med" x1={X(mx || 1)} x2={X(mx || 1)} y1={T} y2={H - B} /><line className="med" x1={L} x2={W - Rr} y1={Y(my)} y2={Y(my)} />
      <text className="ql" x={W - Rr - 4} y={T - 8} textAnchor="end">Pemimpin</text><text className="ql" x={L + 6} y={T - 8}>Hidden gem</text>
      <text className="ql" x={W - Rr - 4} y={H - B - 6} textAnchor="end">Ramai tapi lemah</text><text className="ql" x={L + 6} y={H - B - 6}>Tertinggal</text>
      {order.map(({ p, k }) => {
        const pros = isProspect(p, rival);
        const html = <>{tipHtml(p, power.get(k))}{pros ? <><br />Prospek</> : null}<br /><small>Enter atau ketuk lagi: buka Maps</small></>;
        return (
          <circle key={k} cx={X(p.reviews || 1).toFixed(1)} cy={Y(p.rating || 0).toFixed(1)} r="5" fill={`var(${pros ? "--c1" : "--c2"})`}
            role="button" tabIndex={0} aria-label={`${p.name}, rating ${p.rating}, ${p.reviews} ulasan${pros ? ", prospek" : ""}`}
            onMouseMove={(e) => tip.show(e, html)} onMouseLeave={tip.hide}
            onFocus={(e) => tip.showAt(e.currentTarget, html, k)} onBlur={tip.hide}
            onClick={(e) => { e.stopPropagation(); if (tip.pinnedKey === k) { tip.unpin(); open(p); } else tip.showAt(e.currentTarget, html, k, true); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(p); } }} />
        );
      })}
      <text x={(L + W) / 2} y={H - 2} textAnchor="middle">jumlah ulasan (skala log)</text>
    </svg>
  );
}
