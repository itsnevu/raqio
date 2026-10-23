// Kesimpulan bahasa awam dari satu laporan. Fungsi murni, tidak menyentuh DOM atau state.
import { type Biz, clean, dec, isProspect, isWeak, leadKey, short } from "../biz";
import type { Report } from "./types";

export type Verdict = { headline: string; why: string; next: [string, string]; reasons: [string | number, string, string, string][]; leaders?: Biz[] };

export const SELF_WORDS = /agency|agensi|marketing|digital|web ?dev|website|branding|design|desain|seo|advertis|iklan|konsultan|freelance|software|studio kreatif|creative/i;
export const looksLikeSelf = (industry: string) => SELF_WORDS.test(industry);

function verdictRival(R: Report, all: Biz[]): Verdict {
  const s = R.summary, d = R.digital, n = s.businesses;
  const leaders = (R.leaders || []).slice(0, 3), top = leaders[0];
  const weak = all.filter(isWeak);
  const noWeb = d.sampled ? 100 - d.website : null, noIg = d.sampled ? 100 - d.instagram : null;
  const crowd = s.top3_share >= 50 ? `dikuasai ${top ? clean(top.name) : "beberapa nama besar"}` : s.top3_share >= 30 ? "punya beberapa pesaing kuat, tapi belum ada yang menguasai" : "tidak punya pemimpin jelas, semua pesaing masih kecil";
  const headline = `Kamu punya ${n}${s.capped ? "+" : ""} pesaing ${R.industry} di ${R.area}. Pasar ini ${crowd}.`;
  let edge: string;
  const w0 = weak[0];
  if (w0) edge = `${weak.length} pesaing ramai tapi ratingnya rendah (mis. ${clean(w0.name)}). Pelanggan mereka tidak puas, itu yang paling gampang direbut.`;
  else if (noIg != null && noIg >= 30) edge = `${noIg}% pesaing tidak aktif di Instagram. Kalau kamu rajin posting, kamu langsung lebih terlihat.`;
  else if (noWeb != null && noWeb >= 30) edge = `${noWeb}% pesaing tidak punya website. Website yang rapi sudah jadi pembeda.`;
  else if ((s.avg_rating ?? 0) >= 4.5) edge = `Semua pesaing ratingnya tinggi (rata-rata ${dec(s.avg_rating)}). Sulit menang lewat rating, harus lewat spesialisasi atau harga.`;
  else edge = `Rating rata-rata pesaing ${dec(s.avg_rating)}. Layanan yang lebih baik saja sudah cukup untuk menonjol.`;
  const next: [string, string] = top
    ? [`Pelajari ${leaders.map((l) => clean(l.name)).join(", ")}.`, "Buka Maps dan Instagram mereka, catat harga, paket, dan apa yang dipuji pelanggan di ulasan. Lalu tentukan satu hal yang kamu bisa lebih baik."]
    : ["Belum ada pesaing yang menonjol.", "Ini kesempatan jadi yang pertama rapi di wilayah ini."];
  const reasons: Verdict["reasons"] = [
    [n + (s.capped ? "+" : ""), "pesaing", s.top3_share >= 50 ? `${s.top3_share}% ulasan dipegang 3 teratas, mereka yang harus dikejar` : `3 teratas cuma pegang ${s.top3_share}% ulasan, posisi teratas masih terbuka`, "seberapa ramai"],
    [s.avg_rating != null ? dec(s.avg_rating) : "-", "rating pesaing", (s.avg_rating ?? 0) >= 4.5 ? "standar tinggi, kamu harus minimal 4,5 untuk dilirik" : "standar biasa saja, layanan bagus langsung menonjol", "standar kualitas"],
    [weak.length, "pesaing rapuh", weak.length ? "ramai tapi rating rendah, pelanggannya bisa direbut" : "tidak ada yang rapuh, menang lewat pembeda", "celah yang bisa diambil"],
  ];
  return { headline, why: edge, next, reasons, leaders };
}

/** Gabungkan daftar jadi "a, b, dan c". */
const listId = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")}, dan ${xs[xs.length - 1]}`);

export type Gap = { key: string; pct: number; why: string; offer: string };

/** Semua celah pasar yang cukup besar untuk digarap, urut dari yang paling lebar. Dasar angkanya: digital.* (sampel yang dicek detail),
 *  size_buckets (bisnis dengan <50 ulasan), dan isWeak (ramai tapi rating rendah). Ambang 20% supaya celah kecil tidak ikut disebut. */
