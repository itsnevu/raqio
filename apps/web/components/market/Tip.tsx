"use client";
// Tooltip grafik: muncul saat hover, fokus keyboard, atau ketukan (pinned sampai ketukan berikutnya / Escape).
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { type Biz, clean, dec, num } from "@/lib/biz";

type Pos = { x: number; y: number; html: ReactNode; pinned: boolean; key: string | null };

export function useTip() {
  const [tip, setTip] = useState<Pos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const place = (x: number, y: number) => {
    const w = ref.current?.offsetWidth || 200, h = ref.current?.offsetHeight || 60;
    return { x: Math.min(x + 14, innerWidth - w - 8), y: Math.min(y + 14, innerHeight - h - 8) };
  };
  const show = useCallback((e: { clientX: number; clientY: number }, html: ReactNode) => {
    setTip((t) => (t?.pinned ? t : { ...place(e.clientX, e.clientY), html, pinned: false, key: null }));
  }, []);
  const showAt = useCallback((el: Element, html: ReactNode, key: string, pin = false) => {
    const r = el.getBoundingClientRect();
    setTip({ ...place(r.left + r.width / 2, r.top + r.height / 2), html, pinned: pin, key });
  }, []);
  const hide = useCallback(() => setTip((t) => (t?.pinned ? t : null)), []);
  const unpin = useCallback(() => setTip(null), []);
  useEffect(() => {
    if (!tip?.pinned) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setTip(null);
    const c = () => setTip(null);
    document.addEventListener("keydown", k);
    document.addEventListener("click", c);
    return () => {
      document.removeEventListener("keydown", k);
      document.removeEventListener("click", c);
    };
  }, [tip?.pinned]);
  const el = (
    <div id="tip" ref={ref} role="tooltip" style={{ opacity: tip ? 1 : 0, left: tip?.x, top: tip?.y }}>
      {tip?.html}
    </div>
  );
  return { show, showAt, hide, unpin, pinnedKey: tip?.pinned ? tip.key : null, el };
}
export type Tip = ReturnType<typeof useTip>;

export const tipHtml = (p: Biz, power?: number) => (
  <>
    <b>{clean(p.name)}</b>
    <br />★ {dec(p.rating ?? "-")} · {num(p.reviews)} ulasan
    {power ? <><br />Skor kekuatan {dec(power.toFixed(2))}</> : null}
    {p.category ? <><br />{clean(p.category)}</> : null}
  </>
);
