// Helper bersama (port dari templates/shell.js dan market.html).

export type Lead = { status?: string; note?: string | null; remind?: string | null; updated?: string };

export type Biz = {
  key?: string;
  place_id?: string;
  maps_url?: string;
  name: string;
  category?: string;
  address?: string;
  price?: string;
  rating?: number;
  reviews?: number;
  reviews_per_month?: number | null;
  phone?: string;
  website?: string;
  instagram?: string;
  instagram_shared?: boolean;
  emails?: string[];
  dist_km?: number | null;
  branches_in_area?: number;
  lead_score?: number | null;
  lead_reasons?: string[];
  lead?: Lead | null;
  _detailed?: boolean;
  _power?: number;
  // untuk papan prospek
  industry?: string;
  area?: string;
  report_id?: number;
};

export const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/[-]/g, "")
    .replace(/\s*·\s*$/, "")
    .trim();

export const num = (n: number | null | undefined) =>
  n == null
    ? "-"
    : n >= 1e6
      ? (n / 1e6).toFixed(1).replace(".", ",") + " jt"
      : n >= 1e4
        ? Math.round(n / 1e3) + " rb"
        : Number(n).toLocaleString("id-ID");

export const dec = (x: unknown) => String(x).replace(".", ",");
export const today = () => new Date().toISOString().slice(0, 10);

export const LEAD_ST = ["baru", "dihubungi", "tertarik", "deal", "tolak"] as const;
export const ST_LABEL: Record<string, string> = {
  baru: "Baru",
  dihubungi: "Dihubungi",
  tertarik: "Tertarik",
  deal: "Deal",
  tolak: "Tidak jadi",
};

export const waOf = (p: Biz) => {
  let d = String(p.phone || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d.startsWith("628") && d.length >= 10 && d.length <= 15 ? "https://wa.me/" + d : "";
};

export const fmtPhone = (p: Biz) => {
  let d = String(p.phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("62")) d = "0" + d.slice(2);
  return d.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3");
};

export const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export const leadKey = (p: Biz) => p.key || p.place_id || p.maps_url || "";

const DEFAULT_OFFER = "meningkatkan penjualan lewat kehadiran online";
export const getOffer = () => {
  try {
    return localStorage.getItem("offer") || DEFAULT_OFFER;
  } catch {
    return DEFAULT_OFFER;
  }
};
export const isDefaultOffer = () => getOffer() === DEFAULT_OFFER;
export const setOffer = (v: string) => {
  try {
    localStorage.setItem("offer", v);
  } catch {}
};

export const short = (n: string) => clean(n).split(/\s[-|@·,(]\s?/)[0].trim();

export function gapsOf(p: Biz): string[] | null {
  if (!p._detailed) return null; // belum diambil detailnya: jangan disimpulkan tidak punya website
  const g: string[] = [];
  if (!p.website) g.push("tanpa website");
  if (!p.instagram || p.instagram_shared) g.push("IG tidak ditemukan");
  if ((p.reviews || 0) < 100) g.push("review sedikit");
  if (p.rating && p.rating < 4.3) g.push("rating " + p.rating);
  return g;
}
export const isGem = (p: Biz) => (p.rating ?? 0) >= 4.7 && (p.reviews ?? 0) >= 15 && (p.reviews ?? 0) < 300;
export const isWeak = (p: Biz) => !!p.rating && p.rating < 4.3 && (p.reviews ?? 0) >= 150;
export const isProspect = (p: Biz, rival = false) => {
  if (rival) return false;
  const g = gapsOf(p);
  return !!(g && g.length && (p.reviews ?? 0) <= 800 && (waOf(p) || p.instagram));
};

export function draft(p: Biz, industry?: string, area?: string) {
  const r = p.lead_reasons || [];
  const g = gapsOf(p) || [];
  const praise =
    (p.rating ?? 0) >= 4.5
      ? `rating ${dec(p.rating)} dari ${p.reviews} ulasan di Google Maps, keren banget!`
      : `sudah ${p.reviews} ulasan di Google Maps.`;
  const why =
    g.includes("tanpa website") || r.includes("tanpa website")
      ? "Saya lihat belum ada website atau katalog online, padahal banyak calon pelanggan cek dulu di Google sebelum datang."
      : g.includes("IG tidak ditemukan") || r.includes("IG tidak ditemukan")
        ? "Saya belum menemukan Instagram resminya, padahal banyak pelanggan cari referensi di sana."
        : g.includes("review sedikit") || (p.reviews || 0) < 100
          ? "Ulasannya masih bisa ditambah supaya lebih sering muncul di pencarian."
          : "Masih ada ruang untuk tampil lebih menonjol dibanding pesaing sekitar.";
  return `Halo kak, salam kenal. Saya lihat ${short(p.name)} punya ${praise} ${why} Kebetulan saya bantu bisnis ${industry || ""} di sekitar ${area || ""} untuk ${getOffer()}. Boleh saya kirim contoh singkatnya? Terima kasih 🙏`;
}

export async function postJson(path: string, body: unknown) {
  const r = await fetch(path, { method: "POST", body: JSON.stringify(body) });
  let j: Record<string, unknown> = {};
  try {
    j = await r.json();
  } catch {}
  return { ok: r.ok, status: r.status, j };
}

export async function saveLead(p: Biz, patch: Partial<Lead>): Promise<string | null> {
  const lead: Lead = Object.assign({ status: "baru" }, p.lead || {}, patch);
  const { ok, j } = await postJson("/market/lead", {
    key: leadKey(p),
    name: clean(p.name),
    status: lead.status,
    note: lead.note ?? null,
    remind: lead.remind ?? null,
  });
  if (!ok) return (j.error as string) || "Gagal menyimpan";
  p.lead = Object.assign(lead, { updated: new Date().toISOString() });
  return null;
}

export function downloadCsv(name: string, header: string[], rows: unknown[][]) {
  const q = (v: unknown) => '"' + String(Array.isArray(v) ? v.join(" ") : (v ?? "")).replace(/"/g, '""') + '"';
  const lines = [header.join(",")].concat(rows.map((r) => r.map(q).join(",")));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
  a.download = name;
  a.click();
}
