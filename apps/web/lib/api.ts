// Klien API bertipe. Semua fetch ke Go API lewat sini supaya: Content-Type JSON otomatis, r.ok dicek,
// bentuk error {error, code?} diparse jadi ApiError, dan respons non-JSON tidak membuat halaman crash.
import type { components } from "./api.gen";

export type Schemas = components["schemas"];
// Peran dan paket di server lebih luas dari enum di spec (admin/analyst/viewer, guest); longgarkan di sini.
export type Me = Omit<Schemas["Me"], "role" | "plan"> & { role: string; plan: string; guest?: boolean };
export type Limits = Schemas["Limits"];
export type Org = Omit<Schemas["Org"], "plan"> & { plan: string };
export type Plan = Schemas["Plan"];
export type Invoice = Schemas["Invoice"];
export type JobLog = Schemas["JobLog"];
// /market/reports kini baris ringkas: created_at (bukan created), summary, cached.
export type ReportRow = { id: number; industry: string; area: string; created_at?: string; created?: string; summary?: unknown; cached?: boolean };
export type WatchRow = Schemas["Watch"];

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const FALLBACK: Record<number, string> = {
  0: "Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.",
  400: "Permintaan tidak valid.",
  401: "Sesi berakhir. Masuk lagi.",
  402: "Kuota paket habis.",
  403: "Kamu tidak punya akses untuk aksi ini.",
  404: "Data tidak ditemukan.",
  409: "Masih ada proses lain yang berjalan.",
  413: "Data terlalu besar.",
  429: "Terlalu banyak permintaan. Tunggu sebentar.",
  500: "Server bermasalah. Coba lagi sebentar lagi.",
  502: "Server bermasalah. Coba lagi sebentar lagi.",
  503: "Server sedang sibuk. Coba lagi sebentar lagi.",
  504: "Server tidak merespons. Coba lagi sebentar lagi.",
};

/** Ambil pesan dan kode dari body error ({error, code?}); kalau bukan bentuk itu, pakai pesan baku per status. */
export function parseError(status: number, body: unknown): ApiError {
  let message = "";
  let code: string | undefined;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") message = b.error;
    else if (typeof b.message === "string") message = b.message;
    if (typeof b.code === "string") code = b.code;
  } else if (typeof body === "string" && body.length < 200 && !/^\s*</.test(body)) {
    message = body.trim();
  }
  if (!message) message = FALLBACK[status] || `Gagal (HTTP ${status}).`;
  return new ApiError(status, message, code);
}

export type ApiInit = Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit | null };
export type ApiResponse<T> = { status: number; data: T };

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Versi lengkap: mengembalikan status juga (dipakai untuk 202 Accepted di /market/detail). */
export async function request<T>(path: string, init: ApiInit = {}): Promise<ApiResponse<T>> {
  const { json, headers: h, ...rest } = init;
  const headers = new Headers(h);
  let body = rest.body;
  if (json !== undefined) {
    body = JSON.stringify(json);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  let r: Response;
  try {
    r = await fetch(path, { credentials: "same-origin", ...rest, body, headers });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, FALLBACK[0]!);
  }
  const text = await r.text();
  const data = parseBody(text);
  if (!r.ok) throw parseError(r.status, data);
  return { status: r.status, data: data as T };
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  return (await request<T>(path, init)).data;
}

export const apiGet = <T>(path: string, init: ApiInit = {}) => api<T>(path, { ...init, method: "GET" });
export const apiPost = <T>(path: string, json: unknown = {}, init: ApiInit = {}) => api<T>(path, { ...init, method: "POST", json });

/** Pesan ramah untuk ditampilkan di UI dari error apa pun. */
export function errMsg(e: unknown, fallback = "Terjadi kesalahan."): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof DOMException && e.name === "AbortError") return "Dibatalkan.";
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
