"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "./login.css";
import AccessLayout from "./AccessLayout";
import { ArrowBox } from "@/components/agents";
import { ApiError, apiGet, apiPost, errMsg } from "@/lib/api";
import { resetMe } from "@/lib/me";
import { safeNext } from "@/lib/safe";
import { clearOrgStorage, lsSetGlobal } from "@/lib/storage";
import { useAccessText } from "@/lib/access-lang";

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
  const t = useAccessText().login;
  const MSG = t.msg;
  const signup=useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // akses lewat undangan (API INVITE_ONLY): tombol tamu diganti form kode, email asing dapat pesan invite-only
  const [inviteOnly, setInviteOnly] = useState<boolean | null>(null);
  const [notInvited, setNotInvited] = useState(false);
  useEffect(() => {
    const ac = new AbortController();
    apiGet<{ invite_only?: boolean }>("/auth/access", { signal: ac.signal })
      .then((j) => setInviteOnly(j.invite_only === true))
      .catch(() => {});
    return () => ac.abort();
  }, []);
  const invites = inviteOnly !== false; // sebelum jawaban datang, anggap akses lewat undangan (kebijakan bawaan)
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
      setErr(errMsg(e, t.guestFail));
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setNotInvited(false);
    try {
      await apiPost("/auth/login", { email, password: pass });
      clearOrgStorage();
      resetMe();
      // tanpa ?next, masuk ke peluncur agen: dari sana pilih Riset/SEO/Marketing (di sini) atau Customer Service (WA-Suite)
      router.replace(safeNext(params.get("next"), location.origin, "/pilih-produk"));
      router.refresh();
    } catch (e2) {
      if (e2 instanceof ApiError && e2.code === "invite_only") setNotInvited(true); // email belum diundang (dicatat API)
      else setErr(errMsg(e2, t.loginFail));
      setBusy(false);
    }
  };

  if (auto && !err)
    return (
      <div className="loginp">
        <div className="box"><h1>{t.wait}</h1><p className="lead">{t.preparing}</p></div>
      </div>
    );
  return (
    <AccessLayout>
      <form className="box" onSubmit={submit}>
        <h1>{t.title}</h1>
        <p className="lead">{t.lead}</p>
        {info && <p className="ok" role="status">{info}</p>}
        <label>
          {t.email}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <div className="access-field-heading"><label htmlFor="login-password">{t.password}</label><Link href="/forgot">{t.forgot}</Link></div>
        <div className="password-row">
          <input id="login-password" type={showPassword ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required />
          <button type="button" onClick={() => setShowPassword(visible => !visible)} aria-controls="login-password">{showPassword ? t.hide : t.show}</button>
        </div>
        <button className="btn" disabled={busy}>
          <span>{busy ? t.checking : t.submit}</span>
          <ArrowBox />
        </button>
        <div className="err" role="alert">{err}</div>
        {notInvited && (
          <div className="invite-notice" role="alert">
            <strong>{t.inviteOnlyTitle}</strong>
            <p>{t.inviteOnlyBody}</p>
            <Link href="/undangan">{t.haveCode}</Link>
          </div>
        )}
        {invites ? (
          <Link href="/undangan" className="btn ghost">{t.useCode}</Link>
        ) : (
          <button type="button" className="btn ghost" disabled={busy} onClick={tryGuest} title={t.guestTitle}>
            {t.guest}
          </button>
        )}
        <div className="foot">
          {t.noAccount} {invites
            ? <Link href="/undangan">{t.useCode}</Link>
            : <button type="button" className="linkish" onClick={()=>signup.current?.showModal()}>{t.register}</button>}
        </div>
      </form>
      <dialog ref={signup} className="access-dialog" aria-labelledby="signup-title">
        <div className="access-dialog-head">
          <h2 id="signup-title">{t.dialogTitle}</h2>
          <button type="button" className="linkish" aria-label={t.close} onClick={()=>signup.current?.close()}>✕</button>
        </div>
        <p>{t.dialogBody}</p>
        <Link href="/register" className="btn"><span>{t.create}</span><ArrowBox /></Link>
      </dialog>
    </AccessLayout>
  );
}
