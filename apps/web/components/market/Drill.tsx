"use client";
// Daftar bisnis untuk "kulik" angka di grafik: klik batang kategori atau kematangan digital membuka daftar ini di drawer.
import BizAvatar from "@/components/BizAvatar";
import { type Biz, clean, dec, gapsOf, num } from "@/lib/biz";

const byReviews = (a: Biz, b: Biz) => (b.reviews || 0) - (a.reviews || 0);

export function BizList({ items, onOpen, showCat = false, empty = "Tidak ada." }: { items: Biz[]; onOpen: (p: Biz) => void; showCat?: boolean; empty?: string }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="drill">
      {[...items].sort(byReviews).map((p, i) => (
        <li key={p.key || p.place_id || p.maps_url || i}>
          <button type="button" className="row" onClick={() => onOpen(p)} title="Buka detail bisnis">
            <BizAvatar name={clean(p.name)} website={p.website} logoKey={p.logo_key} size={30} />
            <span className="nm">
              <b>{clean(p.name)}</b>
              <small>{showCat && clean(p.category) ? clean(p.category) + " · " : ""}{p.rating ? `★ ${dec(p.rating)} · ${num(p.reviews)} ulasan` : "belum ada rating"}</small>
            </span>
            <span className="tags">{(gapsOf(p) || []).map((g) => <i key={g}>{g}</i>)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Dua daftar untuk satu ukuran digital: yang belum punya (peluang) dulu, lalu yang sudah. */
export function DigitalDrill({ label, det, has, onOpen }: { label: string; det: Biz[]; has: (p: Biz) => boolean; onOpen: (p: Biz) => void }) {
  const yes = det.filter(has), no = det.filter((p) => !has(p));
  return (
    <div className="help-body">
      <p className="muted">Dihitung hanya dari {det.length} bisnis yang sudah dicek detail. Yang belum punya adalah peluang untuk ditawari.</p>
      <h4 className="drill-h">Belum {label.toLowerCase()} <span>{no.length}</span></h4>
      <BizList items={no} onOpen={onOpen} empty="Semua sudah punya." />
      <h4 className="drill-h">Sudah <span>{yes.length}</span></h4>
      <BizList items={yes} onOpen={onOpen} empty="Belum ada yang punya." />
    </div>
  );
}
