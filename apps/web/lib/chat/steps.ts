// Helper murni halaman Asisten: baris log job jadi langkah, pesan error ramah, tautan aksi dari jawaban. Tanpa DOM/React.
import { ApiError, errMsg } from "../api";
import type { MsgErrorCode } from "./types";

export const TOOL_PREFIX = "🔧";

const TOOL_LABEL: Record<string, string> = {
  search_competitors: "Mencari bisnis di lokasi (bisa beberapa menit)…",
  list_competitors: "Membaca data tersimpan…",
  scrape_instagram: "Scrape Instagram…",
  google_trends: "Cek Google Trends…",
};

/** Baris yang diawali 🔧 adalah panggilan tool agent; baris lain progres biasa. */
export const isToolStep = (s: string) => s.trimStart().startsWith(TOOL_PREFIX);

/** "🔧 search_competitors({"q":"kopi"})" -> "Mencari bisnis di lokasi (bisa beberapa menit)… (kopi)". Tool tak dikenal dipakai namanya. */
export function stepText(s: string): string {
  const t = s.trim();
  if (!isToolStep(t)) return t;
  const body = t.slice(TOOL_PREFIX.length).trim();
  const m = body.match(/^(\w+)\((.*)\)$/s);
  if (!m) return body;
  let args = "";
  try {
    const parsed = JSON.parse(m[2] || "{}") as unknown;
    if (parsed && typeof parsed === "object")
      args = Object.values(parsed as Record<string, unknown>)
        .filter((v) => typeof v !== "boolean" && v != null && v !== "")
        .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
        .join(" · ");
  } catch {}
  return (TOOL_LABEL[m[1] ?? ""] || m[1]) + (args ? " (" + args + ")" : "");
}

/** Teks append SSE dipecah per baris; baris kosong dibuang. */
export const splitSteps = (log: string): string[] =>
  log
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const toolName = (s: string) => (s.trim().slice(TOOL_PREFIX.length).trim().match(/^(\w+)/) || [])[1] || "";
const READ_ONLY = /^(get|list|read|search|find|show|fetch|lookup|baca|cari|lihat|ambil|scrape|google|cek|check|compare|summar)/i;
const MUTATING = /^(set|update|mark|save|add|remove|delete|watch|unwatch|toggle|create|put|patch|hapus|ubah|tandai|pantau|catat|simpan|ingatkan|follow)|(lead|watch|status|remind|note|pantau)/i;

/** Tool yang kemungkinan mengubah data tim (status prospek, pantauan). Dipakai untuk memberi tahu halaman supaya memuat ulang. */
export function isMutatingStep(s: string): boolean {
  if (!isToolStep(s)) return false;
  const n = toolName(s);
  if (!n || READ_ONLY.test(n)) return false;
  return MUTATING.test(n);
}

export const NO_KEY_MSG = "Asisten belum dikonfigurasi, hubungi admin. Riset pasar dan papan prospek tetap bisa dipakai.";
export const BUSY_MSG = "Agent masih menjawab. Tunggu jawaban sebelumnya selesai atau tekan Stop.";
export const QUOTA_MSG = "Kuota chat bulan ini habis.";
export const DISABLED_MSG = "Asisten dinonaktifkan di server ini.";

export const isNoKey = (m: string) => /OPENROUTER|API_KEY|api key/i.test(m);

/** Pesan dan kode error untuk ditampilkan di gelembung asisten. */
export function describeError(e: unknown): { error: string; code: MsgErrorCode } {
  if (e instanceof ApiError) {
    if (e.code === "chat_busy" || e.code === "job_running" || e.status === 409) return { error: BUSY_MSG, code: "busy" };
    if (e.code === "quota_exceeded" || e.status === 402) return { error: QUOTA_MSG, code: "quota" };
    if (e.code === "chat_disabled" || e.status === 503) return { error: DISABLED_MSG, code: "disabled" };
  }
  const m = errMsg(e, "Gagal menghubungi asisten.");
  return isNoKey(m) ? { error: NO_KEY_MSG, code: "nokey" } : { error: m, code: "other" };
}

/** Tautan lanjutan di bawah jawaban, dari kata kunci jawaban. */
export function actions(answer: string): [string, string][] {
  const a: [string, string][] = [];
  if (/riset|pasar|wilayah|prospek/i.test(answer)) a.push(["/market", "Buka laporan riset"]);
  if (/prospek|whatsapp|hubungi/i.test(answer)) a.push(["/prospects", "Lihat prospek"]);
  if (/pantau|watch/i.test(answer)) a.push(["/watch", "Lihat pantauan"]);
  return a;
}

/** Saran pertanyaan bawaan kalau GET /chat/suggestions gagal. */
export const CHIPS = [
  "kompetitor coffee shop di Kemang siapa aja?",
  "riset pasar agency di Gading Serpong",
  "salon di Dago Bandung yang paling rame di IG",
  "bandingin Kopi Kenangan sama Janji Jiwa",
];

export const fmtWhen = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
};

export const quotaText = (q: { used: number; limit: number } | null) => {
  if (!q) return "";
  const left = Math.max(0, q.limit - q.used);
  return left === 0 ? "Kuota chat bulan ini habis." : `Sisa kuota chat bulan ini: ${left} dari ${q.limit}.`;
};
