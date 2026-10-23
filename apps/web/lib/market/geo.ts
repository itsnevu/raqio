// Nama wilayah dari jawaban reverse geocoding Nominatim (OpenStreetMap). Fungsi murni.
// Hasilnya dipakai sebagai teks pencarian Google Maps ("industri wilayah"), jadi bentuknya
// mengikuti contoh di UI: "Kemang Jakarta", bukan alamat lengkap.

export type NominatimAddress = Partial<Record<string, string>>;

/** Susun nama wilayah: tingkat kampung/kelurahan dulu, lalu kota/kabupaten sebagai konteks.
 *  Prefiks administratif ("Kota ", "Kabupaten ") dibuang supaya cocok dengan gaya pencarian Maps. */
export function areaName(addr: NominatimAddress): string {
  const strip = (s: string) =>
    s.replace(/^(daerah khusus ibukota|daerah istimewa|kota adm\.?|kota administrasi|kota|kabupaten|kecamatan|kelurahan|desa)\s+/i, "").trim();
  const spot = addr.suburb || addr.village || addr.neighbourhood || addr.quarter || addr.city_district || addr.town || "";
  const city = addr.city || addr.county || addr.state || ""; // town hanya untuk spot supaya tidak terpakai dua kali
  const parts: string[] = [];
  for (const raw of [spot, city]) {
    const v = strip(raw);
    if (v && !parts.some((p) => p.toLowerCase() === v.toLowerCase())) parts.push(v);
  }
  return parts.join(" ");
}

/** URL reverse geocoding Nominatim; zoom peta dipetakan ke granularitas nama (10 kota … 14 kelurahan). */
export function nominatimUrl(lat: number, lon: number, mapZoom: number): string {
  const zoom = Math.min(Math.max(Math.round(mapZoom), 10), 14);
  return `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&zoom=${zoom}&accept-language=id`;
}

/** URL pencarian Nominatim (forward geocoding) untuk memvalidasi nama wilayah yang diketik pengguna; hanya Indonesia. */
export function nominatimSearchUrl(q: string): string {
  return `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=id&addressdetails=1&accept-language=id&q=${encodeURIComponent(q.trim())}`;
}

/** Aturan dasar sebelum ke geocoder: minimal 3 huruf, mengandung vokal, bukan huruf berulang. */
export function looksLikeArea(q: string): boolean {
  const s = q.trim();
  if (s.length < 3 || s.length > 80) return false;
  if (!/[aiueo]/i.test(s)) return false;
  if (/^(.)\1+$/i.test(s.replace(/\s/g, ""))) return false; // huruf berulang: "aaaa", "xxxx"
  return /\p{L}{3,}/u.test(s);
}

export type GeoCheck = { ok: true; name: string } | { ok: false; reason: string };

/** Validasi nama wilayah lewat Nominatim. Gagal jaringan dianggap lolos (jangan memblokir pengguna). */
export async function checkArea(q: string, fetchFn: typeof fetch = fetch): Promise<GeoCheck> {
  if (!looksLikeArea(q)) return { ok: false, reason: 'Isi nama wilayah yang sebenarnya, misalnya "Kemang Jakarta".' };
  try {
    const r = await fetchFn(nominatimSearchUrl(q), { headers: { Accept: "application/json" } });
    if (!r.ok) return { ok: true, name: q.trim() };
    const rows = (await r.json()) as { display_name?: string; address?: NominatimAddress }[];
    const hit = rows[0];
    if (!hit) return { ok: false, reason: `"${q.trim()}" tidak ditemukan di peta Indonesia.` };
    // nama yang diketik pengguna sudah cocok untuk pencarian Maps; geocoder hanya memastikan tempatnya ada
    return { ok: true, name: q.trim().replace(/\s+/g, " ") };
  } catch {
    return { ok: true, name: q.trim() };
  }
}
