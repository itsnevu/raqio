"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "../login/login.css";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="loginp" />}>
      <Register />
    </Suspense>
  );
}

function Register() {
  const router = useRouter();
  const params = useSearchParams();
  const invite = params.get("invite") || "";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [pass, setPass] = useState("");
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [invitedOrg, setInvitedOrg] = useState("");
  const [inviteBad, setInviteBad] = useState(false);

  useEffect(() => {
    if (!invite) return;
    fetch("/auth/invite?token=" + encodeURIComponent(invite))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        setEmail(j.email);
        setInvitedOrg(j.org);
      })
      .catch(() => setInviteBad(true));
  }, [invite]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agree) {
      setErr("Centang persetujuan dulu.");
      return;
    }
    setBusy(true);
    setErr("");
    const r = await fetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, org, password: pass, invite }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(j.error || "Gagal mendaftar.");
      return;
    }
    router.replace("/market");
    router.refresh();
  };

  return (
    <div className="loginp">
      <form className="box" onSubmit={submit}>
        <h1>{invitedOrg ? "Gabung tim" : "Daftar"}</h1>
        {inviteBad && <div className="err">Tautan undangan tidak valid atau kedaluwarsa. Kamu tetap bisa mendaftar biasa.</div>}
        <p className="lead">
          {invitedOrg ? `Kamu diundang ke tim "${invitedOrg}". Buat akun untuk bergabung.` : "Paket gratis: 5 riset dan 30 cek kontak per bulan, 1 wilayah pantau."}
        </p>
        <label>
          Nama
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        {!invitedOrg && (
          <label>
            Nama bisnis atau tim
            <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="mis. Studio Kreatif Kita" autoComplete="organization" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required readOnly={!!invitedOrg} />
        </label>
        <label>
          Password
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        <label className="chk">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Saya setuju dengan{" "}
          <Link href="/privacy" target="_blank">
            kebijakan privasi dan aturan pakai
          </Link>
          , termasuk tidak memakai data ini untuk spam.
        </label>
        <button className="btn" disabled={busy}>
          {busy ? "Membuat akun…" : invitedOrg ? "Gabung" : "Buat akun"}
        </button>
        <div className="err">{err}</div>
        <div className="foot">
          Sudah punya akun? <Link href={"/login" + (invite ? "?next=" + encodeURIComponent("/settings?invite=" + invite) : "")}>Masuk</Link>
        </div>
      </form>
    </div>
  );
}
