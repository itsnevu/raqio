"use client";
// Panel detail satu bisnis: kontak, follow up, draf pesan, Instagram. Tidak memutasi `p`; perubahan dikirim lewat ctx.onChange.
import { useEffect, useState } from "react";
import BizAvatar from "@/components/BizAvatar";
import ErrorBoundary from "@/components/ErrorBoundary";
import ExtLink from "@/components/ExtLink";
import { errMsg } from "@/lib/api";
import { type Biz, LEAD_ST, ST_LABEL, clean, dec, draft, host, leadKey, num, saveLead } from "@/lib/biz";
import { setBusinessContext } from "@/lib/chat/context";
import { checkDetail } from "@/lib/market/detail";
import { igUrl, mailtoUrl } from "@/lib/safe";
import IgSection from "./IgSection";
import { useToast } from "./ToastContext";
import { waOf } from "@/lib/biz";

export type OpenCtx = { industry?: string; area?: string; report_id?: number | string | null; onChange?: (p: Biz) => void };

const SRC_LABEL: Record<string, string> = { maps: "Google Maps", overture: "Overture Maps (Meta, Microsoft, Foursquare)", osm: "OpenStreetMap", places_api: "Google Places API", tomtom: "TomTom", website: "website bisnis" };
const FIELD_LABEL: Record<string, string> = { phone: "telepon", website: "website", instagram: "Instagram", emails: "email" };

