"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "../login/login.css";
import ExtLink from "@/components/ExtLink";
import LoadError, { PageSkeleton } from "@/components/LoadError";
import { useToast } from "@/components/Shell";
import { useTour } from "@/components/Tour";
import { ApiError, apiGet, apiPost, errMsg, type Invoice, type Me, type Org, type Plan } from "@/lib/api";
import { getMe, resetMe } from "@/lib/me";
import { clearOrgStorage } from "@/lib/storage";
import { SETTINGS_TOUR } from "@/lib/tours";

type Notif = { notify_email: string; telegram_chat: string; webhook_url: string; webhook_secret: string; webhook_secret_masked?: string; telegram_bot?: boolean };
type Billing = { invoices: Invoice[]; plan_until: string | null };
type Data = { org: Org; me: Me; plans: Plan[]; provider: string; billing: Billing | null; notif: Notif };
type Loaded = { loading: boolean; error: string | null; data: Data | null };

const rp = (n: number) => "Rp" + n.toLocaleString("id-ID");

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [st, setSt] = useState<Loaded>({ loading: true, error: null, data: null });
  const [invite, setInvite] = useState("");
  const [inviteRole, setInviteRole] = useState("analyst");
  const [delPass, setDelPass] = useState("");
  type Sender = { sender_name: string; sender_phone: string; reply_to: string; wa_provider: string; wa_gateway_url: string; wa_gateway_token: string; wa_gateway_token_masked?: string };
  const [sender, setSender] = useState<Sender>({ sender_name: "", sender_phone: "", reply_to: "", wa_provider: "", wa_gateway_url: "", wa_gateway_token: "" });
  const [notif, setNotif] = useState<Notif>({ notify_email: "", telegram_chat: "", webhook_url: "", webhook_secret: "" });
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [delConflict, setDelConflict] = useState("");

  const load = useCallback(async () => {
    setSt((s) => ({ ...s, loading: true, error: null }));
    try {
      const [org, me, plansRes, billing, settings, snd] = await Promise.all([
        apiGet<Org>("/org"),
        getMe(true),
        apiGet<{ plans?: Plan[]; provider?: string }>("/billing/plans").catch(() => ({ plans: [], provider: "manual" })),
        apiGet<Billing>("/billing/invoices").catch(() => null),
        apiGet<Partial<Notif>>("/org/settings").catch((): Partial<Notif> => ({})),
        apiGet<Partial<Sender>>("/org/sender").catch((): Partial<Sender> => ({})),
      ]);
      const n: Notif = { notify_email: settings.notify_email || "", telegram_chat: settings.telegram_chat || "", webhook_url: settings.webhook_url || "", webhook_secret: "", webhook_secret_masked: settings.webhook_secret_masked, telegram_bot: settings.telegram_bot };
      setNotif(n);
      setSender({ sender_name: snd.sender_name || "", sender_phone: snd.sender_phone || "", reply_to: snd.reply_to || "", wa_provider: snd.wa_provider || "", wa_gateway_url: snd.wa_gateway_url || "", wa_gateway_token: "", wa_gateway_token_masked: snd.wa_gateway_token_masked });
      setSt({ loading: false, error: null, data: { org: { ...org, members: org.members || [], usage: org.usage || {}, limits: org.limits }, me, plans: plansRes.plans || [], provider: plansRes.provider || "manual", billing: billing && Array.isArray(billing.invoices) ? billing : null, notif: n } });
    } catch (e) {
      setSt({ loading: false, error: errMsg(e, "Pengaturan gagal dimuat."), data: null });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  /** POST dengan toast otomatis saat gagal; mengembalikan null kalau gagal. */
  const post = useCallback(async <T = Record<string, unknown>,>(path: string, body: unknown, key = path): Promise<T | null> => {
    setBusy(key);
    try {
      return await apiPost<T>(path, body);
    } catch (e) {
      toast(errMsg(e, "Gagal"));
      return null;
    } finally {
      setBusy(null);
    }
  }, [toast]);

  const deleteAccount = async (force: boolean) => {
    if (!force && !confirm("Yakin hapus akun dan semua datanya?")) return;
    setBusy("delete");
    try {
      await apiPost("/auth/delete-account", force ? { password: delPass, force: true } : { password: delPass });
      clearOrgStorage();
      resetMe();
      router.replace("/login");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setDelConflict(e.message || "Alihkan owner ke anggota lain dulu, atau hapus sekaligus alihkan.");
      else toast(errMsg(e, "Gagal menghapus akun"));
    } finally {
      setBusy(null);
    }
  };

  // datang dari tautan undangan sambil sudah login
  useEffect(() => {
    const tok = params.get("invite");
    if (!tok) return;
    post("/auth/accept-invite", { token: tok }).then((j) => {
      if (j) {
        toast("Bergabung ke tim");
        resetMe();
        router.replace("/settings");
        void load();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  useEffect(() => {
    if (params.get("paid") === "1") toast("Pembayaran diterima, paket aktif dalam beberapa detik");
  }, [params, toast]);

  const data = st.data;
  useTour("settings", SETTINGS_TOUR, !!data);
  if (st.loading && !data) return <PageSkeleton />;
  if (st.error || !data)
    return (
      <div className="wrap" style={{ maxWidth: 760 }}>
        <h1>Pengaturan</h1>
        <LoadError error={st.error || "Data kosong."} onRetry={() => void load()} />
      </div>
    );
  const { org, me, plans, provider, billing } = data;
  const canManage = me.role === "owner" || me.role === "admin";
  const limits = org.limits || me.limits;

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <h1>Pengaturan</h1>
      <p className="lead">
        {org.name} · paket <b>{org.plan}</b> · masuk sebagai {me.email} ({me.role})
      </p>

      {!me.verified && (
        <div className="goalwarn" style={{ display: "block", margin: "12px 0" }} role="status">
          Email kamu belum diverifikasi. Cek kotak masuk, atau{" "}
          <button type="button" disabled={busy === "/auth/resend-verify"} onClick={async () => (await post("/auth/resend-verify", {})) && toast("Email verifikasi dikirim ulang")}>kirim ulang</button>.
        </div>
      )}

      <div className="key3" style={{ marginTop: 24 }}>
        <div><small>Riset bulan ini</small><p>{org.usage.market_run || 0} dari {limits?.runs ?? "-"}</p></div>
        <div><small>Cek kontak bulan ini</small><p>{org.usage.market_detail || 0} dari {limits?.details ?? "-"}</p></div>
        <div><small>Wilayah pantau</small><p>maks {limits?.watches ?? "-"}</p></div>
      </div>
      <p className="muted-note">
        Kuota direset tiap awal bulan.
        {billing?.plan_until && <> Paket {org.plan} aktif sampai {new Date(billing.plan_until).toLocaleDateString("id-ID", { dateStyle: "medium" })}.</>}
      </p>

      <div className="bz-sec" style={{ marginTop: 24 }}>
        <h4>Paket</h4>
        {plans.length === 0 && <p className="muted-note">Daftar paket belum bisa dimuat. <button type="button" className="mini" onClick={() => void load()}>Coba lagi</button></p>}
        <div className="reasons" style={{ marginBottom: 0 }}>
          {plans.map((p) => (
            <div className="reason" key={p.name} style={p.name === org.plan ? { borderColor: "var(--good)" } : undefined}>
              <div className="big">{p.name}<small>{p.price ? rp(p.price) + "/bln" : "gratis"}</small></div>
              <p>{p.runs} riset, {p.details} cek kontak, {p.watches} pantau, {p.members} anggota</p>
              {p.price > 0 && p.name !== org.plan && me.role === "owner" && (
                <button type="button" className="btn ghost" style={{ marginTop: 10 }} disabled={busy === "checkout"} onClick={async () => {
                  const j = await post<{ url?: string; message?: string }>("/billing/checkout", { plan: p.name }, "checkout");
                  if (!j) return;
                  if (j.url && /^https:\/\//.test(j.url)) location.href = j.url;
                  else { toast(j.message || "Permintaan aktivasi dikirim"); void load(); }
                }}>
                  {provider === "xendit" ? "Bayar dan aktifkan" : "Minta aktivasi"}
                </button>
              )}
            </div>
          ))}
        </div>
        {billing && billing.invoices.length > 0 && (
          <div className="kv" style={{ marginTop: 14 }}>
            {billing.invoices.map((i) => (
              <span key={i.id} style={{ gridColumn: "1 / -1" }}>
                #{i.id} · {i.plan} · {rp(i.amount)} · <span className="badge">{i.status}</span>
                {i.url && i.status === "pending" && <> · <ExtLink href={i.url}>bayar</ExtLink></>}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bz-sec">
        <h4>Anggota tim ({org.members.length} dari {limits?.members ?? "-"})</h4>
        <div className="kv">
          {org.members.map((m) => (
            <span key={m.email} style={{ gridColumn: "1 / -1" }}>
              {m.email} <span className="badge">{m.role}</span>
              {canManage && m.email !== me.email && m.role !== "owner" && (
                <button type="button" className="mini" style={{ marginLeft: 8 }} disabled={busy === "/org/remove-member"} onClick={async () => (await post("/org/remove-member", { email: m.email })) && load()}>keluarkan</button>
              )}
            </span>
          ))}
        </div>
        {canManage && (
          <form className="acts-row" onSubmit={async (e) => { e.preventDefault(); if (await post("/org/invite", { email: invite, role: inviteRole })) { toast("Undangan dikirim ke " + invite + " sebagai " + inviteRole); setInvite(""); } }}>
            <input className="offerin" style={{ margin: 0, maxWidth: 320 }} type="email" aria-label="Email yang diundang" placeholder="email yang diundang" value={invite} onChange={(e) => setInvite(e.target.value)} required />
            <select className="offerin" style={{ margin: 0, maxWidth: 140 }} value={inviteRole} aria-label="Peran anggota baru" onChange={(e) => setInviteRole(e.target.value)} title="viewer: hanya baca. analyst: jalankan riset dan ubah lead. admin: kelola anggota dan pengaturan.">
              <option value="viewer">viewer</option>
              <option value="analyst">analyst</option>
              {me.role === "owner" && <option value="admin">admin</option>}
            </select>
            <button className="btn ghost" disabled={busy === "/org/invite"}>Kirim undangan</button>
          </form>
        )}
      </div>

      {canManage && (
        <div className="bz-sec">
          <h4>Notifikasi pantauan</h4>
          <p className="lead" style={{ fontSize: 13 }}>Perubahan penting di wilayah yang dipantau (pesaing baru, tutup, rating turun) dikirim ke saluran ini. Kosong = email owner dan admin.</p>
          <form className="acts-row" style={{ flexWrap: "wrap" }} onSubmit={async (e) => {
            e.preventDefault();
            const body: Record<string, string> = { notify_email: notif.notify_email, telegram_chat: notif.telegram_chat, webhook_url: notif.webhook_url };
            if (notif.webhook_secret) body.webhook_secret = notif.webhook_secret;
            if (await post("/org/settings", body)) { toast("Notifikasi disimpan"); setNotif({ ...notif, webhook_secret: "" }); void load(); }
          }}>
            <input className="offerin" style={{ margin: 0, maxWidth: 260 }} type="email" aria-label="Email tujuan alert" placeholder="email tujuan alert" value={notif.notify_email} onChange={(e) => setNotif({ ...notif, notify_email: e.target.value })} />
            <input className="offerin" style={{ margin: 0, maxWidth: 200 }} aria-label="Chat id Telegram" placeholder={notif.telegram_bot ? "chat id Telegram" : "chat id Telegram (bot belum diset)"} value={notif.telegram_chat} onChange={(e) => setNotif({ ...notif, telegram_chat: e.target.value })} />
            <input className="offerin" style={{ margin: 0, maxWidth: 320 }} type="url" aria-label="Webhook URL" placeholder="webhook URL (https://...)" value={notif.webhook_url} onChange={(e) => setNotif({ ...notif, webhook_url: e.target.value })} />
            <input className="offerin" style={{ margin: 0, maxWidth: 220 }} type="password" aria-label="Webhook secret" autoComplete="off" placeholder={notif.webhook_secret_masked ? "secret: " + notif.webhook_secret_masked : "webhook secret (HMAC)"} value={notif.webhook_secret} onChange={(e) => setNotif({ ...notif, webhook_secret: e.target.value })} />
            <button className="btn ghost" disabled={busy === "/org/settings"}>Simpan</button>
            {notif.webhook_url && <button type="button" className="btn ghost" disabled={busy === "/org/webhook/test"} onClick={async () => { const j = await post<{ ok?: boolean }>("/org/webhook/test", {}); if (j) toast(j.ok ? "Webhook menjawab 2xx" : "Webhook gagal, cek URL dan log"); }}>Tes webhook</button>}
          </form>
          <p className="lead" style={{ fontSize: 12, marginTop: 6 }}>Webhook: POST JSON, header <code>X-Raqio-Event</code> (report.done, watch.alert, ping) dan <code>X-Raqio-Signature</code> = sha256 HMAC body dengan secret.</p>
        </div>
      )}

      {canManage && (
        <div className="bz-sec">
          <h4>Pengirim kampanye dan gateway WhatsApp</h4>
          <p className="lead" style={{ fontSize: 13 }}>Nama dan nomor WhatsApp pengirim tampil di pesan dan halaman audit prospek. Gateway dipakai mode otomatis WhatsApp: Fonnte, Wablas, atau API generic (POST JSON to dan message dengan Bearer token).</p>
          <form className="acts-row" style={{ flexWrap: "wrap" }} onSubmit={async (e) => {
            e.preventDefault();
            const body: Record<string, string> = { sender_name: sender.sender_name, sender_phone: sender.sender_phone, reply_to: sender.reply_to, wa_provider: sender.wa_provider, wa_gateway_url: sender.wa_gateway_url };
            if (sender.wa_gateway_token) body.wa_gateway_token = sender.wa_gateway_token;
            if (await post("/org/sender", body)) { toast("Pengirim disimpan"); setSender({ ...sender, wa_gateway_token: "" }); void load(); }
          }}>
            <input className="offerin" style={{ margin: 0, maxWidth: 200 }} aria-label="Nama pengirim" placeholder="nama pengirim" value={sender.sender_name} onChange={(e) => setSender({ ...sender, sender_name: e.target.value })} />
            <input className="offerin" style={{ margin: 0, maxWidth: 200 }} aria-label="Nomor WhatsApp pengirim" placeholder="nomor WA pengirim 62..." value={sender.sender_phone} onChange={(e) => setSender({ ...sender, sender_phone: e.target.value })} />
            <input className="offerin" style={{ margin: 0, maxWidth: 220 }} type="email" aria-label="Reply-to email" placeholder="reply-to email (opsional)" value={sender.reply_to} onChange={(e) => setSender({ ...sender, reply_to: e.target.value })} />
            <select className="offerin" style={{ margin: 0, maxWidth: 170 }} value={sender.wa_provider} onChange={(e) => setSender({ ...sender, wa_provider: e.target.value })} aria-label="Provider gateway WhatsApp">
              <option value="">tanpa gateway</option>
              <option value="fonnte">Fonnte</option>
              <option value="wablas">Wablas</option>
              <option value="generic">Generic (JSON)</option>
            </select>
            {sender.wa_provider && sender.wa_provider !== "fonnte" && <input className="offerin" style={{ margin: 0, maxWidth: 300 }} type="url" aria-label="URL gateway" placeholder="URL gateway (https://...)" value={sender.wa_gateway_url} onChange={(e) => setSender({ ...sender, wa_gateway_url: e.target.value })} />}
            {sender.wa_provider && <input className="offerin" style={{ margin: 0, maxWidth: 240 }} type="password" aria-label="Token gateway" placeholder={sender.wa_gateway_token_masked ? "token: " + sender.wa_gateway_token_masked : "token gateway"} value={sender.wa_gateway_token} onChange={(e) => setSender({ ...sender, wa_gateway_token: e.target.value })} />}
            <button className="btn ghost">Simpan</button>
          </form>
        </div>
      )}

      <div className="bz-sec">
        <h4>Ganti password</h4>
        <form className="acts-row" onSubmit={async (e) => { e.preventDefault(); if (await post("/auth/change-password", { old: oldPass, new: newPass })) { toast("Password diganti"); setOldPass(""); setNewPass(""); } }}>
          <input className="offerin" style={{ margin: 0, maxWidth: 200 }} type="password" aria-label="Password lama" autoComplete="current-password" placeholder="password lama" value={oldPass} onChange={(e) => setOldPass(e.target.value)} required />
          <input className="offerin" style={{ margin: 0, maxWidth: 200 }} type="password" aria-label="Password baru" autoComplete="new-password" placeholder="password baru" minLength={8} value={newPass} onChange={(e) => setNewPass(e.target.value)} required />
          <button className="btn ghost" disabled={busy === "/auth/change-password"}>Simpan</button>
        </form>
      </div>

      <div className="bz-sec">
        <h4>Keamanan &amp; data</h4>
        <div className="acts-row">
          <button type="button" className="btn ghost" disabled={busy === "/auth/logout-all"}
            onClick={async () => { if (await post("/auth/logout-all", {})) location.href = "/login"; }}>
            Keluar dari semua perangkat
          </button>
          <a className="btn ghost" href="/org/export" download>Unduh semua data org (JSON)</a>
        </div>
        <p className="muted-note">Keluar semua perangkat mencabut seluruh sesi login akun ini (ganti password juga otomatis mencabut sesi lain). Unduhan data mencakup laporan, prospek, pantauan, pemakaian, dan faktur — hanya admin/owner.</p>
      </div>

      <div className="bz-sec">
        <h4>Hapus akun</h4>
        <p className="muted-note">Menghapus akun ini dan, kalau kamu satu-satunya anggota, seluruh data riset tim. Tidak bisa dibatalkan.</p>
        <form className="acts-row" onSubmit={(e) => { e.preventDefault(); void deleteAccount(false); }}>
          <input className="offerin" style={{ margin: 0, maxWidth: 240 }} type="password" aria-label="Password untuk konfirmasi" autoComplete="current-password" placeholder="password untuk konfirmasi" value={delPass} onChange={(e) => setDelPass(e.target.value)} required />
          <button className="btn ghost" style={{ color: "var(--bad)" }} disabled={busy === "delete"}>Hapus akun</button>
        </form>
        {delConflict && (
          <div className="load-err" role="alert">
            <b>Kamu masih owner tim</b>
            <p>{delConflict}</p>
            <button type="button" className="btn ghost" style={{ color: "var(--bad)" }} disabled={busy === "delete"} onClick={() => void deleteAccount(true)}>Hapus dan alihkan owner</button>
          </div>
        )}
      </div>
    </div>
  );
}
