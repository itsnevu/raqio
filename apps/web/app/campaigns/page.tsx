"use client";
// Kampanye: turn research into client. Pilih prospek, tulis pesan personal dari template, kirim lewat WhatsApp,
// Instagram, atau email (otomatis lewat gateway/SMTP, atau semi-otomatis satu klik), lacak hasilnya.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import "./campaigns.css";
import LoadError from "@/components/LoadError";
import { useToast } from "@/components/shell/ToastContext";
import { ApiError, apiGet, apiPost, errMsg } from "@/lib/api";
import { CHANNEL_LABEL, STATUS_LABEL, VARS, canAuto, progressOf, totalOf, type Campaign, type Channel, type CampaignMode, type Preview, type Templates } from "@/lib/campaigns";

export default function CampaignsPage() {
  return (
    <Suspense fallback={<div className="wrap campp" />}>
      <Campaigns />
    </Suspense>
  );
}

function Campaigns() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [list, setList] = useState<Campaign[] | null>(null);
  const [templates, setTemplates] = useState<Templates | null>(null);
  const [err, setErr] = useState<string>("");
  const [open, setOpen] = useState(params.get("new") === "1" || params.get("from") === "prospects");

  const load = useCallback(async () => {
    try {
      const j = await apiGet<{ campaigns: Campaign[]; templates: Templates }>("/api/campaigns");
      setList(j.campaigns);
      setTemplates(j.templates);
      setErr("");
    } catch (e) {
      setErr(errMsg(e, "Gagal memuat kampanye"));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="wrap campp">
      <div className="head">
        <div>
          <h1>Kampanye</h1>
          <p className="lead">Dari riset ke klien: kirim pesan personal ke prospek lewat WhatsApp, Instagram, atau email, lengkap dengan tautan audit per bisnis. Setiap kiriman otomatis menandai prospek &quot;dihubungi&quot;.</p>
        </div>
        <button type="button" className="btn" onClick={() => setOpen(true)}>Kampanye baru</button>
      </div>
      {open && templates && (
        <NewCampaign templates={templates} onClose={() => setOpen(false)} onCreated={(id) => { setOpen(false); toast("Kampanye dibuat"); router.push("/campaigns/" + id); }} />
      )}
      {err && <LoadError error={err} onRetry={load} />}
      {list && list.length === 0 && !open && (
        <div className="empty">
          <b>Belum ada kampanye.</b> Buat satu dari prospek di papan: pilih saluran, cek pratinjau pesan, lalu kirim.
        </div>
      )}
      {list && list.length > 0 && (
        <div className="clist">
          {list.map((c) => (
            <Link key={c.id} href={"/campaigns/" + c.id} className="crow">
              <div className="cmain">
                <b>{c.name}</b>
                <span className="meta">{CHANNEL_LABEL[c.channel]} · {c.mode === "auto" ? "otomatis" : "satu klik"} · {new Date(c.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span>
              </div>
              <div className="cstat">
                <span className={"st " + c.status}>{STATUS_LABEL[c.status]}</span>
                <span className="meta">{(c.counts.sent || 0) + (c.counts.replied || 0)} terkirim · {c.counts.replied || 0} dibalas · {totalOf(c)} penerima</span>
                <div className="bar"><div className="fill" style={{ width: progressOf(c) + "%" }} /></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewCampaign({ templates, onClose, onCreated }: { templates: Templates; onClose: () => void; onCreated: (id: number) => void }) {
  const toast = useToast();
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [mode, setMode] = useState<CampaignMode>("manual");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState(templates.email.Subject);
  const [template, setTemplate] = useState(templates.whatsapp.Body);
  const [throttle, setThrottle] = useState(90);
  const [minScore, setMinScore] = useState(50);
  const [area, setArea] = useState("");
  const [statuses, setStatuses] = useState<string[]>(["baru"]);
  const [limit, setLimit] = useState(50);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sel = { min_score: minScore, area, statuses, limit };
  const pickChannel = (ch: Channel) => {
    setChannel(ch);
    setTemplate(templates[ch].Body);
    if (!canAuto(ch)) setMode("manual");
  };
  useEffect(() => {
    const t = setTimeout(() => {
      apiPost<Preview>("/api/campaigns/preview", { channel, template, subject, select: sel }).then(setPreview).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, template, subject, minScore, area, statuses.join(","), limit]);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const j = await apiPost<{ id: number; counts: Record<string, number>; total: number }>("/api/campaigns", { name, channel, mode, subject, template, throttle_sec: throttle, select: sel });
      if (j.counts.skipped) toast(`${j.counts.skipped} prospek dilewati karena tidak punya ${channel === "email" ? "email" : channel === "instagram" ? "akun Instagram" : "nomor WhatsApp"}`);
      onCreated(j.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : errMsg(e, "Gagal membuat kampanye"));
    } finally {
      setBusy(false);
    }
  };
  const toggleStatus = (s: string) => setStatuses((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));

  return (
    <div className="wizard" role="dialog" aria-labelledby="wiz-title" aria-modal="false">
      <div className="wtop">
        <h2 id="wiz-title">Kampanye baru</h2>
        <button type="button" className="mini" onClick={onClose}>Tutup</button>
      </div>
      <div className="wgrid">
        <section>
          <h3>1. Pilih prospek</h3>
          <label>Skor minimal <input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} /></label>
          <label>Wilayah (opsional) <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="mis. Kemang" /></label>
          <fieldset className="chk">
            <legend>Status prospek</legend>
            {["baru", "dihubungi", "tertarik"].map((s) => (
              <label key={s}><input type="checkbox" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} /> {s}</label>
            ))}
          </fieldset>
          <label>Maksimal penerima <input type="number" min={1} max={500} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></label>
          <p className="hint">{preview ? <>{preview.matched} prospek cocok, <b>{preview.reachable}</b> punya kontak untuk saluran ini.</> : "Menghitung…"}</p>
        </section>
        <section>
          <h3>2. Saluran dan cara kirim</h3>
          <div className="seg" role="group" aria-label="Saluran">
            {(["whatsapp", "instagram", "email"] as Channel[]).map((ch) => (
              <button key={ch} type="button" className={channel === ch ? "on" : ""} aria-pressed={channel === ch} onClick={() => pickChannel(ch)}>{CHANNEL_LABEL[ch]}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Mode">
            <button type="button" className={mode === "manual" ? "on" : ""} aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>Satu klik (aman)</button>
            <button type="button" className={mode === "auto" ? "on" : ""} aria-pressed={mode === "auto"} disabled={!canAuto(channel)} onClick={() => setMode("auto")}>Otomatis</button>
          </div>
          <p className="hint">
            {channel === "whatsapp" && (mode === "auto" ? "Dikirim worker lewat gateway WhatsApp Business (Fonnte, Wablas, atau generic) dengan jeda antar pesan. Atur di Pengaturan > Pengirim." : "Tiap prospek dibuka di wa.me dengan pesan sudah terisi; kamu tinggal tekan kirim. Aman dari pemblokiran nomor.")}
            {channel === "instagram" && "Instagram selalu satu klik: profil dibuka, pesan disalin otomatis. DM massal otomatis membuat akun diblokir."}
            {channel === "email" && (mode === "auto" ? "Dikirim worker lewat SMTP dengan jeda, membawa tautan berhenti berlangganan. Butuh email terverifikasi." : "Dibuka di aplikasi email kamu dengan subjek dan isi terisi.")}
          </p>
          {mode === "auto" && <label>Jeda antar pesan (detik) <input type="number" min={15} max={3600} value={throttle} onChange={(e) => setThrottle(Number(e.target.value))} /></label>}
          <label>Nama kampanye (opsional) <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Coffee shop Kemang, Oktober" /></label>
        </section>
        <section className="wide">
          <h3>3. Pesan</h3>
          {channel === "email" && <label>Subjek <input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>}
          <label>Template
            <textarea rows={8} value={template} onChange={(e) => setTemplate(e.target.value)} />
          </label>
          <div className="vars">Variabel: {VARS.map((v) => <button type="button" key={v} className="chip" onClick={() => setTemplate((t) => t + " " + v)}>{v}</button>)}</div>
          <div className="preview">
            <div className="plabel">Pratinjau untuk {preview?.sample ? <b>{preview.sample.name}</b> : "prospek pertama"}</div>
            {channel === "email" && preview?.subject && <div className="psub">Subjek: {preview.subject}</div>}
            <pre>{preview?.rendered || "(tidak ada prospek yang cocok)"}</pre>
          </div>
        </section>
      </div>
      {error && <div className="err" role="alert">{error}</div>}
      <div className="wacts">
        <button type="button" className="btn" disabled={busy || !preview || preview.reachable === 0} onClick={create}>{busy ? "Membuat…" : `Buat kampanye (${preview?.reachable ?? 0} penerima)`}</button>
        <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
      </div>
    </div>
  );
}
