"use client";
import { useMemo, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import ExtLink from "@/components/ExtLink";
import { useShell } from "@/components/Shell";
import { type Biz, clean, dec, num, waOf } from "@/lib/biz";
import { BizList, DigitalDrill } from "./Drill";
import { bizKey } from "@/lib/market/power";
import type { Report } from "@/lib/market/types";
import Scatter from "./Scatter";
import Sources from "./Sources";
import { tipHtml, useTip } from "./Tip";

type RankBy = "power" | "reviews" | "rating";
const RANK_LABEL: Record<RankBy, string> = { power: "Skor kekuatan", reviews: "Ulasan", rating: "Rating" };

export default function Charts({ R, all, rival, power, onOpen }: { R: Report; all: Biz[]; rival: boolean; power: Map<string, number>; onOpen?: (p: Biz) => void }) {
  const [rankBy, setRankBy] = useState<RankBy>("power");
  const { openDrawer, openBusiness } = useShell();
  const open = onOpen || ((p: Biz) => openBusiness(p, { industry: R.industry, area: R.area }));
  const tip = useTip();
  const { top, lo, hi, valF } = useMemo(() => {
    const items = all.map((p, i) => ({ p, k: bizKey(p, i) })).filter(({ p }) => p.rating);
    const pw = (k: string) => power.get(k) || 0;
    const keyF: Record<RankBy, (x: { p: Biz; k: string }) => number> = {
      power: ({ k }) => pw(k), reviews: ({ p }) => p.reviews || 0, rating: ({ p }) => (p.rating || 0) * 1e6 + (p.reviews || 0),
    };
    const valF: Record<RankBy, (x: { p: Biz; k: string }) => number> = { power: ({ k }) => pw(k), reviews: ({ p }) => p.reviews || 0, rating: ({ p }) => p.rating || 0 };
    const top = [...items].sort((a, b) => keyF[rankBy](b) - keyF[rankBy](a)).slice(0, 10);
    const vals = top.map(valF[rankBy]);
    const lo = rankBy === "reviews" ? 0 : (vals.length ? Math.min(...vals) : 0) - (rankBy === "rating" ? 0.3 : 0.15);
    const hi = vals.length ? Math.max(...vals) : 1;
    return { top, lo, hi, valF };
  }, [all, power, rankBy]);

  const topCats = useMemo(() => {
    const cats: Record<string, number> = {};
    all.forEach((p) => { const c = clean(p.category) || "Lainnya"; cats[c] = (cats[c] || 0) + 1; });
    const cr = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const t = cr.slice(0, 6), rest = cr.slice(6).reduce((s, x) => s + x[1], 0);
    if (rest) t.push(["Lainnya", rest]);
    return t;
  }, [all]);
  const mxCat = Math.max(1, ...topCats.map((r) => r[1]));
  const dd = R.digital;
  const catOf = (p: Biz) => clean(p.category) || "Lainnya";
  // klik batang kategori: daftar bisnisnya; "Lainnya" = kategori kecil di luar 6 teratas (plus yang tanpa kategori)
  const drillCat = (k: string) => {
    const main = new Set(topCats.slice(0, 6).map((c) => c[0]).filter((c) => c !== "Lainnya"));
    const items = k === "Lainnya" ? all.filter((p) => !main.has(catOf(p))) : all.filter((p) => catOf(p) === k);
    openDrawer(`${k} · ${items.length} bisnis`, <div className="help-body"><BizList items={items} onOpen={open} showCat={k === "Lainnya"} /></div>);
  };
  const det = all.filter((p) => p._detailed);
  const drillDigital = (label: string, has: (p: Biz) => boolean) =>
    openDrawer(label, <DigitalDrill label={label} det={det} has={has} onOpen={open} />);
  const DIG: [string, number, (p: Biz) => boolean][] = [
    ["Bisa WhatsApp", dd.whatsapp, (p) => !!waOf(p)], ["Punya telepon", dd.phone, (p) => !!p.phone],
    ["Punya website", dd.website, (p) => !!p.website], ["IG terdeteksi", dd.instagram, (p) => !!p.instagram && !p.instagram_shared],
  ];

  return (
    <section>
      {tip.el}
      <div className="viz">
        <div className="ch">
          <div className="ch-h"><h3 id="top10-h">Top 10</h3>
            <div className="seg" role="group" aria-labelledby="top10-h">
              {(Object.keys(RANK_LABEL) as RankBy[]).map((k) => <button key={k} type="button" className={rankBy === k ? "on" : ""} aria-pressed={rankBy === k} onClick={() => setRankBy(k)}>{RANK_LABEL[k]}</button>)}
            </div>
          </div>
          <div className="rank">
            {top.map(({ p, k }, i) => {
              const v = valF[rankBy]({ p, k });
              const w = hi > lo ? ((v - lo) / (hi - lo)) * 100 : 100;
              const label = rankBy === "reviews" ? num(p.reviews) : rankBy === "rating" ? "★ " + dec(p.rating) : dec((power.get(k) || 0).toFixed(2));
              const sub = rankBy === "reviews" ? "★ " + dec(p.rating) : rankBy === "power" ? "★ " + dec(p.rating) + " · " + num(p.reviews) : num(p.reviews) + " ulasan";
              const html = tipHtml(p, power.get(k));
              return (
                <ExtLink key={k} className="rk" href={p.maps_url} onMouseMove={(e) => tip.show(e, html)} onMouseLeave={tip.hide}
                  onFocus={(e) => tip.showAt(e.currentTarget, html, k)} onBlur={tip.hide}>
                  <span className="no">{i + 1}</span><span className="n">{clean(p.name)}</span>
                  <span className="tr"><span className="b" style={{ width: Math.max(w, 1.5) + "%" }} /></span><span className="v">{label}<small>{sub}</small></span>
                </ExtLink>
              );
            })}
          </div>
          <div className="legal">
            {rankBy === "power" ? "Skor kekuatan = rating yang disesuaikan jumlah ulasan (rata-rata Bayesian). Rating tinggi dari sedikit ulasan tidak langsung jadi juara."
              : rankBy === "rating" ? "Diurutkan dari rating; seri dipecah dengan jumlah ulasan. Sumbu tidak mulai dari nol supaya selisih terlihat." : ""}
          </div>
        </div>
        <div className="ch">
          <div className="ch-h"><h3>Peta posisi</h3><span className="hint">rating vs jumlah ulasan</span></div>
          <ErrorBoundary label="Peta posisi">
            <Scatter all={all} rival={rival} tip={tip} power={power} />
          </ErrorBoundary>
          <div className="legend"><span><i style={{ background: "var(--c1)" }} />Prospek (bagus, lemah digital)</span><span><i style={{ background: "var(--c2)" }} />Bisnis lain</span></div>
        </div>
      </div>
      <div className="viz2">
        <div className="ch">
          <div className="ch-h"><h3>Komposisi kategori</h3><span className="hint">jumlah bisnis</span></div>
          {topCats.map(([k, val]) => <button type="button" className="hb" key={k} onClick={() => drillCat(k)} title="Klik untuk lihat bisnisnya"><span className="n">{k}</span><span className="tr"><span className="b" style={{ width: (val / mxCat) * 100 + "%" }} /></span><span className="v">{val}</span></button>)}
          <div className="legal">Klik batang untuk melihat bisnis di dalamnya.</div>
        </div>
        <div className="ch">
          <div className="ch-h"><h3>Kematangan digital</h3><span className="hint">dari {dd.sampled} bisnis yang dicek detail</span></div>
          {DIG.map(([k, val, has]) => (
            <button type="button" className="hb" key={k} onClick={() => drillDigital(k, has)} title="Klik untuk lihat siapa yang sudah dan belum"><span className="n">{k}</span><span className="tr"><span className="b" style={{ width: val + "%" }} /></span><span className="v">{val}%</span></button>
          ))}
          <div className="legal">Makin rendah persentasenya, makin besar peluang menawarkan jasa digital ke pasar ini. Klik batang untuk lihat siapa yang belum punya.</div>
        </div>
      </div>
      <div className="viz3">
        <Sources R={R} all={all} onOpen={open} />
      </div>
    </section>
  );
}
