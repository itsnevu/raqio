"use client";
import BizAvatar from "@/components/BizAvatar";
import { memo, useState } from "react";
import ExtLink from "@/components/ExtLink";
import { type Biz, LEAD_ST, ST_LABEL, clean, dec, draft, fmtPhone, gapsOf, host, isGem, isProspect, isWeak, num, waOf } from "@/lib/biz";
import { igUrl, mailtoUrl } from "@/lib/safe";
import { ICON } from "./Icons";

export type RowProps = {
  p: Biz; industry: string; area: string; offer: string; rival: boolean; open: boolean;
  onToggleDraft: (p: Biz) => void; onOpen: (p: Biz) => void; onCheck: (p: Biz, onPending?: () => void) => Promise<void>; onLead: (p: Biz, st: string) => void;
};

function BizRowInner({ p, industry, area, offer, rival, open, onToggleDraft, onOpen, onCheck, onLead }: RowProps) {
  const [checking, setChecking] = useState<"" | "cek" | "pending">("");
  const [copied, setCopied] = useState("Salin");
  const g = gapsOf(p), wa = waOf(p);
  const msg = draft(p, industry, area, offer);
  const no = <span className="none">-</span>;
  const unk = (
    <button type="button" className="chk" disabled={!!checking} title="Ambil telepon, website, dan IG dari Google Maps"
      onClick={async () => { setChecking("cek"); try { await onCheck(p, () => setChecking("pending")); } finally { setChecking(""); } }}>
      {checking === "pending" ? "Masih dicek…" : checking ? "Mengecek…" : "Cek"}
    </button>
  );
  const ls = p.lead_score;
  const ig = igUrl(p.instagram);
  return (
    <>
      <tr>
        <td className="biz">
          <div className="nm">
            <button type="button" className="nm-btn withlogo" onClick={() => onOpen(p)}><BizAvatar name={clean(p.name)} website={p.website} logoKey={p.logo_key} size={28} />{clean(p.name)}</button>{" "}
            {isGem(p) && <span className="badge g">hidden gem</span>}
            {isWeak(p) && <span className="badge r">rating rendah</span>}
            {(p.branches_in_area ?? 0) > 1 && <span className="badge">{p.branches_in_area} cabang</span>}
            {isProspect(p, rival) && <span className="badge w">prospek</span>}
          </div>
          <div className="sub">{clean(p.category || "")}{p.price ? " · " + p.price : ""}</div>
          <div className="sub">{clean(p.address || "")}</div>
          {ls != null && (
            <div className="lrow">
              <span className={"ls" + (ls >= 60 ? " hi" : "")} title={(p.lead_reasons || []).join(", ")}>{ls}</span>
              <span className="sub">{(p.lead_reasons || []).slice(0, 3).join(", ")}</span>
              <select className={p.lead ? "set" : ""} value={p.lead?.status || ""} aria-label={"Status follow up " + clean(p.name)} onChange={(e) => e.target.value && onLead(p, e.target.value)}>
                <option value="">status</option>
                {LEAD_ST.map((st) => <option key={st} value={st}>{ST_LABEL[st]}</option>)}
              </select>
            </div>
          )}
          {g && g.length > 0 && <button type="button" className="mini" aria-expanded={open} onClick={() => onToggleDraft(p)}>{open ? "Tutup draf" : "Draf pesan"}</button>}
        </td>
        <td className="rating">{p.rating ? <><span className="st" aria-hidden="true">★</span> <b>{dec(p.rating)}</b></> : no}<div className="rv">{num(p.reviews)} ulasan</div></td>
        <td className="hide-m">{p.reviews_per_month != null ? (p.reviews_per_month > 0 ? <span style={{ color: "var(--accent)" }}>+{p.reviews_per_month}</span> : p.reviews_per_month) : no}</td>
        <td>{p.phone ? <><div className="mono">{fmtPhone(p)}</div>{wa && <ExtLink className="wa" href={wa + "?text=" + encodeURIComponent(msg)}>WhatsApp</ExtLink>}</> : p._detailed ? no : unk}</td>
        <td>{p.website ? <ExtLink className="lnk" href={p.website}>{ICON.web}{host(p.website)}</ExtLink> : p._detailed ? no : unk}</td>
        <td>{p.instagram ? <><ExtLink className="lnk" href={ig}>{ICON.ig}@{p.instagram}</ExtLink>{p.instagram_shared && <div className="sub">akun brand</div>}</> : p._detailed ? no : unk}</td>
        <td className="hide-m">{(p.emails || []).length ? (p.emails || []).slice(0, 2).map((e, k) => { const m = mailtoUrl(e); return <span key={e}>{k > 0 && <br />}{m ? <a className="lnk" href={m}>{ICON.mail}{e}</a> : e}</span>; }) : no}</td>
        <td className="mono hide-m">{p.dist_km != null ? dec(p.dist_km) + " km" : no}</td>
        <td className="hide-m"><ExtLink className="lnk" href={p.maps_url}>{ICON.pin}Buka</ExtLink></td>
      </tr>
      {open && (
        <tr className="draft"><td colSpan={9}><div className="dbox"><p>{msg}</p>
          <button type="button" className="btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(msg); setCopied("Tersalin ✓"); } catch { setCopied("Gagal"); } }}>{copied}</button>
        </div></td></tr>
      )}
    </>
  );
}

const BizRow = memo(BizRowInner);
export default BizRow;
