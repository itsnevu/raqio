"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Brand from "@/components/Brand";
import { TourOffer, replayTour } from "@/components/Tour";
import { NoticeBar, useStickyNotice } from "./ToastContext";
import { loadDueCount } from "@/lib/cache";
import { apiPost } from "@/lib/api";
import { getMe, resetMe } from "@/lib/me";
import { isAuthPage, isBarePage } from "@/lib/routes";
import { clearOrgStorage, lsGetGlobal } from "@/lib/storage";
import type { Me } from "@/lib/api";
import VerifyBanner from "./VerifyBanner";

const NAV: [string, string][] = [
  ["/market", "Riset"],
  ["/prospects", "Prospek"],
  ["/watch", "Pantau"],
  ["/campaigns", "Kampanye"],
  ["/top", "Peringkat"],
  ["/chat", "Asisten"],
];
const MORE: [string, string, string][] = [["/settings", "Pengaturan", "Tim, kuota, dan akun"]];

export default function Nav() {
  const here = usePathname();
  const router = useRouter();
  const [due, setDue] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const isLogin = isAuthPage(here);
  const bare = isBarePage(here);

  useEffect(() => {
    if (isLogin || bare) return;
    let alive = true;
    getMe()
      .then((m) => alive && setMe(m))
      .catch(() => {});
    loadDueCount()
      .then((n) => alive && setDue(n))
      .catch(() => {});
    const close = (e: MouseEvent) => {
      const m = moreRef.current;
      if (m && !m.contains(e.target as Node)) m.open = false;
    };
    document.addEventListener("click", close);
    return () => {
      alive = false;
      document.removeEventListener("click", close);
    };
  }, [isLogin, bare, here]);

  if (bare) return null;
  if (isLogin)
    return (
      <header className="top">
        <Brand />
      </header>
    );

  const guestHours = lsGetGlobal("guest_hours");

  return (
    <>
      <header className="top">
        <Brand href="/market" />
        <nav aria-label="Navigasi utama">
          {NAV.map(([h, l]) => (
            <Link key={h} href={h} className={(here === h ? "on" : "") + (h === "/chat" ? " hide-m" : "")} aria-current={here === h ? "page" : undefined}>
              {l}
              {h === "/prospects" && due > 0 && (
                <span className="badge-n" aria-label={due + " follow up jatuh tempo"} title={due + " follow up jatuh tempo"}>
                  {due}
                </span>
              )}
            </Link>
          ))}
          <details className="more" ref={moreRef}>
            <summary>Lanjutan</summary>
            <div className="menu">
              {MORE.map(([h, l, d]) => (
                <a key={h} href={h}>
                  {l}
                  <small>{d}</small>
                </a>
              ))}
              <button
                type="button"
                className="tour-btn"
                onClick={() => {
                  if (moreRef.current) moreRef.current.open = false;
                  replayTour();
                }}
              >
                Panduan<small>Putar ulang tur halaman ini</small>
              </button>
              <button
                type="button"
                className="tour-btn"
                disabled={leaving}
                onClick={async () => {
                  setLeaving(true);
                  try {
                    await apiPost("/auth/logout", {});
                  } catch {}
                  clearOrgStorage();
                  resetMe();
                  router.replace("/login");
                  router.refresh();
                }}
              >
                Keluar<small>Akhiri sesi di browser ini</small>
              </button>
            </div>
          </details>
        </nav>
      </header>
      <GuestNotice me={me} guestHours={guestHours} />
      {me && !me.guest && me.plan !== "free" && me.plan_until && (() => {
        // peringatan masa paket: tampil 7 hari terakhir supaya downgrade tidak pernah mengejutkan
        const sisa = Math.ceil((new Date(me.plan_until).getTime() - Date.now()) / 86400000);
        return sisa <= 7 ? (
          <div className="guest-bar" role="status">
            Paket {me.plan} berakhir {sisa <= 0 ? "hari ini" : `dalam ${sisa} hari`}, setelah itu kembali ke Free.{" "}
            <Link href="/settings">Perpanjang di Pengaturan</Link>
          </div>
        ) : null;
      })()}
      <VerifyBanner me={me} />
      <TourOffer />
      <NoticeBar />
    </>
  );
}

const GUEST_DISMISS_KEY = "raqio:guest-dismissed";
/** Info mode tamu di bar notifikasi bersama; × menutupnya untuk satu sesi tab. */
function GuestNotice({ me, guestHours }: { me: Me | null; guestHours: string | null }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(GUEST_DISMISS_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  useStickyNotice(
    !!me?.guest && !hidden,
    {
      id: "guest",
      kind: "info",
      text: (
        <>
          Mode tamu: {me?.limits?.runs ?? "beberapa"} riset, data dihapus otomatis{guestHours ? ` setelah ${guestHours} jam` : ""}.{" "}
          <Link href="/register?claim=1">Simpan jadi akun</Link> supaya riset dan prospek tetap tersimpan.
        </>
      ),
      onClose: () => {
        try {
          sessionStorage.setItem(GUEST_DISMISS_KEY, "1");
        } catch {}
        setHidden(true);
      },
    },
    [me?.limits?.runs, guestHours],
  );
  return null;
}
