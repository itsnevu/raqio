"use client";
// Halaman yang menampilkan prospek, laporan, atau pantauan memasang ini supaya memuat ulang saat asisten mengubah data.
import { useEffect, useRef } from "react";
import { REFRESH_EVENT, type RefreshDetail } from "./cache";

export function useRefresh(cb: (mutated: boolean) => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    const h = (e: Event) => ref.current(!!(e as CustomEvent<RefreshDetail>).detail?.mutated);
    window.addEventListener(REFRESH_EVENT, h);
    return () => window.removeEventListener(REFRESH_EVENT, h);
  }, []);
}
