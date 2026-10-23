"use client";
// Panel samping: role dialog, fokus terkunci di dalam saat terbuka, fokus dikembalikan saat ditutup,
// isi dilepas (unmount) setelah animasi tutup. `frame` = isi mengatur tata letaknya sendiri (tanpa padding .db),
// `kind` = kelas tambahan untuk variasi lebar (mis. "chat").
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type Props = { open: boolean; title: string; body: ReactNode; frame?: boolean; kind?: string; onClose: () => void };

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

export default function Drawer({ open, title, body, frame = false, kind = "", onClose }: Props) {
  const ref = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(open);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      setMounted(true);
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const t = setTimeout(() => closeBtn.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setMounted(false), 220);
    const back = returnTo.current;
    returnTo.current = null;
    if (back && document.contains(back)) back.focus();
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el.tagName === "IFRAME");
      if (!items.length) return;
      const first = items[0]!, last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !ref.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, onClose]);

  return (
    <>
      <div className={"drawer-bg" + (open ? " on" : "")} onClick={onClose} aria-hidden="true" />
      <aside ref={ref} className={"drawer" + (kind ? " " + kind : "") + (open ? " on" : "")} role="dialog" aria-modal="true" aria-labelledby={titleId} inert={!open}>
        {mounted && (
          <>
            <div className="dh">
              <b id={titleId}>{title}</b>
              <button ref={closeBtn} type="button" className="x" aria-label="Tutup panel" onClick={onClose}>
                ✕
              </button>
            </div>
            {frame ? body : <div className="db">{body}</div>}
          </>
        )}
      </aside>
    </>
  );
}
