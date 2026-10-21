// Panduan interaktif per halaman memakai driver.js. Tampil otomatis sekali per halaman per browser,
// bisa diputar ulang lewat tombol "Panduan" di navigasi (event window "raqio:tour").
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

export type TourStep = DriveStep & { element?: string };

const KEY = (name: string) => "tour:" + name;

export const tourSeen = (name: string) => {
  try {
    return localStorage.getItem(KEY(name)) === "1";
  } catch {
    return true;
  }
};
const markSeen = (name: string) => {
  try {
    localStorage.setItem(KEY(name), "1");
  } catch {}
};
export const resetTours = () => {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("tour:"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
};

let active: ReturnType<typeof driver> | null = null;

/** Mulai tur. Langkah yang elemennya belum ada di halaman dilewati, jadi tur tetap jalan sebelum ada laporan. */
export function startTour(name: string, steps: TourStep[]) {
  if (active?.isActive()) active.destroy();
  const usable = steps.filter((s) => !s.element || document.querySelector(s.element));
  if (!usable.length) return false;
  active = driver({
    showProgress: true,
    animate: true,
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 0,
    popoverClass: "raqio-tour",
    nextBtnText: "Lanjut",
    prevBtnText: "Kembali",
    doneBtnText: "Selesai",
    progressText: "{{current}} dari {{total}}",
    steps: usable,
    onDestroyStarted: () => {
      markSeen(name);
      active?.destroy();
    },
  });
  active.drive();
  return true;
}
