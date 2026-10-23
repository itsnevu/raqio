"use client";
// Panduan hubungi prospek satu per satu. Draf dilacak per leadKey, bukan indeks, jadi aman saat urutan berubah.
import Link from "next/link";
import { useState } from "react";
import ExtLink from "@/components/ExtLink";
import { type Biz, clean, dec, draft, gapsOf, isDefaultOffer, isProspect, leadKey, num, waOf } from "@/lib/biz";
import { igUrl } from "@/lib/safe";
import type { Report } from "@/lib/market/types";

type Props = { R: Report; all: Biz[]; offer: string; onOffer: (o: string) => void; setLead: (p: Biz, st: string) => Promise<void>; toast: (m: string) => void };

export default function DraftPanel({ R, all, offer, onOffer, setLead, toast }: Props) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [copyTxt, setCopyTxt] = useState("Salin pesan");
  const [busy, setBusy] = useState(false);
  const [offerIn, setOfferIn] = useState("");
  const pros = all.filter((p) => isProspect(p));
  const total = pros.length;
  const done = pros.filter((p) => p.lead && p.lead.status).length;
  const queue = pros.filter((p) => !p.lead || !p.lead.status).filter((p) => !skipped.has(leadKey(p))).sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0));
  const prog = (
    <div className="prog" role="status"><span>{done} dari {total} sudah dihubungi</span><div className="t"><div className="fill" style={{ width: (total ? (done / total) * 100 : 0) + "%" }} /></div><span>{queue.length} tersisa</span></div>
  );
  if (!total) return <div className="wiz">{prog}<div className="done"><h4>Belum ada yang bisa dihubungi.</h4><p>Klik tombol <b>Cek</b> di tab Semua pemain untuk mengambil nomor dan IG beberapa bisnis, nanti prospeknya muncul di sini.</p></div></div>;
  const p = queue[0];
  if (!p) return <div className="wiz">{prog}<div className="done"><h4>Semua prospek sudah kamu hubungi.</h4><p>Besok atau lusa cek siapa yang balas, lalu tandai Tertarik atau Deal di papan Prospek.</p><Link className="btn" href="/prospects">Buka papan Prospek</Link></div></div>;
  const key = leadKey(p), wa = waOf(p), g = gapsOf(p) || [];
  const text = edits[key] ?? draft(p, R.industry, R.area, offer);
  const how = wa ? "Klik tombol hijau. WhatsApp terbuka dengan pesan ini sudah terisi, tinggal tekan kirim."
    : p.instagram ? "Bisnis ini tidak ada nomor WhatsApp. Salin pesannya, buka Instagram-nya, lalu kirim lewat DM."
    : "Salin pesannya lalu kirim lewat kontak yang kamu temukan.";
  let n = 0;
  return (
    <div className="wiz">
      {prog}
      {isDefaultOffer() && (
        <div className="step"><div className="n" aria-hidden="true">{++n}</div><div><label><b>Tulis dulu jasa yang kamu tawarkan</b><span>Satu kalimat saja, dipakai otomatis di semua pesan.</span>
          <input className="offerin" value={offerIn} onChange={(e) => setOfferIn(e.target.value)} onBlur={() => { if (offerIn) { onOffer(offerIn); setEdits({}); } }} placeholder="mis. bikin website dan katalog online, atau kelola Instagram" /></label></div></div>
      )}
      <div className="step"><div className="n" aria-hidden="true">{++n}</div><div><b>Kirim pesan ke bisnis ini</b><span>{how}</span></div></div>
      <div className="who">
        <h4>{clean(p.name)}</h4>
        <div className="sub">{p.rating ? "★ " + dec(p.rating) + " · " : ""}{num(p.reviews)} ulasan{p.category ? " · " + clean(p.category) : ""}</div>
        <div className="gap">
          {g.map((x) => <span key={x} className="badge w">{x}</span>)}
          {p.instagram && <ExtLink className="lnk" href={igUrl(p.instagram)}>@{p.instagram}</ExtLink>}
          <ExtLink className="lnk" href={p.maps_url}>Maps</ExtLink>
        </div>
      </div>
      <label className="sr-only" htmlFor="wiz-msg">Draf pesan</label>
      <textarea id="wiz-msg" className="msg" value={text} onChange={(e) => setEdits({ ...edits, [key]: e.target.value })} />
      <div className="acts2">
        {wa && <ExtLink className="btn wa" href={wa + "?text=" + encodeURIComponent(text)}>Kirim via WhatsApp</ExtLink>}
        <button type="button" className="btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopyTxt("Tersalin"); } catch { setCopyTxt("Gagal"); } }}>{copyTxt}</button>
        <span className="sp" />
        <button type="button" className="btn ghost" onClick={() => setSkipped(new Set([...skipped, key]))}>Lewati</button>
        <button type="button" className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await setLead(p, "dihubungi"); toast(`${clean(p.name)} ditandai dihubungi`); } finally { setBusy(false); } }}>Sudah dikirim, lanjut</button>
      </div>
      <div className="step" style={{ margin: "14px 0 0" }}><div className="n" aria-hidden="true">{++n}</div><div><b>Setelah kirim, klik &quot;Sudah dikirim, lanjut&quot;</b><span>Bisnis ini ditandai Dihubungi dan prospek berikutnya muncul. Kalau nanti dibalas, ubah statusnya di papan Prospek.</span></div></div>
    </div>
  );
}
