"use client";
// Isi laporan siap cetak: hitam putih, tabel sederhana, satu bagian per halaman saat dicetak (lihat app/market/print/print.css).
import { type Biz, clean, dec, fmtPhone, num } from "@/lib/biz";
import { digitalRows, fmtLongDate, gemsOf, leadersOf, prospectsOf, topCategories, weakOf } from "@/lib/market/print";
import type { Report } from "@/lib/market/types";
import { keyPoints, verdict } from "@/lib/market/verdict";

type Props = { R: Report; org: string; rival: boolean; contacts: boolean };

const Bars = ({ rows, pct }: { rows: [string, number][]; pct?: boolean }) => {
  const mx = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="bars">
      {rows.map(([k, v]) => (
        <div className="row" key={k}>
          <span className="n">{k}</span>
          <span className="tr"><span className="b" style={{ width: (pct ? v : (v / mx) * 100) + "%" }} /></span>
          <span className="v">{pct ? v + "%" : v}</span>
        </div>
      ))}
    </div>
  );
};

const BizTable = ({ rows, empty, contacts }: { rows: Biz[]; empty: string; contacts?: boolean }) =>
  rows.length === 0 ? (
    <p className="empty">{empty}</p>
  ) : (
    <table>
      <thead>
        <tr>
          <th>#</th><th>Bisnis</th><th>Rating</th><th>Ulasan</th><th>Kategori</th><th>Alamat</th>{contacts && <th>Telepon</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => (
          <tr key={(p.key || p.place_id || p.maps_url || p.name) + i}>
            <td className="num">{i + 1}</td>
            <td><b>{clean(p.name)}</b>{p.lead_score != null && <span className="score"> skor {p.lead_score}</span>}</td>
            <td className="num">{p.rating ? dec(p.rating) : "-"}</td>
            <td className="num">{num(p.reviews)}</td>
            <td>{clean(p.category || "") || "-"}</td>
            <td>{clean(p.address || "") || "-"}</td>
            {contacts && <td className="num">{p.phone ? fmtPhone(p) : "-"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );

export default function PrintReport({ R, org, rival, contacts }: Props) {
  const all = R.all || [];
  const v = verdict(R, all, rival);
  const s = R.summary, d = R.digital;
  const leaders = leadersOf(R, all), gems = gemsOf(all), weak = weakOf(all), pros = prospectsOf(all, rival);
  return (
    <article className="doc">
      <header className="sec first">
        <div className="kicker">Laporan riset pasar{rival ? " · dilihat sebagai pesaing" : " · dilihat sebagai calon klien"}</div>
        <h1>{R.industry} di {R.area}</h1>
        <p className="meta">
          Data Google Maps dan website bisnis per {fmtLongDate(R.created)}.
          {org && <> Disiapkan oleh <b>{org}</b>.</>} Dibuat dengan Raqio.
        </p>
        <h2>Ringkasan</h2>
        <div className="kpis">
          <div className="kpi"><b>{s.businesses}{s.capped ? "+" : ""}</b><span>bisnis ditemukan</span></div>
          <div className="kpi"><b>{s.avg_rating != null ? dec(s.avg_rating) : "-"}</b><span>rating rata-rata</span></div>
          <div className="kpi"><b>{num(s.total_reviews)}</b><span>total ulasan</span></div>
          <div className="kpi"><b>{s.top3_share}%</b><span>ulasan dipegang 3 teratas</span></div>
          <div className="kpi"><b>{d.website}%</b><span>punya website</span></div>
          <div className="kpi"><b>{d.whatsapp}%</b><span>bisa WhatsApp</span></div>
          <div className="kpi"><b>{d.instagram}%</b><span>Instagram terdeteksi</span></div>
          <div className="kpi"><b>{pros.length}</b><span>{rival ? "pesaing rapuh" : "prospek layak dihubungi"}</span></div>
        </div>
        <dl className="kp">
          {keyPoints(R, all, rival).map(([k, val]) => (
            <div key={k}><dt>{k}</dt><dd>{val}</dd></div>
          ))}
        </dl>
        <h2>Kesimpulan</h2>
        <div className="verdict">
          <h3>{v.headline}</h3>
          <p>{v.why}</p>
          <p><b>Langkah berikutnya:</b> {v.next[0]} {v.next[1]}</p>
          <ul className="reasons">
            {v.reasons.map(([big, unit, txt]) => (
              <li key={unit}><b>{String(big)} {unit}</b>: {txt}</li>
            ))}
          </ul>
        </div>
      </header>

      <section className="sec">
        <h2>Pemimpin pasar</h2>
        <BizTable rows={leaders} empty="Belum ada data pemimpin." />
        <h2>Hidden gems</h2>
        <p className="note">Rating 4,7 ke atas dengan 15 sampai 300 ulasan: bagus tapi belum terlalu ramai.</p>
        <BizTable rows={gems} empty="Tidak ada hidden gem di wilayah ini." />
        <h2>Pemain lemah</h2>
        <p className="note">Ramai (150 ulasan ke atas) tapi rating di bawah 4,3: pelanggannya kurang puas.</p>
        <BizTable rows={weak} empty="Tidak ada pemain lemah yang menonjol." />
      </section>

      <section className="sec">
        <h2>{rival ? "Pesaing yang bisa dikejar" : "Prospek"}</h2>
        <p className="note">
          {rival
            ? "Mode pesaing tidak menyaring prospek; daftar ini kosong."
            : "Punya celah digital (tanpa website, IG tidak ditemukan, ulasan sedikit) dan ada kontak yang bisa dihubungi, diurutkan dari skor prospek tertinggi."}
          {!contacts && pros.length > 0 && " Nomor telepon tidak dicetak; buka versi dengan ?contacts=1 bila diperlukan."}
        </p>
        <BizTable rows={pros} empty="Belum ada prospek yang memenuhi syarat." contacts={contacts} />
      </section>

      <section className="sec">
        <h2>Komposisi kategori</h2>
        <Bars rows={topCategories(all)} />
        <h2>Kematangan digital</h2>
        <p className="note">Dari {d.sampled} bisnis yang dicek detail. Makin rendah persentasenya, makin besar peluang menawarkan jasa digital.</p>
        <Bars rows={digitalRows(d)} pct />
        {R.rating_buckets.length > 0 && (
          <>
            <h2>Sebaran rating</h2>
            <Bars rows={R.rating_buckets} />
          </>
        )}
        {R.size_buckets.length > 0 && (
          <>
            <h2>Sebaran jumlah ulasan</h2>
            <Bars rows={R.size_buckets} />
          </>
        )}
      </section>

      <section className="sec">
        <h2>Temuan</h2>
        {R.insights.length ? <ul>{R.insights.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="empty">Tidak ada catatan temuan.</p>}
        {R.ai_strategy && R.ai_strategy.length > 0 && (
          <>
            <h2>Strategi</h2>
            <ul>{R.ai_strategy.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </>
        )}
        {R.data_quality && (
          <p className="note">
            Kualitas data: {R.data_quality.raw} hasil mentah, {R.data_quality.kept} disimpan. Dibuang {R.data_quality.invalid_or_closed} tidak valid/tutup,{" "}
            {R.data_quality.out_of_area} di luar wilayah, {R.data_quality.duplicates_merged} duplikat digabung.
          </p>
        )}
        <p className="note">Semua angka hasil scraping Google Maps dan website bisnis saat laporan dibuat; kolom kosong berarti tidak tercantum di sumber.</p>
      </section>
    </article>
  );
}
