"use client";
// Detail kampanye: progres, daftar penerima, dan alur kirim satu klik (mode manual).
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import "../campaigns.css";
import ExtLink from "@/components/ExtLink";
import LoadError from "@/components/LoadError";
import { useToast } from "@/components/shell/ToastContext";
import { apiGet, apiPost, errMsg } from "@/lib/api";
import { CHANNEL_LABEL, RSTATUS_LABEL, STATUS_LABEL, progressOf, totalOf, type Campaign, type Recipient } from "@/lib/campaigns";
import { useJobStream } from "@/lib/useJobStream";

type Detail = { campaign: Campaign; recipients: Recipient[] };
type Next = { done: boolean; left?: number; recipient?: Recipient & { subject: string } };

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string>("");
  const [next, setNext] = useState<Next | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await apiGet<Detail>("/api/campaigns/" + id);
      setD(j);
      setErr("");
      if (j.campaign.mode === "manual" && j.campaign.status === "running") setNext(await apiGet<Next>(`/api/campaigns/${id}/next`));
      else setNext(null);
    } catch (e) {
      setErr(errMsg(e, "Gagal memuat kampanye"));
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const jobId = d?.campaign.job_id && d.campaign.status === "running" ? d.campaign.job_id : null;
  useJobStream(jobId, { onDone: () => void load() });
  useEffect(() => {
    if (!d || d.campaign.mode !== "auto" || d.campaign.status !== "running") return;
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [d, load]);

  const act = async (path: string, body: unknown, okMsg?: string) => {
    setBusy(true);
    try {
      await apiPost(path, body);
      if (okMsg) toast(okMsg);
      await load();
    } catch (e) {
      toast(errMsg(e, "Gagal"));
    } finally {
      setBusy(false);
    }
  };
  const mark = (status: string) => next?.recipient && act(`/api/campaigns/${id}/mark`, { recipient_id: next.recipient.id, status });
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { toast("Tidak bisa menyalin, salin manual"); }
  };

  if (err) return <div className="wrap campp"><LoadError error={err} onRetry={load} /></div>;
  if (!d) return <div className="wrap campp" />;
  const c = d.campaign;
  const r = next?.recipient;
  return (
    <div className="wrap campp">
      <div className="head">
        <div>
          <Link href="/campaigns" className="back">← Semua kampanye</Link>
          <h1>{c.name}</h1>
          <p className="lead">{CHANNEL_LABEL[c.channel]} · {c.mode === "auto" ? "otomatis" : "satu klik"} · <span className={"st " + c.status}>{STATUS_LABEL[c.status]}</span> · {progressOf(c)}% dari {totalOf(c)} penerima</p>
        </div>
        <div className="acts">
          {c.status === "draft" && <button type="button" className="btn" disabled={busy} onClick={() => act(`/api/campaigns/${id}/start`, {}, "Kampanye dimulai")}>Mulai</button>}
          {c.status === "paused" && <button type="button" className="btn" disabled={busy} onClick={() => act(`/api/campaigns/${id}/start`, {}, "Dilanjutkan")}>Lanjutkan</button>}
          {c.status === "running" && <button type="button" className="btn ghost" disabled={busy} onClick={() => act(`/api/campaigns/${id}/pause`, {}, "Dijeda")}>Jeda</button>}
        </div>
      </div>

      {c.mode === "manual" && c.status === "running" && r && (
        <div className="sendbox" aria-live="polite">
          <div className="sbtop"><b>Kirim ke {r.name}</b><span className="meta">{next?.left} tersisa · {r.to_addr}</span></div>
          <pre>{r.rendered}</pre>
          <div className="sbacts">
            <ExtLink className="btn" href={r.link}>{c.channel === "whatsapp" ? "Buka WhatsApp" : c.channel === "instagram" ? "Buka profil Instagram" : "Buka email"}</ExtLink>
            <button type="button" className="btn ghost" onClick={() => copy(r.rendered)}>{copied ? "Tersalin" : "Salin pesan"}</button>
            <ExtLink className="btn ghost" href={r.audit_url}>Lihat audit</ExtLink>
            <span className="spacer" />
            <button type="button" className="btn ghost" disabled={busy} onClick={() => mark("sent")}>Sudah dikirim</button>
            <button type="button" className="mini" disabled={busy} onClick={() => mark("skipped")}>Lewati</button>
          </div>
          {c.channel === "instagram" && <p className="hint">Pesan disalin, tempel di DM profil yang terbuka. Satu per satu supaya akunmu aman.</p>}
        </div>
      )}
      {c.mode === "manual" && c.status === "running" && next?.done && <div className="empty">Semua penerima sudah diproses.</div>}
      {c.mode === "auto" && c.status === "running" && (
        <div className="sendbox"><b>Worker sedang mengirim</b> dengan jeda {c.throttle_sec} detik. Daftar penerima di bawah diperbarui otomatis.</div>
      )}

      <table className="rtable">
        <thead><tr><th>Prospek</th><th>Tujuan</th><th>Status</th><th>Waktu</th><th>Audit</th></tr></thead>
        <tbody>
          {d.recipients.map((x) => (
            <tr key={x.id} className={x.status}>
              <td>{x.name}</td>
              <td className="mono">{x.to_addr || "-"}</td>
              <td><span className={"rs " + x.status}>{RSTATUS_LABEL[x.status]}</span>{x.error && <small className="meta"> {x.error}</small>}</td>
              <td className="meta">{x.sent_at ? new Date(x.sent_at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
              <td><ExtLink href={x.audit_url} className="mini">buka</ExtLink></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
