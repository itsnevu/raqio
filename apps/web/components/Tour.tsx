"use client";
import { useEffect, useRef } from "react";
import { startTour, tourSeen, type TourStep } from "@/lib/tour";

export const TOUR_EVENT = "raqio:tour";

/**
 * Pasang tur untuk halaman ini. Otomatis jalan sekali untuk pengunjung baru (setelah `ready` true,
 * supaya elemen yang ditunjuk sudah dirender), dan diputar ulang saat tombol Panduan ditekan.
 */
export function useTour(name: string, steps: TourStep[], ready = true) {
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      if (!tourSeen(name)) startTour(name, stepsRef.current);
    }, 700);
    const replay = () => startTour(name, stepsRef.current);
    window.addEventListener(TOUR_EVENT, replay);
    return () => {
      clearTimeout(t);
      window.removeEventListener(TOUR_EVENT, replay);
    };
  }, [name, ready]);
}

export const replayTour = () => window.dispatchEvent(new Event(TOUR_EVENT));
