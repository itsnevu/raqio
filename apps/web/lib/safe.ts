// Validasi nilai yang berasal dari URL atau data scraping sebelum dipakai sebagai tujuan navigasi.

/**
 * Tujuan redirect setelah login hanya boleh path internal same-origin.
 * Menolak "//evil.com", "/\evil.com" (backslash dinormalisasi browser jadi "//"), skema apa pun, dan path yang bukan diawali "/".
 */
export function safeNext(next: string | null | undefined, origin: string, fallback = "/market"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) return fallback;
  try {
    const u = new URL(next, origin);
    if (u.origin !== origin) return fallback;
    if (u.pathname.includes("\\") || u.pathname.startsWith("//")) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

/** Hanya http(s) yang boleh dipakai sebagai href link eksternal. Mengembalikan null kalau skema lain (javascript:, data:, dll). */
export function safeHttpUrl(u: string | null | undefined): string | null {
  if (!u || typeof u !== "string") return null;
  const s = u.trim();
  if (!s) return null;
  try {
    const p = new URL(s);
    if (p.protocol !== "http:" && p.protocol !== "https:") return null;
    return p.href;
  } catch {
    return null;
  }
}

/** Username Instagram: huruf, angka, titik, garis bawah, maksimal 30 karakter. */
export const igUrl = (handle: string | null | undefined) => {
  const h = String(handle || "").replace(/^@/, "");
  return /^[A-Za-z0-9_.]{1,30}$/.test(h) ? "https://instagram.com/" + h : null;
};

export const mailtoUrl = (e: string | null | undefined) => {
  const s = String(e || "").trim();
  return /^[^\s@<>"'?\/]+@[^\s@<>"'?\/]+\.[^\s@<>"'?\/]+$/.test(s) ? "mailto:" + s : null;
};
