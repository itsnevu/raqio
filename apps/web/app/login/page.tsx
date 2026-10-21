"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "./login.css";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="loginp" />}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pass }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(j.error || "Gagal masuk.");
      return;
    }
    const next = params.get("next") || "/market";
    router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/market");
    router.refresh();
  };

  return (
    <div className="loginp">
      <form className="box" onSubmit={submit}>
        <h1>Masuk</h1>
        <p className="lead">Riset pasar, prospek, dan pantauan untuk tim kamu.</p>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label>
          Password
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="btn" disabled={busy}>
          {busy ? "Memeriksa…" : "Masuk"}
        </button>
        <div className="err">{err}</div>
        <div className="foot">
          Belum punya akun? <Link href="/register">Daftar</Link> · <Link href="/forgot">Lupa password</Link>
        </div>
      </form>
    </div>
  );
}
