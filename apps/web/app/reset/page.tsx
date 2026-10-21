"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "../login/login.css";

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
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass !== pass2) {
      setErr("Password tidak sama.");
      return;
    }
    const r = await fetch("/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: params.get("token") || "", password: pass }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(j.error || "Gagal.");
      return;
    }
    router.replace("/login?msg=reset-ok");
  };
  return (
    <div className="loginp">
      <form className="box" onSubmit={submit}>
        <h1>Password baru</h1>
        <p className="lead">Semua sesi lama akan keluar setelah password diganti.</p>
        <label>
          Password baru
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" minLength={8} required autoFocus />
        </label>
        <label>
          Ulangi password
          <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        <button className="btn">Simpan</button>
        <div className="err">{err}</div>
        <div className="foot">
          <Link href="/forgot">Minta tautan baru</Link>
        </div>
      </form>
    </div>
  );
}
