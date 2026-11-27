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
import { safeHttpUrl } from "@/lib/safe";
import { clearOrgStorage, lsGetGlobal } from "@/lib/storage";
import type { Me } from "@/lib/api";
import VerifyBanner from "./VerifyBanner";

const NAV: [string, string, string][] = [
  ["/market", "Riset", "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 4 4"],
  ["/prospects", "Prospek", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"],
  ["/watch", "Pantau", "M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Zm12 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
  ["/campaigns", "Kampanye", "M4 10v5h4l9 4V6l-9 4H4Zm4 5 2 5"],
  ["/top", "Peringkat", "M4 20h16M7 16v-4m5 4V5m5 11V9"],
  ["/chat", "Asisten", "M5 5h14v11H9l-4 4V5Zm4 5h6"],
];
const MORE: [string, string, string][] = [["/settings", "Pengaturan", "Tim, kuota, dan akun"]];
// WA-Suite (Customer Service Agent) memakai sesi Raqio yang sama (SSO). Tautan hanya http(s).
const WASUITE = safeHttpUrl(process.env.NEXT_PUBLIC_WASUITE_APP_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:3001" : undefined));

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
      <header className="top scraping-sidebar">
        <Brand href="/market" />
        <nav aria-label="Navigasi utama">
          <div className="scraping-nav-list">
          {NAV.map(([h, l, icon]) => {
            const active = here === h || here.startsWith(h + "/");
            return (
            <Link key={h} href={h} className={active ? "on" : undefined} aria-current={active ? "page" : undefined}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d={icon}/></svg>
              {l}
              {h === "/prospects" && due > 0 && (
                <span className="badge-n" aria-label={due + " follow up jatuh tempo"} title={due + " follow up jatuh tempo"}>
                  {due}
                </span>
              )}
            </Link>
            );
          })}
          {/* satu login untuk keempat agen: pindah ke peluncur agen atau langsung ke WA-Suite (Customer Service Agent) */}
          <span className="nav-sep" aria-hidden="true" />
          <Link href="/pilih-produk">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>
            Semua agen
          </Link>
          {WASUITE && !me?.guest && (
            <a href={WASUITE}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5h14v11H9l-4 4V5Zm4 5h6"/></svg>
              Customer Service
              <span className="nav-ext" aria-hidden="true">↗</span>
            </a>
          )}
          </div>
          <details className="more" ref={moreRef}>
            <summary><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0"/></svg>Akun</summary>
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