export default function BusinessPanel({ p, ctx, reopen }: { p: Biz; ctx: OpenCtx; reopen: (p: Biz) => void }) {
  const toast = useToast();
  const industry = ctx.industry || p.industry,
    area = ctx.area || p.area,
    rid = Number(ctx.report_id || p.report_id || 0) || null;
  const wa = waOf(p),
    lead = p.lead || {};
  const [status, setStatus] = useState(lead.status || "");
  const [note, setNote] = useState(lead.note || "");
  const [remind, setRemind] = useState(lead.remind || "");
  const [copyTxt, setCopyTxt] = useState("Salin draf");
  const [detTxt, setDetTxt] = useState("Cek kontak sekarang");
  const [detBusy, setDetBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const msg = draft(p, industry, area);
  // bisnis yang sedang dibuka ikut dikirim sebagai konteks ke asisten (tetap berlaku setelah panel ini diganti panel chat)
  useEffect(() => {
    setBusinessContext(leadKey(p) || null);
  }, [p]);
  const no = <span style={{ color: "var(--faint)" }}>tidak ada</span>;
  const unk = <span style={{ color: "var(--faint)" }}>belum dicek</span>;

  const save = async () => {
    setSaving(true);
    try {
      const next = await saveLead(p, { status: status || "baru", note, remind });
      toast("Tersimpan");
      ctx.onChange?.(next);
    } catch (e) {
      toast(errMsg(e, "Gagal menyimpan"));
    } finally {
      setSaving(false);
    }
  };
  const detail = async () => {
    if (!rid) return;
    setDetBusy(true);
    setDetTxt("Membuka Google Maps… (±15 detik)");
    try {
      const next = await checkDetail(rid, p, () => setDetTxt("Masih dicek… (maksimal 90 detik)"));
      toast("Kontak diperbarui");
      ctx.onChange?.(next);
      reopen(next);
    } catch (e) {
      setDetBusy(false);
      setDetTxt("Cek kontak sekarang");
      toast(errMsg(e, "Gagal"));
    }
  };

  return (
    <>
      <div className="bz-sec">
        <div className="bz-logo">
          <BizAvatar name={clean(p.name)} website={p.website} logoKey={p.logo_key} size={64} zoom />
          <div className="muted-note">
            {clean(p.category || "")}
            {area ? " · " + area : ""}
            {(p.logo_key || p.website) && <small>Klik logo untuk memperbesar</small>}
          </div>
        </div>
        <div className="big-n" style={{ marginTop: 12 }}>
          <div>
            <b>{p.rating ? dec(p.rating) : "-"}</b>
            <small>rating</small>
          </div>
          <div>
            <b>{num(p.reviews)}</b>
            <small>ulasan</small>
          </div>
          <div>
            <b>{p.lead_score ?? "-"}</b>
            <small>skor prospek</small>
          </div>
        </div>
        {(p.lead_reasons || []).length > 0 && (
          <div className="reasons">
            {(p.lead_reasons || []).map((x) => (
              <span key={x}>{clean(x)}</span>
            ))}
          </div>
        )}
      </div>
      <div className="bz-sec">
        <h4>Kontak</h4>
        <div className="kv">
          <span>Telepon</span>
          <span>{p.phone ? clean(p.phone) : p._detailed ? no : unk}</span>
          <span>Website</span>
          <span>{p.website ? <ExtLink href={p.website}>{host(p.website)}</ExtLink> : p._detailed ? no : unk}</span>
          <span>Instagram</span>
          <span>{p.instagram ? <ExtLink href={igUrl(p.instagram)}>@{p.instagram}</ExtLink> : p._detailed ? no : unk}</span>
          <span>Email</span>
          <span>
            {(p.emails || []).length
              ? (p.emails || []).map((e, i) => {
                  const m = mailtoUrl(e);
                  return (
                    <span key={e}>
                      {i > 0 && <br />}
                      {m ? <a href={m}>{e}</a> : e}
                    </span>
                  );
                })
              : no}
          </span>
          <span>Alamat</span>
          <span>{clean(p.address || "-")}</span>
        </div>
        {(p.on_maps === false || p.src_fields || p.web_ok != null) && (
          <p className="muted-note src-note">
            {p.on_maps === false && <>Tidak muncul di hasil pencarian Google Maps (belum punya profil, atau di luar hasil teratas); data dari {(p.sources || []).map((s) => SRC_LABEL[s] || s).join(", ")}{p.confidence != null ? ` (keyakinan ${Math.round(p.confidence * 100)}%)` : ""}. </>}
            {p.src_fields && <>Sumber kontak: {Object.entries(p.src_fields).map(([k, v]) => `${FIELD_LABEL[k] || k} dari ${SRC_LABEL[v] || v}`).join(", ")}. </>}
            {p.web_ok === true && <>Website dicek hidup saat pindaian. </>}
            {p.web_ok === false && <>Website tidak merespons saat pindaian. </>}
            {p.src_url && <ExtLink href={p.src_url}>halaman asal</ExtLink>}
          </p>
        )}
        <div className="acts-row">
          {wa && (
            <ExtLink className="btn wa-btn" href={wa + "?text=" + encodeURIComponent(msg)}>
              Kirim WhatsApp
            </ExtLink>
          )}
          {p.maps_url && (
            <ExtLink className="btn ghost" href={p.maps_url}>
              Buka di Maps
            </ExtLink>
          )}
          {!p._detailed && rid && (
            <button type="button" className="btn ghost" disabled={detBusy} onClick={detail}>
              {detTxt}
            </button>
          )}
        </div>
      </div>
      <div className="bz-sec">
        <h4 id="bz-followup">Follow up</h4>
        <div className="st-row" role="group" aria-labelledby="bz-followup">
          {LEAD_ST.map((s) => (
            <button key={s} type="button" className={status === s ? "on" : ""} aria-pressed={status === s} onClick={() => setStatus(s)}>
              {ST_LABEL[s]}
            </button>
          ))}
        </div>
        <label className="field">
          Catatan
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. pemiliknya Pak Budi, minta dihubungi sore" />
        </label>
        <label className="field">
          Ingatkan saya tanggal
          <input type="date" value={remind} onChange={(e) => setRemind(e.target.value)} />
        </label>
        <div className="acts-row">
          <button type="button" className="btn" onClick={save} disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
      <div className="bz-sec">
        <h4>Draf pesan</h4>
        <p className="muted-note">{msg}</p>
        <button
          type="button"
          className="btn ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(msg);
              setCopyTxt("Tersalin ✓");
            } catch {
              setCopyTxt("Gagal menyalin");
            }
          }}
        >
          {copyTxt}
        </button>
      </div>
      {p.instagram && (
        <ErrorBoundary label="Bagian Instagram">
          <IgSection handle={p.instagram} />
        </ErrorBoundary>
      )}
    </>
  );
}
