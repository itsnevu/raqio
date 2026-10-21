"use client";
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
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, pass }) });
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
        <p className="lead">Riset pasar, prospek, dan pantauan hanya untuk akun yang diizinkan.</p>
        <label>
          Username
          <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoFocus required />
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
          Akun diatur lewat <code>AUTH_USER</code> dan <code>AUTH_PASS</code> di <code>apps/web/.env.local</code>.
        </div>
      </form>
    </div>
  );
}
