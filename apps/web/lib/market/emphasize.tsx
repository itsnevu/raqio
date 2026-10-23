import { Fragment, type ReactNode } from "react";

// Kata kunci yang menentukan arti kalimat di laporan. Angka (persen, rating, jumlah) juga disorot.
const KEYWORDS = [
  "calon klien", "pesaing", "prospek", "celah", "peluang", "hidden gem", "pemimpin pasar", "pemimpin",
  "website", "whatsapp", "instagram", "rating", "ulasan", "ramai", "sepi", "padat", "merata", "dikuasai",
  "lemah", "kuat", "kuota", "follow up", "dihubungi", "deal", "tutup",
];
const NUMBER = String.raw`\d+(?:[.,]\d+)*(?:\s?%)?(?:\s(?:bisnis|brand|cabang|ulasan|prospek|hari|menit|jam|teratas))?`;
const RE = new RegExp(`(${NUMBER}|${KEYWORDS.map((k) => k.replace(/ /g, String.raw`\s`)).join("|")})`, "gi");

/** Pecah teks jadi potongan biasa dan potongan yang disorot (angka dan kata kunci). */
export function emphasizeParts(text: string): { t: string; k: boolean }[] {
  const out: { t: string; k: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: text.slice(last, i), k: false });
    out.push({ t: m[0], k: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), k: false });
  return out;
}

/** Render teks dengan angka dan kata kunci berwarna kuning Raqio (kelas .k). */
export function Em({ text }: { text: string }): ReactNode {
  // potongan biasa tanpa elemen pembungkus supaya tidak kena gaya span (mis. kotak di kartu alasan)
  return emphasizeParts(text).map((p, i) => (p.k ? <mark className="k" key={i}>{p.t}</mark> : <Fragment key={i}>{p.t}</Fragment>));
}
