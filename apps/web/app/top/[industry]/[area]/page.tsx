"use client";
// Peringkat publik satu pasangan industri + wilayah: skor terbuka dengan komponennya, lencana, penghitung tampilan, klaim.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import "../../top.css";
import BizAvatar from "@/components/BizAvatar";
import ExtLink from "@/components/ExtLink";
import ScoreHelp from "@/components/ScoreHelp";
import { apiGet, apiPost, errMsg } from "@/lib/api";

type Row = {
  key: string; name: string; category: string; rating: number; reviews: number; score: number; quality: number; scale: number; reach: number;
  bayes: number; rank: number; hidden_gem: boolean; flagged: boolean; too_few: boolean; has_website: boolean; has_instagram: boolean; has_whatsapp: boolean;
  logo_key?: string; maps_url: string; branches: number;
};
type Market = { avg_rating: number; median_reviews: number; max_reviews: number; rated: number; weights: [number, number, number] };
type Standards = { min_rated: number; min_reviews_rank: number; freshness_days: number };
type Rank = { industry: string; area: string; updated: string; total: number; rows: Row[]; views_7d: number; capped?: boolean; standards?: Standards; summary?: { avg_rating?: number }; market?: Market };

const f = (n: number, d = 3) => n.toFixed(d);
const idn = (n: number) => new Intl.NumberFormat("id-ID").format(n);

// Turunan tiap angka dari data bisnis dan bahan pasar (C, m, ulasan terbanyak), persis rumus di apps/api/rank.go.
function Derivation({ r, m }: { r: Row; m: Market }) {
  const [wq, ws, wr] = m.weights || [60, 25, 15];
  const v = r.reviews, mm = m.median_reviews, C = m.avg_rating, mx = m.max_reviews;
  const wv = v / (v + mm), wm = mm / (v + mm);
  const bayes = wv * r.rating + wm * C;
  const quality = Math.max(0, Math.min(1, (bayes - 1) / 4));
  const scale = Math.log10(1 + v) / Math.log10(1 + mx);
  const chans = [["website", r.has_website], ["Instagram", r.has_instagram], ["WhatsApp", r.has_whatsapp]] as const;
  const nCh = chans.filter((c) => c[1]).length;
  const pq = wq * r.quality, ps = ws * r.scale, pr = wr * r.reach;
  return (
    <div className="deriv">
      <h4>Dari mana angkanya</h4>
      <ol>
        <li>
          <b>Rating Bayesian {f(r.bayes, 2)}</b>: rating {f(r.rating, 1)} dari {idn(v)} ulasan ditarik ke rata-rata wilayah C = {f(C, 2)} dengan bobot m = {idn(mm)} (median ulasan wilayah, minimal 10).
          <code>{idn(v)}/({idn(v)}+{idn(mm)}) × {f(r.rating, 1)} + {idn(mm)}/({idn(v)}+{idn(mm)}) × {f(C, 2)} = {f(wv, 3)} × {f(r.rating, 1)} + {f(wm, 3)} × {f(C, 2)} = {f(bayes, 2)}</code>
        </li>
        <li>
          <b>Kualitas {f(r.quality, 3)}</b>: rating Bayesian dipetakan dari skala 1 sampai 5 ke 0 sampai 1.
          <code>({f(r.bayes, 2)} − 1) / 4 = {f(quality, 3)} → × {wq} = {f(pq, 1)} poin</code>
        </li>
        <li>
          <b>Skala {f(r.scale, 3)}</b>: logaritma ulasan dibanding bisnis dengan ulasan terbanyak di wilayah ini ({idn(mx)} ulasan).
          <code>log10(1+{idn(v)}) / log10(1+{idn(mx)}) = {f(Math.log10(1 + v), 3)} / {f(Math.log10(1 + mx), 3)} = {f(scale, 3)} → × {ws} = {f(ps, 1)} poin</code>
        </li>
        <li>
          <b>Jangkauan {f(r.reach, 3)}</b>: {chans.map((c) => `${c[0]} ${c[1] ? "✓" : "✗"}`).join(" · ")} = {nCh} dari 3 saluran.
          <code>{nCh}/3 = {f(nCh / 3, 3)} → × {wr} = {f(pr, 1)} poin</code>
        </li>
        <li>
          <b>Skor {f(r.score, 1)}</b> = {f(pq, 1)} + {f(ps, 1)} + {f(pr, 1)}. Bobot {wq}/{ws}/{wr}: penilaian pelanggan paling menentukan, ukuran dihitung logaritmik supaya pemain raksasa tidak otomatis menang, jangkauan hanya pelengkap.
        </li>
      </ol>
      <p className="muted">Bahan pasar dari {idn(m.rated)} bisnis berating di laporan ini. Semua angka bisa dihitung ulang dengan kalkulator; rumus lengkap di docs/SKOR.md.</p>
    </div>
  );
}

