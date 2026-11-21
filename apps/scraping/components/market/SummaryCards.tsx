"use client";
import ExtLink from "@/components/ExtLink";
import BizAvatar from "@/components/BizAvatar";
import { type Biz, clean, num } from "@/lib/biz";
import type { Report } from "@/lib/market/types";
import { keyPoints, looksLikeSelf, type Verdict } from "@/lib/market/verdict";
import { Em } from "@/lib/market/emphasize";
import ScoreHelp from "@/components/ScoreHelp";

type Props = { R: Report; all: Biz[]; rival: boolean; v: Verdict; nPros: number; onSwapGoal: () => void; onSeeProspects: () => void };

const Bars = ({ rows }: { rows: [string, number][] }) => {
  const mx = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <>
      {rows.map(([k, val]) => (
        <div className="bar" key={k}><span>{k}</span><div className="t"><div className="fill" style={{ width: (val / mx) * 100 + "%" }} /></div><span className="n">{val}</span></div>
      ))}
    </>
  );
};

export default function SummaryCards({ R, all, rival, v, nPros, onSwapGoal, onSeeProspects }: Props) {
  const s = R.summary, d = R.digital, q = R.data_quality;
  return (
    <section>
      <div className="verdict">
        <div className="tag">{rival ? "Kesimpulan: posisi kamu di antara pesaing" : "Kesimpulan: peluang dapat klien"} <ScoreHelp kind="ringkasan" /></div>
        <h3><Em text={v.headline} /></h3>
        <p className="why"><Em text={v.why} /></p>
        {!rival && looksLikeSelf(R.industry) && (
          <p className="why" style={{ color: "var(--warn)", marginTop: 8 }}>
            Hati-hati: &quot;{R.industry}&quot; terdengar seperti bisnismu sendiri. Kalau iya, bisnis di daftar ini adalah pesaingmu, bukan calon klien.{" "}
            <button type="button" className="mini" onClick={onSwapGoal}>Ubah jadi pesaing</button>
          </p>
        )}
        <div className="next">
          <div><b>Langkah berikutnya:</b> <Em text={v.next[0]} /><br /><span><Em text={v.next[1]} /></span></div>
          {rival
            ? (v.leaders || []).map((l) => <ExtLink key={l.name} className="btn ghost withlogo" href={l.maps_url}><BizAvatar name={clean(l.name)} website={l.website} logoKey={l.logo_key} size={36} />{clean(l.name)}</ExtLink>)
            : nPros > 0 && <button type="button" className="btn" onClick={onSeeProspects}>Lihat {nPros} prospek</button>}
        </div>
      </div>
      <div className="reasons">
        {v.reasons.map(([big, unit, txt, m]) => (
          <div className="reason" key={unit}><div className="big">{String(big)}<small>{unit}</small></div><p><Em text={txt} /></p><div className="m">{m}</div></div>
        ))}
      </div>
      <details className="raw">
        <summary>Lihat angka lengkap dan detail teknis</summary>
        <p className="muted-note">Semua angka di bawah dihitung dari data Google Maps laporan ini. <ScoreHelp kind="kekuatan" label="cara hitung" /></p>
        <div className="key3">{keyPoints(R, all, rival).map(([k, val]) => <div key={k}><small>{k}</small><p><Em text={val} /></p></div>)}</div>
        <div className="stats">
          <div className="stat"><div className="l">Bisnis</div><div className="v">{s.businesses}{s.capped ? "+" : ""}</div><div className="s">{q ? q.brands + " brand" : "yang muncul di Maps"}{s.capped ? ", bisa lebih banyak" : ""}</div></div>
          <div className="stat"><div className="l">Rating rata-rata</div><div className="v">{s.avg_rating ?? "-"}</div><div className="s">median {num(s.median_reviews)} ulasan</div></div>
          <div className="stat"><div className="l">Total ulasan</div><div className="v">{num(s.total_reviews)}</div><div className="s">tanda seberapa ramai pasarnya</div></div>
          <div className="stat"><div className="l">Porsi 3 teratas</div><div className="v">{s.top3_share}%</div><div className="s">{s.top3_share >= 50 ? "dikuasai pemain besar" : s.top3_share >= 30 ? "ada beberapa pemain kuat" : "persaingan merata"}</div></div>
          <div className="stat"><div className="l">Punya website</div><div className="v">{d.website}%</div><div className="s">IG {d.instagram}%, dari {d.sampled} dicek</div></div>
          <div className="stat"><div className="l">Bisa WhatsApp</div><div className="v">{d.whatsapp}%</div><div className="s">dari sampel detail</div></div>
        </div>
        <div className="cols">
          <div>
            {R.ai_strategy && R.ai_strategy.length > 0 && <div className="card ai" style={{ marginBottom: 12 }}><h3>Strategi</h3><ul>{R.ai_strategy.map((x, i) => <li key={i}><Em text={x} /></li>)}</ul></div>}
            <div className="card"><h3>Temuan</h3><ul>{R.insights.map((x, i) => <li key={i}><Em text={x} /></li>)}</ul></div>
          </div>
          <div className="card">
            <h3>Sebaran</h3>
            <div className="dist">
              <div><div className="sub" style={{ marginBottom: 4 }}>Rating</div><Bars rows={R.rating_buckets} /></div>
              <div><div className="sub" style={{ marginBottom: 4 }}>Jumlah ulasan</div><Bars rows={R.size_buckets} /></div>
            </div>
            {q && (
              <div className="quality">
                <b>Kualitas data:</b> {q.raw} hasil mentah, {q.kept} disimpan. Dibuang {q.invalid_or_closed} tidak valid/tutup, {q.out_of_area} di luar wilayah,{" "}
                {q.duplicates_merged} duplikat digabung. {q.chains} brand punya lebih dari satu cabang.
              </div>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}
