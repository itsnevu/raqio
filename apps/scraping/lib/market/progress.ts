// Membaca log worker jadi data progres. Fungsi murni.
export const STEPS: [string, string][] = [["1/5", "Cari di Google Maps"], ["2/5", "Ambil telepon dan website"], ["3/5", "Cari akun IG"], ["4/5", "Susun laporan"], ["5/5", "Simpan"]];

export type Progress = { step: number; pct: number; compare: { i: number; n: number; area: string } | null };

export function parseProgress(log: string): Progress {
  const m = [...log.matchAll(/\[(\d)\/5\]/g)].pop();
  const c = [...log.matchAll(/\[compare\] wilayah (\d+)\/(\d+): ([^\n]*)/g)].pop();
  const step = m ? +(m[1] ?? 0) : 0;
  let pct = step ? ((step - 1) / 5) * 100 + 10 : 3;
  let compare: Progress["compare"] = null;
  if (c) {
    const i = +(c[1] ?? 1), n = Math.max(+(c[2] ?? 1), 1);
    pct = ((i - 1 + Math.max(step - 1, 0) / 5) / n) * 100;
    compare = { i, n, area: c[3] ?? "" };
  }
  return { step, pct: Math.min(Math.max(pct, 0), 97), compare };
}

export type Outcome = { reportId: number | null; compareDone: boolean; failReason: string };

export function parseOutcome(log: string, error?: string | null): Outcome {
  const m = [...log.matchAll(/REPORT_PG_ID=(\d+)(?:\s|$)/g)].pop();
  const lines = log.trim().split("\n").filter((l) => l.trim() && !/^\[selesai/.test(l));
  return {
    reportId: m ? +(m[1] ?? 0) || null : null,
    compareDone: /COMPARE_DONE/.test(log),
    failReason: (error && error.trim()) || lines[lines.length - 1] || "",
  };
}

// Patokan kasar durasi riset per wilayah; teks bantuan UI menyebut "2 sampai 4 menit".
export const EST_SEC_PER_AREA = 330; // termasuk tahap sumber lain (Overture, OSM, cek website) di langkah 1

/** Porsi waktu tiap tahap dari EST_SEC_PER_AREA (cari Maps paling lama, simpan paling cepat). */
export const STEP_SHARE = [0.45, 0.25, 0.15, 0.1, 0.05];

export const mmss = (sec: number) => `${Math.floor(Math.max(sec, 0) / 60)}:${String(Math.max(sec, 0) % 60).padStart(2, "0")}`;

/**
 * Sisa waktu yang dihitung ulang tiap tahap berganti: sisa tahap setelah ini + sisa jatah tahap ini (dikurangi
 * lamanya tahap ini sudah berjalan) + wilayah yang belum disentuh. Hasilnya turun tiap detik dan melompat saat
 * tahap selesai, bukan angka beku. `over` = sudah melewati perkiraan.
 */
export function etaFor(step: number, stepSinceMs: number, areas = 1, areaIdx = 1, now = Date.now()): { left: number; over: boolean; stepOver: boolean } {
  if (step <= 0) return { left: EST_SEC_PER_AREA * Math.max(areas, 1), over: false, stepOver: false };
  const inStep = Math.max(0, (now - stepSinceMs) / 1000);
  const budget = (STEP_SHARE[step - 1] ?? 0) * EST_SEC_PER_AREA;
  const cur = Math.max(0, budget - inStep);
  const rest = STEP_SHARE.slice(step).reduce((a, b) => a + b, 0) * EST_SEC_PER_AREA;
  const areasLeft = Math.max(0, Math.max(areas, 1) - Math.max(areaIdx, 1)) * EST_SEC_PER_AREA;
  const left = Math.round(cur + rest + areasLeft);
  // tahap ini sudah melewati jatahnya (mis. Google Maps lambat): angka sisa tidak boleh beku, beri tahu pembaca
  const stepOver = inStep > budget * 1.15;
  return { left, over: left <= 0 && stepOver, stepOver };
}

/** Teks lama; dipertahankan untuk pemakai lain. */
export const etaText = (startedSec: number | null, areas = 1, now = Date.now()) => {
  const left = Math.round(EST_SEC_PER_AREA * Math.max(areas, 1) - (startedSec ? now / 1000 - startedSec : 0));
  if (left <= 0) return "hampir selesai…";
  return `± ${mmss(left)} lagi`;
};

/** Baris log terakhir yang berarti, dipotong supaya muat satu baris. */
export function lastLine(log: string, max = 110): string {
  const lines = log.split("\n").map((l) => l.trim()).filter((l) => l && !/^REPORT_PG_ID=|^COMPARE_DONE/.test(l));
  const l = lines[lines.length - 1] ?? "";
  return l.length > max ? l.slice(0, max - 1) + "…" : l;
}

export const ageText = (h: number) => (h < 1 ? "kurang dari 1 jam" : h < 48 ? `${h} jam` : `${Math.round(h / 24)} hari`);
