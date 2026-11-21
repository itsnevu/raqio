// Panduan interaktif per halaman memakai driver.js. Tidak pernah jalan otomatis: pengunjung baru ditawari
// lewat bilah kecil dan memilih sendiri; bisa diputar ulang lewat tombol "Panduan" di navigasi (event "raqio:tour").
// driver.js dimuat lewat dynamic import saat tur dimulai, bukan di bundle awal semua halaman.
import type { DriveStep, Driver } from "driver.js";

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
/** Tandai tur halaman sudah ditawarkan/dilihat (dipakai tombol "Nanti saja" supaya tidak menawarkan lagi). */
export const markTourSeen = markSeen;
export const resetTours = () => {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("tour:"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
};

let active: Driver | null = null;

/** Mulai tur. Langkah yang elemennya belum ada di halaman dilewati, jadi tur tetap jalan sebelum ada laporan. */
export async function startTour(name: string, steps: TourStep[]) {
  const usable = steps.filter((s) => !s.element || document.querySelector(s.element));
  if (!usable.length) return false;
  const [{ driver }] = await Promise.all([import("driver.js"), import("driver.js/dist/driver.css")]);
  if (active?.isActive()) active.destroy();
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
