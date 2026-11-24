"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "./login.css";
import AccessLayout from "./AccessLayout";
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
  const signup=useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <AccessLayout marketBackdrop>
      <form className="box" onSubmit={submit}>
        <h1>Masuk</h1>
        <p className="lead">Riset pasar, prospek, dan pantauan untuk tim kamu.</p>
        {info && <p className="ok" role="status">{info}</p>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <div className="access-field-heading"><label htmlFor="login-password">Password</label><Link href="/forgot">Lupa password?</Link></div>
        <div className="password-row">
          <input id="login-password" type={showPassword ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required />
          <button type="button" onClick={() => setShowPassword(visible => !visible)} aria-controls="login-password">{showPassword ? "Sembunyikan" : "Tampilkan"}</button>
        </div>
        <button className="btn" disabled={busy}>
          {busy ? "Memeriksa…" : "Masuk"}
        </button>
        <div className="err" role="alert">{err}</div>
        <button type="button" className="btn ghost" disabled={busy} onClick={tryGuest} title="Org sementara dengan kuota uji coba, dihapus otomatis. Bisa disimpan jadi akun kapan saja.">
          Coba tanpa daftar
        </button>
        <div className="foot">
          Belum punya akun? <button type="button" className="linkish" onClick={()=>signup.current?.showModal()}>Daftar</button>
        </div>
      </form>
      <dialog ref={signup} className="access-dialog" aria-labelledby="signup-title">
        <div className="access-dialog-head">
          <h2 id="signup-title">Mulai dengan RAQIO</h2>
          <button type="button" className="linkish" aria-label="Tutup" onClick={()=>signup.current?.close()}>✕</button>
        </div>
        <p>Buat workspace baru untuk tim Anda, atau buka tautan undangan dari admin untuk bergabung.</p>
        <Link href="/register" className="btn">Buat akun</Link>
      </dialog>
    </AccessLayout>
  );
}
