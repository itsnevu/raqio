"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type Biz, leadKey } from "@/lib/biz";
import { countFilters, isSortKey, visibleFilters } from "@/lib/market/filters";
import type { SortKey, Tab, View } from "@/lib/market/types";
import BizRow, { type RowProps } from "./BizRow";
import { ICON } from "./Icons";

type Props = {
  tab: Tab; all: Biz[]; filtered: Biz[]; view: View; rival: boolean; industry: string; area: string; offer: string;
  onQuery: (q: string) => void; onFilter: (k: string) => void; onSort: (k: SortKey) => void; onOffer: (v: string) => void;
} & Pick<RowProps, "onToggleDraft" | "onOpen" | "onCheck" | "onLead">;

const COLS: [string, string, boolean, string][] = [
  ["name", "Bisnis", true, ""], ["rating", "Google Maps", true, ""], ["rpm", "Ulasan/bln", true, "hide-m"], ["", "Telepon", false, ""], ["website", "Website", true, ""],
  ["instagram", "Instagram", true, ""], ["", "Email", false, "hide-m"], ["dist", "Jarak", true, "hide-m"], ["", "Peta", false, "hide-m"],
];

export default function BizTable({ tab, all, filtered, view, rival, industry, area, offer, onQuery, onFilter, onSort, onOffer, onToggleDraft, onOpen, onCheck, onLead }: Props) {
  const [q, setQ] = useState(view.q);
  useEffect(() => {
    const t = setTimeout(() => onQuery(q.toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [q, onQuery]);
  const counts = countFilters(all, rival);
  const activeSort = view.sort === "reviews" ? "rating" : view.sort;
  return (
    <div className="tcard">
      {tab !== "pros" && (
        <div className="tools">
          <label className="q">{ICON.search}<span className="sr-only">Cari bisnis</span><input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Cari nama, alamat, kategori, @ig, website" /></label>
          <div className="filters" role="group" aria-label="Filter cepat">
            {visibleFilters(rival).map((f) => (
              <button key={f.key} type="button" className={"f" + (f.key === view.filter ? " on" : "")} aria-pressed={f.key === view.filter} onClick={() => onFilter(f.key)}>{f.label}<b>{counts.get(f.key) ?? 0}</b></button>
            ))}
          </div>
          <span className="count" aria-live="polite">{filtered.length} dari {all.length} bisnis</span>
        </div>
      )}
      {tab === "pros" && <div className="pros-hint">Diurutkan dari skor prospek tertinggi. Kelola follow up semua wilayah di <Link href="/prospects">papan Prospek</Link>.</div>}
      {(view.filter === "prospect" || view.open != null) && (
        <label className="offer">Penawaranmu untuk draf pesan:
          <input value={offer} onChange={(e) => onOffer(e.target.value)} placeholder="mis. bikin website dan katalog online" />
        </label>
      )}
      <div className="tw">
        <table>
          <thead>
            <tr>
              {COLS.map(([k, l, sortable, cls], i) => {
                const isActive = sortable && k === activeSort;
                const ariaSort = isActive ? (view.dir > 0 ? "ascending" : "descending") : sortable ? "none" : undefined;
                return (
                  <th key={i} className={(sortable ? "s " : "") + cls} aria-sort={ariaSort}>
                    {sortable && isSortKey(k) ? (
                      <button type="button" className="th-btn" onClick={() => onSort(k)}>
                        {l}
                        {isActive && <span className="ar" aria-hidden="true">{view.dir > 0 ? "▲" : "▼"}</span>}
                      </button>
                    ) : l}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr><td colSpan={9} className="empty">Tidak ada bisnis yang cocok.</td></tr>
            ) : filtered.map((p, i) => {
              const k = leadKey(p) || `${p.name}#${i}`;
              return <BizRow key={k} p={p} industry={industry} area={area} offer={offer} rival={rival} open={view.open === k}
                onToggleDraft={onToggleDraft} onOpen={onOpen} onCheck={onCheck} onLead={onLead} />;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
