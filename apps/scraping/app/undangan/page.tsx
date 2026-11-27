"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "../login/login.css";
import AccessLayout from "../login/AccessLayout";
import { ArrowBox } from "@/components/agents";
import { ApiError, apiPost } from "@/lib/api";
import { useAccessText } from "@/lib/access-lang";

/**
 * Form kode undangan (akses awal Raqio). Kode hanya dicek di sini; jatahnya baru terpakai saat akun dibuat
 * di /register?code=…, jadi salah ketik email di langkah berikutnya tidak menghabiskan kode.
 * Tautan /undangan?code=RAQIO-… mengisi kode otomatis.
 */
export default function InvitePage() {
  return (
    <Suspense fallback={<div className="loginp" />}>
      <Invite />
    </Suspense>
  );
}

function Invite() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useAccessText().invite;
  const [code, setCode] = useState(params.get("code") || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const j = await apiPost<{ ok: boolean; code: string }>("/auth/invite-code", { code });
      router.push("/register?code=" + encodeURIComponent(j.code));
    } catch (e2) {
      setErr(e2 instanceof ApiError && e2.code === "invite_code_invalid" ? t.invalid
        : e2 instanceof ApiError && e2.status === 429 ? e2.message : t.fail);
      setBusy(false);
    }
  };

  return (
    <AccessLayout>
      <form className="box" onSubmit={submit}>
        <h1>{t.title}</h1>
        <p className="lead">{t.lead}</p>
        <label>
          {t.label}
          <input className="invite-code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="RAQIO-XXXX-XXXX-XXXX" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} required />
        </label>
        <button className="btn" disabled={busy || !code.trim()}>
          <span>{busy ? t.checking : t.submit}</span>
          <ArrowBox />
        </button>
        <div className="err" role="alert">{err}</div>
        <div className="foot">
          {t.noCode}<br />
          <Link href="/login">{t.back}</Link>
        </div>
      </form>
    </AccessLayout>
  );
}
