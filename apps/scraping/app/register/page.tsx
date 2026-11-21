"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "../login/login.css";
import { apiGet, apiPost, errMsg, type Plan } from "@/lib/api";
import { resetMe } from "@/lib/me";
import { clearOrgStorage } from "@/lib/storage";

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
  const claim = params.get("claim") === "1"; // tamu menyimpan akunnya: data org tetap
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [pass, setPass] = useState("");
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [invitedOrg, setInvitedOrg] = useState("");
  const [inviteBad, setInviteBad] = useState(false);
  const [free, setFree] = useState<Plan | null>(null);
  const [info, setInfo] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    apiGet<{ plans?: Plan[] }>("/billing/plans", { signal: ac.signal })
      .then((j) => setFree((j.plans || []).find((p) => p.name === "free") || null))
      .catch(() => {});
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!invite) return;
    const ac = new AbortController();
    apiGet<{ email: string; org: string }>("/auth/invite?token=" + encodeURIComponent(invite), { signal: ac.signal })
      .then((j) => {
        setEmail(j.email);
        setInvitedOrg(j.org);
      })
      .catch(() => {
        if (!ac.signal.aborted) setInviteBad(true);
      });
    return () => ac.abort();
  }, [invite]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agree) {
      setErr("Centang persetujuan dulu.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const j = await apiPost<{ ok?: boolean; existing?: boolean }>(claim ? "/auth/claim-guest" : "/auth/register", { email, name, org, password: pass, invite });
      if (j && j.existing) {
        // server tidak membuat sesi baru: email sudah terdaftar
        setInfo("Akun dengan email ini sudah ada, cek email atau pakai lupa password.");
        setBusy(false);
        return;
      }
      if (!claim) clearOrgStorage();
      resetMe();
      router.replace("/market");
      router.refresh();
    } catch (e2) {
      setErr(errMsg(e2, "Gagal mendaftar."));
      setBusy(false);
    }
  };

  const freeText = free
    ? `Paket gratis: ${free.runs} riset dan ${free.details} cek kontak per bulan, ${free.watches} wilayah pantau.`
    : "Paket gratis dengan kuota riset dan cek kontak bulanan.";

  return (
    <div className="loginp">
      <form className="box" onSubmit={submit}>
        <h1>{claim ? "Simpan akun tamu" : invitedOrg ? "Gabung tim" : "Daftar"}</h1>
        {claim && <div className="lead">Riset dan prospek dari sesi tamu ikut tersimpan. Paket jadi gratis, bisa upgrade kapan saja.</div>}
        {inviteBad && <div className="err" role="alert">Tautan undangan tidak valid atau kedaluwarsa. Kamu tetap bisa mendaftar biasa.</div>}
        <p className="lead">{invitedOrg ? `Kamu diundang ke tim "${invitedOrg}". Buat akun untuk bergabung.` : freeText}</p>
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
          <Link href="/terms" target="_blank" rel="noopener noreferrer">
            syarat layanan
          </Link>{" "}
          dan{" "}
          <Link href="/privacy" target="_blank" rel="noopener noreferrer">
            kebijakan privasi
          </Link>
          , termasuk tidak memakai data ini untuk spam.
        </label>
        <button className="btn" disabled={busy}>
          {busy ? "Membuat akun…" : invitedOrg ? "Gabung" : "Buat akun"}
        </button>
        <div className="err" role="alert">{err}</div>
        {info && <p className="ok" role="status">{info} <Link href="/forgot">Lupa password</Link></p>}
        <div className="foot">
          Sudah punya akun? <Link href={"/login" + (invite ? "?next=" + encodeURIComponent("/settings?invite=" + invite) : "")}>Masuk</Link>
        </div>
      </form>
    </div>
  );
}
