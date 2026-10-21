"use client";
import Link from "next/link";
import { useState } from "react";
import "../login/login.css";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch("/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    if (!r.ok) {
      setErr((await r.json().catch(() => ({}))).error || "Gagal.");
      return;
    }
    setDone(true);
  };
  return (
    <div className="loginp">
      <form className="box" onSubmit={submit}>
        <h1>Lupa password</h1>
        {done ? (
          <p className="lead">Kalau email itu terdaftar, tautan untuk membuat password baru sudah dikirim. Berlaku 1 jam.</p>
        ) : (
          <>
            <p className="lead">Masukkan email akunmu. Kami kirim tautan untuk membuat password baru.</p>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
            </label>
            <button className="btn">Kirim tautan</button>
            <div className="err">{err}</div>
          </>
        )}
        <div className="foot">
          <Link href="/login">Kembali ke masuk</Link>
        </div>
      </form>
    </div>
  );
}