export function marketGaps(R: Report, all: Biz[]): Gap[] {
  const s = R.summary, d = R.digital, n = s.businesses;
  const weak = all.filter(isWeak).length;
  const small = R.size_buckets ? (R.size_buckets.find((b) => b[0] === "<50") || ["", 0])[1] : 0;
  const pctSmall = n ? Math.round((small / n) * 100) : 0;
  const gaps: Gap[] = [];
  if (d.sampled) {
    const noWeb = 100 - d.website, noIg = 100 - d.instagram, noWa = 100 - d.whatsapp;
    if (noWeb >= 20) gaps.push({ key: "website", pct: noWeb, why: `${noWeb}% belum punya website`, offer: "website atau katalog online" });
    if (noIg >= 20) gaps.push({ key: "Instagram", pct: noIg, why: `${noIg}% tidak terlihat aktif di Instagram`, offer: "kelola konten Instagram" });
    if (noWa >= 20) gaps.push({ key: "WhatsApp", pct: noWa, why: `${noWa}% tidak mencantumkan WhatsApp`, offer: "jalur pesan dan balasan cepat ke pelanggan" });
  }
  if (pctSmall >= 25) gaps.push({ key: "ulasan", pct: pctSmall, why: `${pctSmall}% masih punya kurang dari 50 ulasan`, offer: "cara kumpulkan ulasan dan tampil di Google" });
  const off = R.sources?.extra_only || 0;
  if (off) gaps.push({ key: "Google Maps", pct: n ? Math.round((off / n) * 100) : 0, why: `${off} bisnis tidak muncul di hasil Google Maps (ditemukan di sumber lain)`, offer: "cek dan optimasi profil Google Maps" });
  if (weak) gaps.push({ key: "layanan", pct: n ? Math.round((weak / n) * 100) : 0, why: `${weak} bisnis ramai tapi ratingnya rendah`, offer: "perbaikan layanan dan reputasi" });
  return gaps.sort((a, b) => b.pct - a.pct);
}

export function verdict(R: Report, all: Biz[], rival: boolean): Verdict {
  if (rival) return verdictRival(R, all);
  const s = R.summary, d = R.digital, n = s.businesses;
  const nPros = all.filter((p) => isProspect(p)).length;
  const top = (R.leaders || [])[0];
  const crowd = s.top3_share >= 50 ? `dikuasai ${top ? short(top.name) : "satu dua nama besar"}` : s.top3_share >= 30 ? "ramai, ada beberapa nama besar tapi tidak ada yang menguasai" : "ramai dan merata, belum ada yang dominan";
  const gaps = marketGaps(R, all);
  const sat = d.sampled && 100 - d.website < 15 ? `Hampir semua sudah punya website (${d.website}%), jadi jualan "bikin website" akan sulit laku di sini.` : "";
  const headline = `Pasar ${R.industry} di ${R.area} ${crowd}.`;
  // sebut semua celah, bukan satu saja: pembaca bisa memilih sendiri mana yang cocok dengan jasanya
  const why = gaps.length
    ? `Ada ${gaps.length} celah yang bisa digarap: ${listId(gaps.map((g) => g.why))}. ${sat}`.trim()
    : `Hampir semua sudah rapi secara digital, menang lewat sesuatu yang benar-benar beda. ${sat}`.trim();
  const offer = gaps.length ? `Yang bisa ditawarkan: ${listId(gaps.map((g) => g.offer))}.` : "Tawarkan sesuatu yang benar-benar beda.";
  const next: [string, string] = nPros
    ? [`Hubungi ${nPros} bisnis yang punya celah.`, `${offer} Mulai dari yang ratingnya tinggi tapi masih punya celah, mereka paling gampang diyakinkan.`]
    : ["Belum ada bisnis yang cocok dihubungi.", "Coba cek detail lebih banyak bisnis (tombol Cek di tab Semua pemain), atau cari wilayah lain."];
  const reasons: Verdict["reasons"] = [
    [n + (s.capped ? "+" : ""), "bisnis", s.top3_share >= 50 ? `tapi ${s.top3_share}% ulasan dipegang 3 teratas saja` : s.top3_share >= 30 ? `3 teratas memegang ${s.top3_share}% ulasan, sisanya kecil-kecil` : `ulasan tersebar, 3 teratas cuma ${s.top3_share}%`, "seberapa ramai pasarnya"],
    [s.avg_rating != null ? dec(s.avg_rating) : "-", "rating rata-rata", (s.avg_rating ?? 0) >= 4.5 ? "pelanggan di sini terbiasa puas, rating di bawah 4,5 terlihat kalah" : "masih banyak yang bisa dikalahkan lewat layanan lebih baik", "standar kualitas"],
    [nPros, "bisa dihubungi", gaps.length ? `punya minimal satu celah (${gaps.slice(0, 3).map((g) => g.key).join(", ")}) dan ada WhatsApp atau IG` : "punya celah dan ada kontaknya", "peluang untukmu"],
  ];
  return { headline, why, next, reasons };
}