export default function TopPage() {
  const { industry, area } = useParams<{ industry: string; area: string }>();
  const ind = decodeURIComponent(industry), ar = decodeURIComponent(area);
  const [d, setD] = useState<Rank | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  // form "laporkan data keliru": kunci bisnis yang sedang dilaporkan, isi pesan, dan kunci yang sudah terkirim
  const [repKey, setRepKey] = useState<string | null>(null);
  const [repMsg, setRepMsg] = useState("");
  const [repSent, setRepSent] = useState<Record<string, boolean>>({});
  const [repErr, setRepErr] = useState("");
  const [repBusy, setRepBusy] = useState(false);
  useEffect(() => {
    apiGet<Rank>(`/rank?industry=${encodeURIComponent(ind)}&area=${encodeURIComponent(ar)}`).then(setD).catch((e) => setErr(errMsg(e, "Belum ada peringkat")));
  }, [ind, ar]);
  useEffect(() => { if (d) document.title = `Top ${d.industry} di ${d.area} · Raqio`; }, [d]);

  if (err) return <div className="wrap topp"><h1>Belum ada peringkat</h1><p className="muted">{err}</p><Link href="/top">Lihat wilayah lain</Link></div>;
  if (!d) return <div className="wrap topp"><p className="muted">Memuat…</p></div>;
  const badge = (r: Row) => `${location.origin}/badge/${encodeURIComponent(d.industry)}/${encodeURIComponent(d.area)}/${encodeURIComponent(r.key)}.svg`;
  const embed = (r: Row) => `<a href="${location.origin}/top/${encodeURIComponent(d.industry.toLowerCase())}/${encodeURIComponent(d.area.toLowerCase())}"><img alt="${r.name} peringkat #${r.rank} ${d.industry} di ${d.area} versi Raqio" src="${badge(r)}"></a>`;
  return (
    <div className="wrap topp">
      <Link href="/top" className="back">← Semua peringkat</Link>
      <h1>Top {d.industry} di {d.area}</h1>
      <p className="lead">
        Sumber: data publik Google Maps, dipindai otomatis {new Date(d.updated).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}.{" "}
        {d.total}{d.capped ? "+" : ""} bisnis setelah pembersihan{d.capped ? " (mentok batas pindaian, angka asli bisa lebih)" : ""}. Dilihat <b>{d.views_7d}</b> kali dalam 7 hari.
      </p>
      <p className="muted cred">
        Posisi peringkat tidak bisa dibeli. Urutan memakai skor terbuka <ScoreHelp kind="raqio" /> · <Link href="/metodologi">Metodologi lengkap</Link>
      </p>
      <ol className="rank">
        {d.rows.map((r) => (
          <li key={r.key} className={(r.flagged ? "flag " : "") + (open === r.key ? "open" : "")}>
            <button type="button" className="rrow" onClick={() => setOpen(open === r.key ? null : r.key)} aria-expanded={open === r.key}>
              <span className="pos">{r.flagged ? "!" : r.too_few ? "·" : `#${r.rank}`}</span>
              <BizAvatar name={r.name} logoKey={r.logo_key} size={44} />
              <span className="nm">
                <b>{r.name}</b>
                <small>{r.category || d.industry}{r.branches > 1 ? ` · ${r.branches} cabang` : ""}{r.hidden_gem ? " · hidden gem" : ""}{r.flagged ? " · lonjakan ulasan, perlu dicek" : ""}{r.too_few ? ` · belum cukup ulasan (minimal ${d.standards?.min_reviews_rank ?? 5}) untuk diberi peringkat` : ""}</small>
              </span>
              <span className="num"><b>{r.score.toFixed(1)}</b><small>Skor</small></span>
              <span className="num"><b>{r.rating.toFixed(1)}</b><small>{r.reviews} ulasan</small></span>
            </button>
            {open === r.key && (
              <div className="detail">
                <div className="dlogo"><BizAvatar name={r.name} logoKey={r.logo_key} size={72} zoom /><span>{r.logo_key ? "Logo dari website / Instagram / foto Maps. Klik untuk memperbesar." : "Belum ada logo yang ditemukan untuk bisnis ini."}</span></div>
                <div className="comps">
                  <div><small>Kualitas (bobot 60)</small><b>{(r.quality * 100).toFixed(0)}</b><span>rating Bayesian {r.bayes.toFixed(2)} → {f(60 * r.quality, 1)} poin</span></div>
                  <div><small>Skala (bobot 25)</small><b>{(r.scale * 100).toFixed(0)}</b><span>{idn(r.reviews)} ulasan vs terbanyak {d.market ? idn(d.market.max_reviews) : "-"} → {f(25 * r.scale, 1)} poin</span></div>
                  <div><small>Jangkauan (bobot 15)</small><b>{(r.reach * 100).toFixed(0)}</b><span>{[r.has_website && "website", r.has_instagram && "Instagram", r.has_whatsapp && "WhatsApp"].filter(Boolean).join(", ") || "belum ada yang ditemukan"} → {f(15 * r.reach, 1)} poin</span></div>
                </div>
                <p className="muted">Skor = 60 × {r.quality.toFixed(3)} + 25 × {r.scale.toFixed(3)} + 15 × {r.reach.toFixed(3)} = {f(60 * r.quality, 1)} + {f(25 * r.scale, 1)} + {f(15 * r.reach, 1)} = <b>{r.score.toFixed(1)}</b></p>
                {d.market && <Derivation r={r} m={d.market} />}
                <div className="acts">
                  <ExtLink className="btn ghost" href={r.maps_url}>Cek sendiri di Google Maps</ExtLink>
                  <Link className="btn ghost" href={`/register?claim_biz=${encodeURIComponent(r.key)}`}>Ini bisnis saya, klaim gratis</Link>
                  <button type="button" className="btn ghost" onClick={() => { setRepKey(repKey === r.key ? null : r.key); setRepMsg(""); setRepErr(""); }}>
                    Laporkan data keliru
                  </button>
                </div>
                {repSent[r.key] && <p className="muted">Terima kasih, laporanmu tersimpan dan akan ditinjau.</p>}
                {repKey === r.key && !repSent[r.key] && (
                  <form className="report" onSubmit={async (e) => {
                    e.preventDefault();
                    setRepBusy(true);
                    setRepErr("");
                    try {
                      await apiPost("/rank/report", { industry: d.industry, area: d.area, key: r.key, message: repMsg });
                      setRepSent((s) => ({ ...s, [r.key]: true }));
                      setRepKey(null);
                    } catch (e2) {
                      setRepErr(errMsg(e2, "Gagal mengirim, coba lagi."));
                    } finally {
                      setRepBusy(false);
                    }
                  }}>
                    <textarea value={repMsg} onChange={(e) => setRepMsg(e.target.value)} rows={3} minLength={10} required
                      placeholder="Apa yang keliru? Misal: bisnis ini sudah tutup, rating tidak cocok dengan Maps, lokasinya bukan di wilayah ini." aria-label="Keterangan data yang keliru" />
                    <div className="racts">
                      <button type="submit" className="btn ghost" disabled={repBusy || repMsg.trim().length < 10}>{repBusy ? "Mengirim…" : "Kirim laporan"}</button>
                      {repErr && <span className="muted">{repErr}</span>}
                    </div>
                  </form>
                )}
                {r.rank > 0 && (
                  <details className="embed">
                    <summary>Tempel lencana peringkat di website atau bio</summary>
                    <div className="badges">
                      <figure><img src={badge(r)} alt={`Lencana #${r.rank} gelap`} height={46} /><figcaption>Gelap</figcaption></figure>
                      <figure className="lt"><img src={badge(r) + "?theme=light"} alt={`Lencana #${r.rank} terang`} height={46} /><figcaption>Terang</figcaption></figure>
                    </div>
                    <textarea readOnly value={embed(r)} rows={2} onFocus={(e) => e.currentTarget.select()} aria-label="Kode lencana" />
                    <small className="muted">Tambahkan <code>?theme=light</code> di akhir alamat gambar untuk versi terang. Lencana selalu menampilkan peringkat terbaru.</small>
                  </details>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="muted foot">
        Standar halaman ini: tayang hanya jika minimal {d.standards?.min_rated ?? 10} bisnis ber-rating; di bawah {d.standards?.min_reviews_rank ?? 5} ulasan
        tampil tanpa nomor peringkat; data lebih tua dari {d.standards?.freshness_days ?? 30} hari tidak dipakai; lonjakan ulasan tidak wajar ditandai dan
        dikeluarkan dari peringkat; cabang satu brand ditampilkan sekali. Rumus dan perubahan standar terbuka di <Link href="/metodologi">/metodologi</Link>.
      </p>
    </div>
  );
}
