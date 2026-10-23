"use client";
// Logo bisnis supaya nama langsung dikenali: logo unduhan worker (website/IG/foto Maps) lewat API sendiri,
// kalau tidak ada favicon website bisnis (layanan favicon Google), kalau tidak ada juga avatar inisial
// dengan warna tetap per nama. Dengan prop `zoom` logo bisa diklik untuk diperbesar; jangan dipakai di dalam
// tombol/tautan lain (kontrol bersarang), cukup di panel bisnis dan detail peringkat.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { host } from "@/lib/biz";

const PALETTE = ["#FFB020", "#19D29C", "#5B8DEF", "#EF6B5F", "#B388FF", "#F28C28"];

export function initialsOf(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  const a = words[0]?.[0] ?? "?", b = words[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}
export function colorOf(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

function Zoom({ src, name, sub, onClose }: { src: string; name: string; sub: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <button type="button" className="logo-zoom" aria-label="Tutup logo" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}>
      <span className="box">
        {/* eslint-disable-next-line @next/next/no-img-element -- gambar dari API sendiri */}
        <img src={src} alt={"Logo " + name} />
        <b>{name}</b>
        <small>{sub}</small>
      </span>
    </button>,
    document.body,
  );
}

export default function BizAvatar({ name, website, logoKey, size = 22, zoom = false }: { name: string; website?: string | null; logoKey?: string | null; size?: number; zoom?: boolean }) {
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const domain = website ? host(website) : "";
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)) } as const;
  const src = logoKey && !broken ? "/logo/" + encodeURIComponent(logoKey)
    : domain && !broken ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : "";
  if (!src) {
    return <span className="bavatar ini" style={{ ...style, background: colorOf(name) }} aria-hidden="true">{initialsOf(name)}</span>;
  }
  const sub = logoKey ? "logo dari website / Instagram / foto Google Maps bisnis ini" : "ikon dari website bisnis (" + domain + ")";
  // eslint-disable-next-line @next/next/no-img-element -- ikon kecil dari API sendiri / favicon, optimasi next/image tidak relevan
  const img = <img className="bavatar" style={style} alt="" aria-hidden="true" loading="lazy" decoding="async" src={src} onError={() => setBroken(true)} />;
  if (!zoom) return img;
  const openIt = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };
  return (
    <>
      <span className="bavatar-z" role="button" tabIndex={0} title="Klik untuk memperbesar logo" aria-label={"Perbesar logo " + name}
        onClick={openIt} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openIt(e); }}>
        {img}
      </span>
      {open && <Zoom src={src} name={name} sub={sub} onClose={() => setOpen(false)} />}
    </>
  );
}