export function keyPoints(R: Report, all: Biz[], rival: boolean): [string, string][] {
  const s = R.summary, d = R.digital, n = s.businesses, pros = all.filter((p) => isProspect(p, rival)).length;
  const crowd = s.top3_share >= 50 ? `Dikuasai segelintir pemain besar: 3 teratas memegang ${s.top3_share}% dari semua ulasan. Pendatang baru perlu pembeda yang jelas.`
    : s.top3_share >= 30 ? `Ada beberapa pemain kuat (3 teratas memegang ${s.top3_share}% ulasan), tapi masih ada ruang untuk tumbuh.`
    : `Persaingan merata, belum ada yang dominan. 3 teratas hanya memegang ${s.top3_share}% ulasan.`;
  const avg = s.avg_rating;
  const qual = avg == null ? "Belum cukup data rating." : avg >= 4.5 ? `Pelanggan di sini terbiasa dengan kualitas tinggi (rata-rata ${dec(avg)}). Rating di bawah 4,5 sudah terlihat kalah.` : `Rata-rata rating ${dec(avg)}. Masih bisa menang dengan layanan yang lebih baik.`;
  const opp = d.sampled ? `Dari yang dicek: ${100 - d.website}% belum punya website, ${100 - d.instagram}% belum terlihat aktif di IG, ${100 - d.whatsapp}% tanpa WhatsApp. ${pros} bisnis cocok jadi prospek.` : `${pros} bisnis cocok jadi prospek.`;
  const split = s.extra_businesses ? ` (${s.maps_businesses ?? n - s.extra_businesses} di Google Maps + ${s.extra_businesses} dari sumber lain)` : "";
  return [[`${n}${s.capped ? "+" : ""} bisnis${split}. Seberapa padat?`, crowd], ["Standar kualitas", qual], ["Peluang untukmu", opp]];
}

/** Laporan dianggap valid kalau punya summary dan digital; respons {error} atau bentuk aneh ditolak di sini, bukan crash di verdict(). */
export function isReport(x: unknown): x is Report {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return typeof r.industry === "string" && typeof r.area === "string" && !!r.summary && typeof r.summary === "object" && !!r.digital && typeof r.digital === "object";
}

/** Isi default supaya field yang hilang dari worker tidak membuat render gagal. */
export function normalizeReport(r: Report): Report {
  const all = Array.isArray(r.all) ? r.all : [];
  // leaders adalah salinan bisnis dari all; logo_key (diisi worker/backfill ke all) ikut dipakai di sini
  const logoOf = new Map(all.filter((p) => p.logo_key).map((p) => [leadKey(p), p.logo_key!]));
  const leaders = (Array.isArray(r.leaders) ? r.leaders : []).map((l) => (l.logo_key || !logoOf.has(leadKey(l)) ? l : { ...l, logo_key: logoOf.get(leadKey(l)) }));
  return {
    ...r,
    all,
    leaders,
    insights: Array.isArray(r.insights) ? r.insights : [],
    rating_buckets: Array.isArray(r.rating_buckets) ? r.rating_buckets : [],
    size_buckets: Array.isArray(r.size_buckets) ? r.size_buckets : [],
    summary: { ...r.summary, businesses: r.summary.businesses ?? 0, top3_share: r.summary.top3_share ?? 0 },
    digital: { ...r.digital, sampled: r.digital.sampled ?? 0, website: r.digital.website ?? 0, instagram: r.digital.instagram ?? 0, whatsapp: r.digital.whatsapp ?? 0, phone: r.digital.phone ?? 0 },
  };
}
