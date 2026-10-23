"use client";
import { useEffect, useRef, useState } from "react";
import { useNotice } from "@/components/shell/ToastContext";
import { markTourSeen, startTour, tourSeen, type TourStep } from "@/lib/tour";

export const TOUR_EVENT = "raqio:tour";
export const TOUR_OFFER_EVENT = "raqio:tour-offer";

/**
 * Pasang tur untuk halaman ini. Tur TIDAK pernah jalan sendiri: pengunjung baru hanya ditawari lewat
 * bilah kecil (TourOffer di Nav) dan memilih "Mulai panduan" atau "Nanti". Tombol Panduan di menu Lanjutan
 * memutar ulang kapan saja (event TOUR_EVENT).
 */
export function useTour(name: string, steps: TourStep[], ready = true) {
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      if (!tourSeen(name)) window.dispatchEvent(new CustomEvent(TOUR_OFFER_EVENT, { detail: { name } }));
    }, 700);
    const replay = () => void startTour(name, stepsRef.current);
    window.addEventListener(TOUR_EVENT, replay);
    return () => {
      clearTimeout(t);
      window.removeEventListener(TOUR_EVENT, replay);
      // pindah halaman: tawaran untuk halaman ini ditutup
      window.dispatchEvent(new CustomEvent(TOUR_OFFER_EVENT, { detail: { name: null } }));
    };
  }, [name, ready]);
}

export const replayTour = () => window.dispatchEvent(new Event(TOUR_EVENT));

/** Bilah tawaran panduan. Dirender sekali di Nav; muncul hanya untuk halaman yang turnya belum pernah dilihat. */
export function TourOffer() {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setName((e as CustomEvent<{ name: string | null }>).detail?.name ?? null);
    window.addEventListener(TOUR_OFFER_EVENT, on);
    return () => window.removeEventListener(TOUR_OFFER_EVENT, on);
  }, []);
  const { notify, dismiss } = useNotice();
  useEffect(() => {
    if (!name) return;
    const mulai = () => {
      setName(null);
      replayTour();
    };
    const nanti = () => {
      markTourSeen(name);
      setName(null);
    };
    notify({
      id: "tour",
      kind: "info",
      text: "Baru di halaman ini? Ada panduan singkat, kurang dari satu menit.",
      actions: [{ label: "Mulai panduan", onClick: mulai, primary: true }, { label: "Nanti saja", onClick: nanti }],
      onClose: nanti,
    });
    return () => dismiss("tour");
  }, [name, notify, dismiss]);
  return null;
}
