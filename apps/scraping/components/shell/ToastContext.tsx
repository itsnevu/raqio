"use client";
// Satu tempat notifikasi untuk seluruh aplikasi: bar di bawah header (NoticeBar). Semua pesan lewat sini,
// dari info mode tamu, pengingat verifikasi, tawaran panduan, pesan singkat (toast), sampai error runtime.
// Tiap pesan bisa ditutup dengan ×; pesan singkat hilang sendiri. Terpisah dari ShellContext supaya pesan
// tidak merender ulang semua konsumen Shell.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type NoticeKind = "info" | "ok" | "warn" | "error";
export type NoticeAction = { label: string; onClick: () => void | Promise<void>; primary?: boolean };
export type Notice = {
  id: string;
  kind: NoticeKind;
  text: ReactNode;
  actions?: NoticeAction[];
  /** ms sebelum hilang sendiri; kosong = menetap sampai ditutup */
  ttl?: number;
  /** dipanggil saat pengguna menekan × (bukan saat dismiss() dari kode) */
  onClose?: () => void;
};
type NoticeIn = Omit<Notice, "id" | "kind"> & { id?: string; kind?: NoticeKind };

type Api = {
  toast: (msg: string, kind?: NoticeKind) => void;
  notify: (n: NoticeIn) => string;
  dismiss: (id: string) => void;
};
const Ctx = createContext<Api | null>(null);
const ListCtx = createContext<{ items: Notice[]; close: (n: Notice) => void } | null>(null);

export const useToast = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast di luar ToastProvider");
  return c.toast;
};
/** API notifikasi penuh; di luar provider (mis. tes komponen kecil) mengembalikan no-op supaya komponen tetap bisa dirender. */
export const useNotice = (): Api => {
  const c = useContext(Ctx);
  return c ?? NOOP;
};
const NOOP: Api = { toast: () => {}, notify: () => "", dismiss: () => {} };

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notice[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setItems((xs) => (xs.some((x) => x.id === id) ? xs.filter((x) => x.id !== id) : xs));
  }, []);

  const notify = useCallback(
    (n: NoticeIn) => {
      const id = n.id || `n${++seq}`;
      const full: Notice = { kind: "info", ...n, id };
      setItems((xs) => [...xs.filter((x) => x.id !== id), full]);
      const old = timers.current.get(id);
      if (old) clearTimeout(old);
      if (full.ttl) timers.current.set(id, setTimeout(() => dismiss(id), full.ttl));
      return id;
    },
    [dismiss],
  );

  const toast = useCallback((msg: string, kind: NoticeKind = "ok") => void notify({ id: "toast", kind, text: msg, ttl: 4000 }), [notify]);

  // Error runtime yang lolos (exception tak tertangkap, promise ditolak) juga tampil di bar yang sama.
  useEffect(() => {
    const show = (msg: string) => notify({ id: "runtime", kind: "error", text: "Terjadi kesalahan: " + msg, ttl: 10000 });
    const onErr = (e: ErrorEvent) => {
      if (e.message) show(e.message);
    };
    const onRej = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const msg = r instanceof Error ? r.message : typeof r === "string" ? r : "";
      if (msg && !/abort/i.test(msg)) show(msg);
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, [notify]);

  const close = useCallback(
    (n: Notice) => {
      n.onClose?.();
      dismiss(n.id);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ toast, notify, dismiss }), [toast, notify, dismiss]);
  const list = useMemo(() => ({ items, close }), [items, close]);
  return (
    <Ctx.Provider value={api}>
      <ListCtx.Provider value={list}>{children}</ListCtx.Provider>
    </Ctx.Provider>
  );
}

/** Bar notifikasi; dirender sekali di Nav, tepat di bawah header. */
export function NoticeBar() {
  const l = useContext(ListCtx);
  if (!l || l.items.length === 0) return null;
  return (
    <div className="nbar">
      {l.items.map((n) => (
        <div key={n.id} className={"notice " + n.kind} data-id={n.id} role={n.kind === "error" ? "alert" : "status"} aria-live="polite">
          <span className="nt">{n.text}</span>
          {n.actions?.map((a) => (
            <button key={a.label} type="button" className={"mini" + (a.primary ? " primary" : "")} onClick={() => void a.onClick()}>
              {a.label}
            </button>
          ))}
          <button type="button" className="nx" aria-label="Tutup notifikasi" onClick={() => l.close(n)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/** Daftarkan satu notifikasi selama komponen hidup; hilang saat komponen dilepas. `when` false = tidak didaftarkan. */
export function useStickyNotice(when: boolean, n: NoticeIn & { id: string }, deps: unknown[] = []) {
  const { notify, dismiss } = useNotice();
  const ref = useRef(n);
  ref.current = n;
  useEffect(() => {
    if (!when) return;
    notify(ref.current);
    return () => dismiss(ref.current.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when, notify, dismiss, ...deps]);
}
