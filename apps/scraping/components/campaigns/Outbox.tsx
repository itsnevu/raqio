"use client";
// Semua kiriman dari semua kampanye: ringkasan per saluran, filter, dan tombol menandai balasan.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import LoadError from "@/components/LoadError";
import { useToast } from "@/components/shell/ToastContext";
import { apiGet, apiPost, errMsg } from "@/lib/api";
import { CHANNEL_LABEL, RSTATUS_LABEL, type Channel, type Outbox as Data, type OutboxItem, type RecipientStatus } from "@/lib/campaigns";
import { invalidate, PROSPECTS_KEY } from "@/lib/cache";

const CHANNELS: Channel[] = ["whatsapp", "email", "instagram"];
const STATUSES: RecipientStatus[] = ["sent", "replied", "pending", "failed", "skipped", "unsubscribed"];
const when = (t: string | null) => (t ? new Date(t).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-");

export default function Outbox() {
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [channel, setChannel] = useState<Channel | "">("");
  const [status, setStatus] = useState<RecipientStatus | "">("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const seq = useRef(0); // balasan lama yang datang terlambat tidak menimpa filter terbaru

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const j = await apiGet<Data>("/api/campaigns/outbox?" + new URLSearchParams({ channel, status, q, offset: String(offset) }));
      if (mine !== seq.current) return;
      if (!j.items.length && offset > 0) return setOffset(0);
      setD(j);
      setErr("");
    } catch (e) {
      if (mine === seq.current) setErr(errMsg(e, "Gagal memuat kiriman"));
    }
  }, [channel, status, q, offset]);
  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 20000);
    return () => clearInterval(t);
  }, [load]);

  const mark = async (x: OutboxItem) => {
    setBusy(x.id);
    try {
      await apiPost(`/api/campaigns/${x.campaign_id}/mark`, { recipient_id: x.id, status: "replied" });
      invalidate(PROSPECTS_KEY);
      toast(`${x.name} ditandai dibalas`);
      await load();
    } catch (e) {
      toast(errMsg(e, "Gagal menandai"));
    } finally {
      setBusy(null);
    }
  };
  const filter = (fn: () => void) => { fn(); setOffset(0); };

  if (err && !d) return <LoadError error={err} onRetry={load} />;
  if (!d) return <p className="meta" aria-busy="true">Memuat kiriman…</p>;
  const sum = (ch: Channel, ...st: RecipientStatus[]) => st.reduce((n, s) => n + (d.summary[ch][s] || 0), 0);
  const any = CHANNELS.some((ch) => sum(ch, ...STATUSES) > 0);
  if (!any) return <div className="empty">Belum ada kiriman. Buat dan mulai kampanye dulu, hasilnya muncul di sini.</div>;
  return (
    <div className="outbox">
      <div className="ob-cards">
        {CHANNELS.map((ch) => (
          <button type="button" key={ch} className={"ob-card" + (channel === ch ? " on" : "")} aria-pressed={channel === ch} onClick={() => filter(() => setChannel(channel === ch ? "" : ch))}>
            <span className="meta">{CHANNEL_LABEL[ch]}</span>
            <b>{sum(ch, "sent", "replied")} <small>terkirim</small></b>
            <span className="meta">{sum(ch, "replied")} dibalas · {sum(ch, "pending")} menunggu · {sum(ch, "failed")} gagal</span>
          </button>
        ))}
      </div>
      <div className="ob-bar">
        <input type="search" aria-label="Cari kiriman" placeholder="Cari nama, tujuan, atau kampanye" maxLength={100} value={q} onChange={(e) => filter(() => setQ(e.target.value))} />
        <select aria-label="Saluran" value={channel} onChange={(e) => filter(() => setChannel(e.target.value as Channel | ""))}>
          <option value="">Semua saluran</option>
          {CHANNELS.map((ch) => <option key={ch} value={ch}>{CHANNEL_LABEL[ch]}</option>)}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => filter(() => setStatus(e.target.value as RecipientStatus | ""))}>
          <option value="">Semua status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{RSTATUS_LABEL[s]}</option>)}
        </select>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      {d.items.length === 0 ? <div className="empty">Tidak ada kiriman yang cocok dengan filter ini.</div> : (
        <div className="ob-scroll">
          <table className="rtable">
            <thead><tr><th>Prospek</th><th>Saluran</th><th>Kampanye</th><th>Status</th><th>Waktu kirim</th><th><span className="sr-only">Aksi</span></th></tr></thead>
            <tbody>
              {d.items.map((x) => (
                <tr key={x.id} className={x.status}>
                  <td><details><summary>{x.name}</summary><pre>{x.rendered}</pre></details><small className="meta">{x.to_addr || "tanpa kontak"}</small></td>
                  <td>{CHANNEL_LABEL[x.channel]}</td>
                  <td><Link href={"/campaigns/" + x.campaign_id}>{x.campaign}</Link></td>
                  <td><span className={"rs " + x.status}>{RSTATUS_LABEL[x.status]}</span>{x.error && <small className="meta"> {x.error}</small>}</td>
                  <td className="meta">{when(x.sent_at)}</td>
                  <td>{x.status === "sent" && <button type="button" className="mini" disabled={busy === x.id} onClick={() => void mark(x)}>Tandai dibalas</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="ob-page">
        <span className="meta">{d.total ? `${offset + 1} sampai ${offset + d.items.length} dari ${d.total}` : ""}</span>
        <button type="button" className="mini" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - d.page))}>Sebelumnya</button>
        <button type="button" className="mini" disabled={offset + d.items.length >= d.total} onClick={() => setOffset(offset + d.page)}>Berikutnya</button>
      </div>
      <p className="hint">Terkirim berarti pesan diterima gateway atau server email, atau kamu menandainya sendiri. Status sampai dan dibaca belum tersedia.</p>
    </div>
  );
}
