"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "./login.css";
import { apiPost, errMsg } from "@/lib/api";
import { resetMe } from "@/lib/me";
import { safeNext } from "@/lib/safe";
import { clearOrgStorage, lsSetGlobal } from "@/lib/storage";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="loginp" />}>
      <Login />
    </Suspense>
  );
}

const MSG: Record<string, string> = {
  "reset-ok": "Password berhasil diganti. Masuk dengan password baru.",
  verified: "Email terverifikasi. Silakan masuk.",
  "verify-gagal": "Tautan verifikasi tidak valid atau kedaluwarsa.",
};

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // ?msg=verified (lama) atau ?verified=1 (tautan verifikasi email) sama-sama menampilkan pesan sukses
  const info = MSG[params.get("msg") || ""] || (params.get("verified") === "1" ? (MSG.verified ?? "") : "");

  // ?auto=1 dari middleware (AUTO_GUEST=1): langsung jadi tamu tanpa klik
  const auto = params.get("auto") === "1";
  useEffect(() => {
    if (auto) void tryGuest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const tryGuest = async () => {
    setBusy(true);
    setErr("");
    try {
      const j = await apiPost<{ expires_in_hours?: number }>("/auth/guest", {});
      clearOrgStorage();
      resetMe();
      if (j && typeof j.expires_in_hours === "number") lsSetGlobal("guest_hours", String(j.expires_in_hours));
      router.replace("/market");
      router.refresh();
    } catch (e) {
      setErr(errMsg(e, "Mode tamu tidak tersedia."));
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await apiPost("/auth/login", { email, password: pass });
      clearOrgStorage();
      resetMe();
      router.replace(safeNext(params.get("next"), location.origin));
      router.refresh();
    } catch (e2) {
      setErr(errMsg(e2, "Gagal masuk."));
      setBusy(false);
    }
  };

  if (auto && !err)
    return (
      <div className="loginp">
        <div className="box"><h1>Sebentar…</h1><p className="lead">Menyiapkan sesi tamu.</p></div>
      </div>
    );
  return (
    <div className="loginp">
      <form className="box" onSubmit={submit}>
        <h1>Masuk</h1>
        <p className="lead">Riset pasar, prospek, dan pantauan untuk tim kamu.</p>
        {info && <p className="ok" role="status">{info}</p>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Password
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="btn" disabled={busy}>
          {busy ? "Memeriksa…" : "Masuk"}
        </button>
        <div className="err" role="alert">{err}</div>
        <button type="button" className="btn ghost" disabled={busy} onClick={tryGuest} title="Org sementara dengan kuota uji coba, dihapus otomatis. Bisa disimpan jadi akun kapan saja.">
          Coba tanpa daftar
        </button>
        <div className="foot">
          Belum punya akun? <Link href="/register">Daftar</Link> · <Link href="/forgot">Lupa password</Link>
        </div>
      </form>
    </div>
  );
}
