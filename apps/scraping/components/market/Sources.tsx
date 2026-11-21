"use client";
// "Sumber data": dari mana angka laporan ini berasal. Pie 1: asal daftar bisnis (Google Maps saja, Maps + sumber lain,
// hanya sumber lain). Pie 2: status detail kontak (dicek sekarang di Maps, dari database Raqio, dari sumber lain, belum).
// Tabel penyedia: tiap sumber dengan status, jumlah, dan waktu, plus hasil validasi website bisnis tambahan.
import { useShell } from "@/components/Shell";
import type { Biz } from "@/lib/biz";
import type { Report, Sources as Src } from "@/lib/market/types";
import { BizList } from "./Drill";

type Slice = { key: string; label: string; color: string; pick: (p: Biz) => boolean; note: string };
export const SRC_LABEL: Record<string, string> = {
  maps: "Google Maps", overture: "Overture Maps (Meta, Microsoft, Foursquare)", osm: "OpenStreetMap", places_api: "Google Places API", tomtom: "TomTom",
};
const isOther = (p: Biz) => !!p._detailed && p.detail_src !== "fresh" && p.detail_src !== "db" && !!p.detail_src;
const DETAIL: Slice[] = [
  { key: "detail_fresh", label: "Dicek sekarang di Google Maps", color: "var(--good)", pick: (p) => !!p._detailed && p.detail_src === "fresh", note: "telepon, website, dan IG diambil langsung saat pindaian ini" },
  { key: "detail_db", label: "Detail dari database Raqio", color: "#8A6A1C", pick: (p) => !!p._detailed && (p.detail_src === "db" || !p.detail_src), note: "kontak sudah pernah dicek di pindaian sebelumnya, dipakai ulang tanpa cek lagi" },
  { key: "detail_other", label: "Kontak dari sumber lain", color: "#5B7FB5", pick: isOther, note: "bisnis yang tidak ada di Maps; kontak menurut Overture / OpenStreetMap, website dicek hidup" },
  { key: "detail_none", label: "Hanya daftar Maps, belum dicek detail", color: "#3A3A3A", pick: (p) => !p._detailed, note: "nama, rating, ulasan saja; tombol Cek di tab Semua pemain mengambil kontaknya" },
];
const ORIGIN: Slice[] = [
  { key: "maps_only", label: "Google Maps saja", color: "var(--good)", pick: (p) => p.on_maps !== false && (p.sources || ["maps"]).length <= 1, note: "ditemukan di Google Maps, tidak ada padanannya di sumber lain" },
  { key: "multi", label: "Ada di Maps dan di sumber lain", color: "#8A6A1C", pick: (p) => p.on_maps !== false && (p.sources || []).length > 1, note: "ada di Maps dan di sumber lain; kontak yang kosong diisi dari sana, asalnya dicatat" },
  { key: "extra_only", label: "Hanya di sumber lain, tidak muncul di hasil Maps", color: "#5B7FB5", pick: (p) => p.on_maps === false, note: "tidak muncul di hasil pencarian Google Maps ini: belum punya profil Maps atau di luar hasil teratas; tidak ikut peringkat karena tanpa rating" },
];

/** Hitung dari `all` bila laporan lama tidak membawa `sources`. detail_src kosong pada laporan lama dianggap database. */
export function sourcesOf(R: Report, all: Biz[]): Src {
  if (R.sources) return R.sources;
  const det = all.filter((p) => p._detailed);
  return {
    maps: all.length, seen_before: all.filter((p) => p.seen_before).length,
    detail_fresh: det.filter((p) => p.detail_src === "fresh").length,
    detail_db: det.filter((p) => p.detail_src !== "fresh").length,
    detail_none: all.length - det.length,
    ig_maps: all.filter((p) => p.instagram && p.ig_src === "maps").length,
    ig_website: all.filter((p) => p.instagram && p.ig_src === "website").length,
    ig_other: all.filter((p) => p.instagram && p.ig_src !== "maps" && p.ig_src !== "website").length,
  };
}

