"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost } from "@/lib/api";
import { resetMe } from "@/lib/me";
import { clearOrgStorage } from "@/lib/storage";

/** Keluar dari sesi Raqio. Sesi yang sama dipakai WA-Suite, jadi keluar di sini juga menutup akses SSO ke sana. */
export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="chooser-logout" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await apiPost("/auth/logout", {}); } catch {}
      clearOrgStorage();
      resetMe();
      router.replace("/login?next=%2Fpilih-produk");
      router.refresh();
    }}>{busy ? "Keluar…" : "Keluar"}</button>
  );
}
