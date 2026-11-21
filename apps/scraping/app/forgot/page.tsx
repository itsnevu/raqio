"use client";
import Link from "next/link";
import { useState } from "react";
import "../login/login.css";
import { apiPost, errMsg } from "@/lib/api";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await apiPost("/auth/forgot", { email });
      setDone(true);
    } catch (e2) {
      setErr(errMsg(e2, "Gagal."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="loginp">
      <form className="box" onSubmit={submit}>
        <h1>Lupa password</h1>
        {done ? (
          <p className="lead" role="status">Kalau email itu terdaftar, tautan untuk membuat password baru sudah dikirim. Berlaku 1 jam.</p>
        ) : (
          <>
            <p className="lead">Masukkan email akunmu. Kami kirim tautan untuk membuat password baru.</p>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </label>
            <button className="btn" disabled={busy}>{busy ? "Mengirim…" : "Kirim tautan"}</button>
            <div className="err" role="alert">{err}</div>
          </>
        )}
        <div className="foot">
          <Link href="/login">Kembali ke masuk</Link>
        </div>
      </form>
    </div>
  );
}