function Pie({ parts, total, center, onPick }: { parts: (Slice & { n: number })[]; total: number; center: string; onPick: (s: Slice & { n: number }) => void }) {
  let acc = 0;
  const stops = parts.map((x) => {
    const from = (acc / total) * 100;
    acc += x.n;
    return `${x.color} ${from}% ${(acc / total) * 100}%`;
  });
  const bg = stops.length ? `conic-gradient(${stops.join(", ")})` : "var(--sunk)";
  return (
    <div className="src-body">
      <div className="pie" style={{ background: bg }} role="img" aria-label={parts.map((x) => `${x.label} ${x.n}`).join(", ")}>
        <span><b>{total}</b><small>{center}</small></span>
      </div>
      <ul className="src-l">
        {parts.map((x) => (
          <li key={x.key}>
            <button type="button" onClick={() => onPick(x)} title="Klik untuk lihat bisnisnya">
              <i style={{ background: x.color }} /><span>{x.label}</span><b>{x.n}</b><small>{Math.round((x.n / total) * 100)}%</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS: Record<string, string> = { ok: "berhasil", empty: "tidak ada hasil", skipped: "dilewati", error: "gagal" };

export default function Sources({ R, all, onOpen }: { R: Report; all: Biz[]; onOpen?: (p: Biz) => void }) {
  const { openDrawer, openBusiness } = useShell();
  const open = onOpen || ((p: Biz) => openBusiness(p, { industry: R.industry, area: R.area }));
  const s = sourcesOf(R, all);
  const total = Math.max(1, all.length || s.total || s.maps);
  const count = (sl: Slice) => all.filter(sl.pick).length;
  const detail = DETAIL.map((sl) => ({ ...sl, n: count(sl) })).filter((x) => x.n > 0);
  const origin = ORIGIN.map((sl) => ({ ...sl, n: count(sl) })).filter((x) => x.n > 0);
  const multi = (s.multi || 0) + (s.extra_only || 0) > 0 || origin.length > 1;
  const ig = s.ig_maps + s.ig_website + s.ig_other;
  const drill = (sl: Slice & { n: number }) => openDrawer(`${sl.label} · ${sl.n} bisnis`, <div className="help-body"><p className="muted">{sl.note}.</p><BizList items={all.filter(sl.pick)} onOpen={open} /></div>);
  const prov = (s.providers || []).filter((p) => p.name !== "maps");
  const others = Object.keys(s.by_source || {}).filter((k) => k !== "maps");
  return (
    <div className="ch src">
      <div className="ch-h"><h3>Sumber data</h3><span className="hint">dari mana angka laporan ini</span></div>
      {multi && (
        <>
          <h4 className="src-h">Asal daftar bisnis</h4>
          <Pie parts={origin} total={total} center="bisnis" onPick={drill} />
        </>
      )}
      <h4 className="src-h">Detail kontak</h4>
      <Pie parts={detail} total={total} center={multi ? "bisnis" : "bisnis"} onPick={drill} />
      {prov.length > 0 && (
        <table className="src-prov">
          <thead><tr><th>Sumber lain</th><th>Status</th><th>Ditemukan</th><th>Waktu</th></tr></thead>
          <tbody>
            {prov.map((p) => (
              <tr key={p.name}>
                <td>{p.label || SRC_LABEL[p.name] || p.name}</td>
                <td className={"st-" + p.status}>{STATUS[p.status] || p.status}{p.note ? <small> · {p.note}</small> : null}</td>
                <td>{p.found}</td>
                <td>{p.seconds ? `${p.seconds} dtk` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="legal">
        Daftar bisnis, rating, dan jumlah ulasan: dari Google Maps saat pindaian {new Date(R.created).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
        {s.seen_before > 0 && <>, {s.seen_before} di antaranya sudah ada di database Raqio dari pindaian sebelumnya (dipakai untuk momentum ulasan)</>}.
        {others.length > 0 && <> Sumber lain, {others.map((k) => SRC_LABEL[k] || k).join("; ")}: {s.multi || 0} bisnis Maps juga ada di sana ({s.enriched || 0} dilengkapi kontaknya), {s.extra_only || 0} bisnis tambahan yang tidak muncul di hasil Maps (lolos validasi: kategori relevan, tidak tutup, keyakinan ≥ 50%, punya kontak{s.verify ? `; website dicek: ${s.verify.up} hidup, ${s.verify.down} mati` : ""}).</>}
        {ig > 0 && <> Akun Instagram: {s.ig_maps} dari profil Maps, {s.ig_website} dari website bisnis{s.ig_other ? `, ${s.ig_other} dari sumber lain atau pindaian sebelumnya` : ""}.</>}
        {" "}Tidak ada angka yang dikarang atau ditebak AI; yang belum dicek ditandai belum dicek. Data OpenStreetMap © OpenStreetMap contributors (ODbL); Overture Maps CDLA-Permissive 2.0.
      </div>
    </div>
  );
}
