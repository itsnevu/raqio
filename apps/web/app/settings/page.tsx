"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "../login/login.css";
import { useShell } from "@/components/Shell";

type Org = {
  name: string;
  plan: string;
  members: { email: string; role: string }[];
  usage: Record<string, number>;
  limits: { runs: number; details: number; watches: number; areas: number; members: number };
};
type Me = { email: string; role: string; verified: boolean };
type Plan = { name: string; price: number; runs: number; details: number; watches: number; members: number };
type Invoice = { id: number; provider: string; plan: string; amount: number; status: string; url: string; created: string };

const rp = (n: number) => "Rp" + n.toLocaleString("id-ID");

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="wrap" />}>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const { toast } = useShell();
  const router = useRouter();
  const params = useSearchParams();
  const [org, setOrg] = useState<Org | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [provider, setProvider] = useState("manual");
  const [billing, setBilling] = useState<{ invoices: Invoice[]; plan_until: string | null } | null>(null);
  const [invite, setInvite] = useState("");
  const [delPass, setDelPass] = useState("");
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");

  const load = useCallback(() => {
    fetch("/org").then((r) => r.json()).then(setOrg);
    fetch("/auth/me").then((r) => r.json()).then(setMe);
    fetch("/billing/plans").then((r) => r.json()).then((j) => { setPlans(j.plans); setProvider(j.provider); });
    fetch("/billing/invoices").then((r) => r.json()).then(setBilling);
  }, []);
  useEffect(load, [load]);

  const post = useCallback(async (path: string, body: unknown) => {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) toast(j.error || "Gagal");
    return r.ok ? j : null;
  }, [toast]);

  // datang dari tautan undangan sambil sudah login
  useEffect(() => {
    const tok = params.get("invite");
    if (!tok) return;
    post("/auth/accept-invite", { token: tok }).then((j) => {
      if (j) {
        toast("Bergabung ke tim");
        router.replace("/settings");
        load();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  useEffect(() => {
    if (params.get("paid") === "1") toast("Pembayaran diterima, paket aktif dalam beberapa detik");
  }, [params, toast]);

  if (!org || !me) return <div className="wrap" />;

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <h1>Pengaturan</h1>
      <p className="lead">
        {org.name} · paket <b>{org.plan}</b> · masuk sebagai {me.email} ({me.role})
      </p>

      {!me.verified && (
        <div className="goalwarn" style={{ display: "block", margin: "12px 0" }}>
          Email kamu belum diverifikasi. Cek kotak masuk, atau{" "}
          <button onClick={async () => (await post("/auth/resend-verify", {})) && toast("Email verifikasi dikirim ulang")}>kirim ulang</button>.
        </div>
      )}

      <div className="key3" style={{ marginTop: 24 }}>
        <div><small>Riset bulan ini</small><p>{org.usage.market_run || 0} dari {org.limits.runs}</p></div>
        <div><small>Cek kontak bulan ini</small><p>{org.usage.market_detail || 0} dari {org.limits.details}</p></div>
        <div><small>Wilayah pantau</small><p>maks {org.limits.watches}</p></div>
      </div>
      <p className="muted-note">
        Kuota direset tiap awal bulan.
        {billing?.plan_until && <> Paket {org.plan} aktif sampai {new Date(billing.plan_until).toLocaleDateString("id-ID", { dateStyle: "medium" })}.</>}
      </p>

      <div className="bz-sec" style={{ marginTop: 24 }}>
        <h4>Paket</h4>
        <div className="reasons" style={{ marginBottom: 0 }}>
          {plans.map((p) => (
            <div className="reason" key={p.name} style={p.name === org.plan ? { borderColor: "var(--good)" } : undefined}>
              <div className="big">{p.name}<small>{p.price ? rp(p.price) + "/bln" : "gratis"}</small></div>
              <p>{p.runs} riset, {p.details} cek kontak, {p.watches} pantau, {p.members} anggota</p>
              {p.price > 0 && p.name !== org.plan && me.role === "owner" && (
                <button className="btn ghost" style={{ marginTop: 10 }} onClick={async () => {
                  const j = await post("/billing/checkout", { plan: p.name });
                  if (!j) return;
                  if (j.url) location.href = j.url;
                  else { toast(j.message); load(); }
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
                {i.url && i.status === "pending" && <> · <a href={i.url} target="_blank">bayar</a></>}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bz-sec">
        <h4>Anggota tim ({org.members.length} dari {org.limits.members})</h4>
        <div className="kv">
          {org.members.map((m) => (
            <span key={m.email} style={{ gridColumn: "1 / -1" }}>
              {m.email} <span className="badge">{m.role}</span>
              {me.role === "owner" && m.email !== me.email && (
                <button className="mini" style={{ marginLeft: 8 }} onClick={async () => (await post("/org/remove-member", { email: m.email })) && load()}>keluarkan</button>
              )}
            </span>
          ))}
        </div>
        {me.role === "owner" && (
          <form className="acts-row" onSubmit={async (e) => { e.preventDefault(); if (await post("/org/invite", { email: invite })) { toast("Undangan dikirim ke " + invite); setInvite(""); } }}>
            <input className="offerin" style={{ margin: 0, maxWidth: 320 }} type="email" placeholder="email yang diundang" value={invite} onChange={(e) => setInvite(e.target.value)} required />
            <button className="btn ghost">Kirim undangan</button>
          </form>
        )}
      </div>

      <div className="bz-sec">
        <h4>Ganti password</h4>
        <form className="acts-row" onSubmit={async (e) => { e.preventDefault(); if (await post("/auth/change-password", { old: oldPass, new: newPass })) { toast("Password diganti"); setOldPass(""); setNewPass(""); } }}>
          <input className="offerin" style={{ margin: 0, maxWidth: 200 }} type="password" placeholder="password lama" value={oldPass} onChange={(e) => setOldPass(e.target.value)} required />
          <input className="offerin" style={{ margin: 0, maxWidth: 200 }} type="password" placeholder="password baru" minLength={8} value={newPass} onChange={(e) => setNewPass(e.target.value)} required />
          <button className="btn ghost">Simpan</button>
        </form>
      </div>

      <div className="bz-sec">
        <h4>Hapus akun</h4>
        <p className="muted-note">Menghapus akun ini dan, kalau kamu satu-satunya anggota, seluruh data riset tim. Tidak bisa dibatalkan.</p>
        <form className="acts-row" onSubmit={async (e) => { e.preventDefault(); if (!confirm("Yakin hapus akun dan semua datanya?")) return; if (await post("/auth/delete-account", { password: delPass })) router.replace("/login"); }}>
          <input className="offerin" style={{ margin: 0, maxWidth: 240 }} type="password" placeholder="password untuk konfirmasi" value={delPass} onChange={(e) => setDelPass(e.target.value)} required />
          <button className="btn ghost" style={{ color: "var(--bad)" }}>Hapus akun</button>
        </form>
      </div>
    </div>
  );
}
