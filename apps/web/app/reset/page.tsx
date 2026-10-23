"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "../login/login.css";
import { apiPost, errMsg } from "@/lib/api";

export default function ResetPage() {
  return (
    <Suspense fallback={<div className="loginp" />}>
      <Reset />
    </Suspense>
  );
}

function Reset() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setErr("Tautan reset tidak lengkap. Minta tautan baru.");
      return;
    }
    if (pass !== pass2) {
      setErr("Password tidak sama.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await apiPost("/auth/reset", { token, password: pass });
      router.replace("/login?msg=reset-ok");
    } catch (e2) {
      setErr(errMsg(e2, "Gagal."));
      setBusy(false);
    }
  };
  return (
    <div className="loginp">
      <form className="box" onSubmit={submit}>
        <h1>Password baru</h1>
        <p className="lead">Semua sesi lama akan keluar setelah password diganti.</p>
        {!token && <div className="err" role="alert">Tautan reset tidak lengkap atau sudah dipakai.</div>}
        <label>
          Password baru
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        <label>
          Ulangi password
          <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        <button className="btn" disabled={busy || !token}>{busy ? "Menyimpan…" : "Simpan"}</button>
        <div className="err" role="alert">{err}</div>
        <div className="foot">
          <Link href="/forgot">Minta tautan baru</Link>
        </div>
      </form>
    </div>
  );
}
