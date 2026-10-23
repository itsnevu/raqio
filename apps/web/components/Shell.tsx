"use client";
// Penyedia konteks bersama semua halaman: navigasi, asisten melayang, panel detail bisnis, notifikasi.
// Toast ada di ToastContext terpisah. Objek konteks di-useMemo supaya konsumen tidak render ulang tanpa perlu.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import ErrorBoundary from "./ErrorBoundary";
import BusinessPanel, { type OpenCtx } from "./shell/BusinessPanel";
import Drawer from "./shell/Drawer";
import Fab from "./shell/Fab";
import Nav from "./shell/Nav";
import { ToastProvider } from "./shell/ToastContext";
import { type Biz, clean } from "@/lib/biz";

export { useToast } from "./shell/ToastContext";
export type { OpenCtx };

export type DrawerOpts = { frame?: boolean; kind?: string };
type ShellApi = {
  notify: (title: string, body: string) => void;
  askNotify: () => void;
  openDrawer: (title: string, body: ReactNode, opts?: DrawerOpts) => void;
  closeDrawer: () => void;
  openBusiness: (p: Biz, ctx?: OpenCtx) => void;
};

const Ctx = createContext<ShellApi | null>(null);
export const useShell = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useShell di luar ShellProvider");
  return c;
};

type DrawerState = { title: string; body: ReactNode; frame: boolean; kind: string; on: boolean };

function ShellInner({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  const askNotify = useCallback(() => {
    try {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    } catch {}
  }, []);
  const notify = useCallback((title: string, body: string) => {
    try {
      if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification(title, { body });
    } catch {}
    const t = document.title;
    if (document.hidden) {
      document.title = "● " + title;
      addEventListener("focus", () => (document.title = t), { once: true });
    }
  }, []);
  const closeDrawer = useCallback(() => setDrawer((d) => (d ? { ...d, on: false } : d)), []);
  const openDrawer = useCallback((title: string, body: ReactNode, opts: DrawerOpts = {}) => {
    setDrawer({ title, body, frame: !!opts.frame, kind: opts.kind || "", on: false });
    requestAnimationFrame(() => setDrawer((d) => (d ? { ...d, on: true } : d)));
  }, []);
  const openBusiness = useCallback(
    (p: Biz, ctx: OpenCtx = {}) => {
      const reopen = (q: Biz) => openBusiness(q, ctx);
      openDrawer(
        clean(p.name),
        <ErrorBoundary label="Panel bisnis">
          <BusinessPanel p={p} ctx={ctx} reopen={reopen} />
        </ErrorBoundary>,
      );
    },
    [openDrawer],
  );

  const api = useMemo<ShellApi>(() => ({ notify, askNotify, openDrawer, closeDrawer, openBusiness }), [notify, askNotify, openDrawer, closeDrawer, openBusiness]);

  return (
    <Ctx.Provider value={api}>
      <Nav />
      {children}
      <Fab />
      <Drawer open={!!drawer?.on} title={drawer?.title || ""} body={drawer?.body ?? null} frame={!!drawer?.frame} kind={drawer?.kind} onClose={closeDrawer} />
    </Ctx.Provider>
  );
}

export function ShellProvider({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ShellInner>{children}</ShellInner>
    </ToastProvider>
  );
}
