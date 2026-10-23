// Cek kontak satu bisnis. Backend bisa membalas 200 (hasil langsung) atau 202 {job} (dikerjakan worker).
// Untuk 202: tunggu event done lewat SSE job itu, lalu baca ulang laporan; kalau SSE tidak tersedia, poll /market/report
// sampai bisnis itu `_detailed`. Maksimal 90 detik.
import { ApiError, apiGet, request } from "../api";
import { type Biz, leadKey } from "../biz";
import { waitJobDone } from "../useJobStream";
import { isReport } from "./verdict";
import type { Report } from "./types";

const TIMEOUT = 90_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readDetailed(reportId: number, key: string): Promise<Biz | null> {
  const rep = await apiGet<unknown>("/market/report?id=" + encodeURIComponent(String(reportId)));
  if (!isReport(rep)) return null;
  const p = ((rep as Report).all || []).find((x) => leadKey(x) === key);
  return p && p._detailed ? p : null;
}

export async function checkDetail(reportId: number, p: Biz, onPending?: () => void): Promise<Biz> {
  const key = leadKey(p);
  const { status, data } = await request<Partial<Biz> & { job?: number }>("/market/detail", { method: "POST", json: { report_id: reportId, key } });
  if (status !== 202) return { ...p, ...data, _detailed: true };
  // 202 {ok, job, pending, status}: jangan digabung ke objek bisnis; tunggu worker selesai
  onPending?.();

  const started = Date.now();
  if (data && typeof data.job === "number") {
    const st = await waitJobDone(data.job, TIMEOUT);
    if (st === "done" || st === "unsupported" || st === "error" || st === "timeout") {
      const got = await readDetailed(reportId, key).catch(() => null);
      if (got) return got;
      if (st === "done") throw new ApiError(502, "Detail selesai tapi hasil belum terbaca. Muat ulang laporan.");
      if (st === "timeout") throw new ApiError(504, "Google Maps tidak merespons dalam 90 detik, coba lagi sebentar lagi.");
    } else {
      throw new ApiError(400, st === "cancelled" ? "Cek kontak dibatalkan." : "Cek kontak gagal, coba lagi.");
    }
  }
  // fallback polling laporan
  while (Date.now() - started < TIMEOUT) {
    await sleep(3000);
    const got = await readDetailed(reportId, key).catch(() => null);
    if (got) return got;
  }
  throw new ApiError(504, "Google Maps tidak merespons dalam 90 detik, coba lagi sebentar lagi.");
}
