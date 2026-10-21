"use client";
// Riset pasar. Port dari templates/market.html. Semua data tetap dari service Python lewat rewrite Next.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./market.css";
import { useShell } from "@/components/Shell";
import {
  Biz, LEAD_ST, clean, dec, downloadCsv, draft, fmtPhone, gapsOf, getOffer, host, isDefaultOffer, isGem, isProspect, isWeak, leadKey, num, postJson,
  setOffer, waOf,
} from "@/lib/biz";

// ---------- tipe ----------
type Summary = { businesses: number; capped?: boolean; avg_rating?: number | null; median_reviews?: number; total_reviews?: number; top3_share: number };
type Digital = { sampled: number; website: number; instagram: number; whatsapp: number; phone: number };
type Quality = { brands: number; raw: number; kept: number; invalid_or_closed: number; out_of_area: number; duplicates_merged: number; chains: number };
type Report = {
  id?: number;
  industry: string;
  area: string;
  created: string;
  summary: Summary;
  digital: Digital;
  data_quality?: Quality | null;
  all?: Biz[];
  leaders?: Biz[];
  insights: string[];
  ai_strategy?: string[] | null;
  rating_buckets: [string, number][];
  size_buckets: [string, number][];
};
type ReportRow = { id: number; industry: string; area: string; created: string };
type Watch = { industry: string; area: string };
type CompareArea = {
  area: string; report_id: number; opportunity: number; businesses: number; capped?: boolean; avg_rating?: number | null; reviews_per_business: number;
  top3_share: number; gems: number; weak: number; website_pct: number; whatsapp_pct: number; prospects: number;
};
type Compare = { industry: string; areas: CompareArea[]; insights: string[] };
type View = { q: string; filter: string; sort: string; dir: 1 | -1; open: number | null };
type Tab = "sum" | "players" | "pros";

// ---------- ikon ----------
const Ico = ({ d }: { d: ReactNode }) => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {d}
  </svg>
);
const ICON = {
  web: <Ico d={<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>} />,
  ig: <Ico d={<><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></>} />,
  mail: <Ico d={<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>} />,
  pin: <Ico d={<><path d="M12 22s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>} />,
  search: <Ico d={<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>} />,
};

// ---------- tujuan riset ----------
const goalKey = (ind: string, area: string) => "goal:" + String(ind).trim().toLowerCase() + "|" + String(area).trim().toLowerCase();
const readGoal = (ind: string, area: string) => {
  try {
    return localStorage.getItem(goalKey(ind, area)) || "client";
  } catch {
    return "client";
  }
};
const writeGoal = (ind: string, area: string, g: string) => {
  try {
    localStorage.setItem(goalKey(ind, area), g);
  } catch {}
};
const SELF_WORDS = /agency|agensi|marketing|digital|web ?dev|website|branding|design|desain|seo|advertis|iklan|konsultan|freelance|software|studio kreatif|creative/i;

const FILTERS: [string, string, (p: Biz, rival: boolean) => boolean][] = [
  ["all", "Semua", () => true],
  ["prospect", "Prospek", (p, r) => isProspect(p, r)],
  ["followup", "Follow up", (p) => !!p.lead && !["deal", "tolak"].includes(p.lead.status || "")],
  ["wa", "Bisa WhatsApp", (p) => !!waOf(p)],
  ["web", "Punya website", (p) => !!p.website],
  ["noweb", "Tanpa website", (p) => !!p._detailed && !p.website],
  ["ig", "Punya IG", (p) => !!p.instagram],
  ["gem", "Hidden gem", isGem],
  ["weak", "Rating rendah, ramai", isWeak],
];

// ---------- kesimpulan bahasa awam ----------
type Verdict = { headline: string; why: string; next: [string, string]; reasons: [string | number, string, string, string][]; leaders?: Biz[] };
function verdictRival(R: Report, all: Biz[]): Verdict {
  const s = R.summary, d = R.digital, n = s.businesses;
  const leaders = (R.leaders || []).slice(0, 3), top = leaders[0];
  const weak = all.filter(isWeak);
  const noWeb = d.sampled ? 100 - d.website : null, noIg = d.sampled ? 100 - d.instagram : null;
  const crowd = s.top3_share >= 50 ? `dikuasai ${top ? clean(top.name) : "beberapa nama besar"}` : s.top3_share >= 30 ? "punya beberapa pesaing kuat, tapi belum ada yang menguasai" : "tidak punya pemimpin jelas, semua pesaing masih kecil";
  const headline = `Kamu punya ${n}${s.capped ? "+" : ""} pesaing ${R.industry} di ${R.area}. Pasar ini ${crowd}.`;
  let edge: string;
  if (weak.length) edge = `${weak.length} pesaing ramai tapi ratingnya rendah (mis. ${clean(weak[0].name)}). Pelanggan mereka tidak puas, itu yang paling gampang direbut.`;
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
function verdict(R: Report, all: Biz[], rival: boolean): Verdict {
  if (rival) return verdictRival(R, all);
  const s = R.summary, d = R.digital, n = s.businesses;
  const nPros = all.filter((p) => isProspect(p)).length;
  const weak = all.filter(isWeak).length;
  const noWeb = d.sampled ? 100 - d.website : null, noIg = d.sampled ? 100 - d.instagram : null;
  const small = R.size_buckets ? (R.size_buckets.find((b) => b[0] === "<50") || ["", 0])[1] : 0;
  const pctSmall = n ? Math.round(small / n * 100) : 0;
  const top = (R.leaders || [])[0];
  const crowd = s.top3_share >= 50 ? `dikuasai ${top ? clean(top.name).split(/\s[-|@·,(]\s?/)[0] : "satu dua nama besar"}` : s.top3_share >= 30 ? "ramai, ada beberapa nama besar tapi tidak ada yang menguasai" : "ramai dan merata, belum ada yang dominan";
  let gap: string | null, gapWhy: string, offerHint: string;
  if (noWeb != null && noWeb >= 30) { gap = "website"; gapWhy = `${noWeb}% belum punya website`; offerHint = "bikin website atau katalog online"; }
  else if (noIg != null && noIg >= 30) { gap = "Instagram"; gapWhy = `${noIg}% belum terlihat aktif di Instagram`; offerHint = "kelola dan rapikan Instagram"; }
  else if (pctSmall >= 40) { gap = "ulasan"; gapWhy = `${pctSmall}% masih punya kurang dari 50 ulasan`; offerHint = "bantu dapat ulasan dan tampil di Google"; }
  else if (weak) { gap = "layanan"; gapWhy = `${weak} bisnis ramai tapi ratingnya rendah`; offerHint = "perbaiki layanan dan reputasi"; }
  else { gap = null; gapWhy = "hampir semua sudah rapi secara digital"; offerHint = "tawarkan sesuatu yang benar-benar beda"; }
  const sat = noWeb != null && noWeb < 15 ? `Hampir semua sudah punya website (${d.website}%), jadi jualan "bikin website" akan sulit laku di sini.` : "";
  const headline = `Pasar ${R.industry} di ${R.area} ${crowd}.`;
  const why = gap ? `Celah paling besar ada di ${gap}: ${gapWhy}. ${sat}`.trim() : `${gapWhy.charAt(0).toUpperCase() + gapWhy.slice(1)}. ${sat}`.trim();
  const next: [string, string] = nPros
    ? [`Hubungi ${nPros} bisnis yang punya celah itu.`, `Tawarkan jasa ${offerHint}. Mulai dari yang ratingnya tinggi tapi ${gap || "digitalnya"} masih kosong, mereka paling gampang diyakinkan.`]
    : ["Belum ada bisnis yang cocok dihubungi.", "Coba cek detail lebih banyak bisnis (tombol Cek di tab Semua pemain), atau cari wilayah lain."];
  const reasons: Verdict["reasons"] = [
    [n + (s.capped ? "+" : ""), "bisnis", s.top3_share >= 50 ? `tapi ${s.top3_share}% ulasan dipegang 3 teratas saja` : s.top3_share >= 30 ? `3 teratas memegang ${s.top3_share}% ulasan, sisanya kecil-kecil` : `ulasan tersebar, 3 teratas cuma ${s.top3_share}%`, "seberapa ramai pasarnya"],
    [s.avg_rating != null ? dec(s.avg_rating) : "-", "rating rata-rata", (s.avg_rating ?? 0) >= 4.5 ? "pelanggan di sini terbiasa puas, rating di bawah 4,5 terlihat kalah" : "masih banyak yang bisa dikalahkan lewat layanan lebih baik", "standar kualitas"],
    [nPros, "bisa dihubungi", gap ? `punya celah ${gap} dan ada nomor WhatsApp atau IG` : "punya celah dan ada kontaknya", "peluang untukmu"],
  ];
  return { headline, why, next, reasons };
}
function keyPoints(R: Report, all: Biz[], rival: boolean): [string, string][] {
  const s = R.summary, d = R.digital, n = s.businesses, pros = all.filter((p) => isProspect(p, rival)).length;
  const crowd = s.top3_share >= 50 ? `Dikuasai segelintir pemain besar: 3 teratas memegang ${s.top3_share}% dari semua ulasan. Pendatang baru perlu pembeda yang jelas.`
    : s.top3_share >= 30 ? `Ada beberapa pemain kuat (3 teratas memegang ${s.top3_share}% ulasan), tapi masih ada ruang untuk tumbuh.`
    : `Persaingan merata, belum ada yang dominan. 3 teratas hanya memegang ${s.top3_share}% ulasan.`;
  const avg = s.avg_rating;
  const qual = avg == null ? "Belum cukup data rating." : avg >= 4.5 ? `Pelanggan di sini terbiasa dengan kualitas tinggi (rata-rata ${dec(avg)}). Rating di bawah 4,5 sudah terlihat kalah.` : `Rata-rata rating ${dec(avg)}. Masih bisa menang dengan layanan yang lebih baik.`;
  const opp = d.sampled ? `${100 - d.website}% bisnis yang dicek belum punya website dan ${100 - d.instagram}% belum terlihat aktif di IG. ${pros} bisnis cocok jadi prospek.` : `${pros} bisnis cocok jadi prospek.`;
  return [[`${n}${s.capped ? "+" : ""} bisnis. Seberapa padat?`, crowd], ["Standar kualitas", qual], ["Peluang untukmu", opp]];
}

// skor kekuatan: rata-rata Bayesian, rating ditarik ke rata-rata pasar sampai ulasannya cukup banyak
function powerScores(all: Biz[]) {
  const rated = all.filter((p) => p.rating);
  const C = rated.reduce((s, p) => s + (p.rating || 0), 0) / Math.max(rated.length, 1);
  const sorted = rated.map((p) => p.reviews || 0).sort((a, b) => a - b);
  const m = Math.max(sorted[Math.floor(sorted.length / 2)] || 1, 10);
  rated.forEach((p) => { const v = p.reviews || 0; p._power = (v / (v + m)) * (p.rating || 0) + (m / (v + m)) * C; });
}

const STEP: [string, string][] = [["1/5", "Cari di Google Maps"], ["2/5", "Ambil telepon dan website"], ["3/5", "Cari akun IG"], ["4/5", "Susun laporan"], ["5/5", "Simpan"]];

// =====================================================================
export default function MarketPage() {
  return (
    <Suspense fallback={<div className="wrap" />}>
      <Market />
    </Suspense>
  );
}

function Market() {
  const { toast, notify, askNotify, openBusiness } = useShell();
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"one" | "cmp">("one");
  const [goal, setGoal] = useState<"client" | "rival">("client");
  const [industry, setIndustry] = useState("");
  const [area, setArea] = useState("");
  const [recent, setRecent] = useState<ReportRow[]>([]);
  const [current, setCurrent] = useState<number | "cmp" | null>(null);
  const [R, setR] = useState<Report | null>(null);
  const [cmp, setCmp] = useState<Compare | null>(null);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [status, setStatus] = useState<ReactNode>(null);
  const [running, setRunning] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const wasRunning = useRef(false);
  const pending = useRef<{ industry: string; areas: string[] } | null>(null);
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);
  const [rival, setRival] = useState(false);

  const show = useCallback(async (id: number) => {
    setCurrent(id);
    setCmp(null);
    const rep: Report = await (await fetch("/market/report?id=" + id)).json();
    setR(rep);
    setRival(readGoal(rep.industry, rep.area) === "rival");
    setWatches(await (await fetch("/market/watches")).json());
  }, []);
  const loadRecent = useCallback(async (selectId?: number | null, force = false) => {
    const list: ReportRow[] = await (await fetch("/market/reports")).json();
    setRecent(list);
    setLoadedOnce(true);
    const id = selectId || (list[0] && list[0].id);
    if (id && (force || selectId || !current)) show(id);
  }, [show, current]);

  // ---------- jalannya riset ----------
  const poll = useCallback(async () => {
    const j = await (await fetch("/log")).json();
    const log: string = j.log || "";
    setRunning(!!j.running);
    if (j.running) {
      setStatus(<Progress log={log} started={j.started} onStop={() => postJson("/stop", {})} />);
      setTimeout(poll, 1500);
    } else if (wasRunning.current && j.stopped) {
      setStatus("Riset dihentikan.");
    } else if (wasRunning.current) {
      if (pending.current && /COMPARE_DONE/.test(log)) {
        setStatus("Selesai.");
        notify("Perbandingan wilayah selesai", pending.current.industry);
        const c = await (await fetch("/market/compare?industry=" + encodeURIComponent(pending.current.industry) + "&areas=" + encodeURIComponent(pending.current.areas.join(";")))).json();
        setCmp(c);
        setR(null);
        setCurrent("cmp");
        loadRecent();
      } else {
        const m = [...log.matchAll(/REPORT_ID=(\d+)/g)].pop();
        setStatus(m ? "Selesai." : "Gagal: " + (log.trim().split("\n").filter((l) => !/^\[selesai/.test(l)).slice(-1)[0] || ""));
        if (m) notify("Riset selesai", "Laporan sudah siap dibuka.");
        loadRecent(m ? +m[1] : null, true);
      }
    }
    wasRunning.current = !!j.running;
  }, [loadRecent, notify]);

  useEffect(() => {
    const id = params.get("id");
    loadRecent(id ? +id : null);
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let res;
    if (mode === "cmp") {
      pending.current = { industry, areas: area.split(/[;\n]/).map((s) => s.trim()).filter(Boolean) };
      res = await postJson("/market/compare/run", pending.current);
    } else {
      pending.current = null;
      writeGoal(industry, area, goal);
      res = await postJson("/market/run", { industry, area });
    }
    if (!res.ok) { setStatus(res.j.error as string); return; }
    askNotify();
    poll();
  };

  const selfWarn = goal === "client" && SELF_WORDS.test(industry);

  return (
    <div className="wrap">
      <h1>Peta pasar industri apa pun.</h1>
      <p className="lead">Scraping langsung dari Google Maps dan website bisnis. Data dibersihkan, tanpa duplikat. Tanpa login.</p>
      <div className="mode">
        <button className={mode === "one" ? "on" : ""} onClick={() => setMode("one")}>Satu wilayah</button>
        <button className={mode === "cmp" ? "on" : ""} onClick={() => setMode("cmp")}>Bandingkan wilayah</button>
      </div>
      <div className="goal">
        <label className={goal === "client" ? "on" : ""}>
          <input type="radio" name="goal" value="client" checked={goal === "client"} onChange={() => setGoal("client")} />
          <div><b>Cari calon klien</b><span>Isi industri bisnis yang mau kamu tawari. Contoh: kamu agency, isi &quot;coffee shop&quot; atau &quot;klinik gigi&quot;.</span></div>
        </label>
        <label className={goal === "rival" ? "on" : ""}>
          <input type="radio" name="goal" value="rival" checked={goal === "rival"} onChange={() => setGoal("rival")} />
          <div><b>Pelajari pesaing</b><span>Isi industri bisnismu sendiri. Contoh: kamu agency, isi &quot;digital agency&quot;. Hasilnya pesaing, bukan klien.</span></div>
        </label>
      </div>
      {selfWarn && (
        <div className="goalwarn" style={{ display: "block" }}>
          &quot;{industry}&quot; terdengar seperti bisnismu sendiri. Bisnis di industri ini akan dianggap calon klien. Kalau maksudmu mau lihat pesaing,{" "}
          <button onClick={() => setGoal("rival")}>ganti ke Pelajari pesaing</button>.
        </div>
      )}
      <form className="search" onSubmit={submit}>
        <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industri, mis. coffee shop, salon, digital agency" required autoComplete="off" />
        <span className="sep" />
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder={mode === "cmp" ? "Kemang Jakarta; Senopati Jakarta; Tebet Jakarta" : "Wilayah, mis. Kemang Jakarta"} required autoComplete="off" />
        <button className="btn" disabled={running}>{mode === "cmp" ? "Bandingkan" : "Riset"}</button>
      </form>
      <div className="status">{status}</div>
      <div className="recent">
        {recent.map((r) => (
          <button key={r.id} className={"chip" + (current === r.id ? " on" : "")} onClick={() => { router.replace("/market?id=" + r.id); show(r.id); }}>
            {r.industry} · {r.area}
          </button>
        ))}
      </div>
      <div id="report">
        {cmp ? (
          <CompareView c={cmp} onOpen={(id) => show(id)} />
        ) : R ? (
          <ReportView
            key={R.id ?? current?.toString()}
            R={R}
            rival={rival}
            current={typeof current === "number" ? current : null}
            watched={watches.some((w) => w.industry.toLowerCase() === R.industry.toLowerCase() && w.area.toLowerCase() === R.area.toLowerCase())}
            onSwapGoal={() => { writeGoal(R.industry, R.area, rival ? "client" : "rival"); setRival(!rival); }}
            toast={toast}
            openBusiness={openBusiness}
            rerender={rerender}
          />
        ) : loadedOnce && !recent.length ? (
          <div className="empty">Belum ada riset. Isi industri dan wilayah di atas.</div>
        ) : null}
      </div>
    </div>
  );
}

function Progress({ log, started, onStop }: { log: string; started?: number; onStop: () => void }) {
  const [stopped, setStopped] = useState(false);
  const m = [...log.matchAll(/\[(\d)\/5\]/g)].pop(), c = [...log.matchAll(/\[compare\] wilayah (\d+)\/(\d+): ([^\n]*)/g)].pop();
  const cur = m ? +m[1] : 0;
  let pct = cur ? (cur - 1) / 5 * 100 + 10 : 3;
  if (c) pct = ((+c[1] - 1) + Math.max(cur - 1, 0) / 5) / +c[2] * 100;
  const sec = started ? Math.round(Date.now() / 1000 - started) : 0;
  const el = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  return (
    <div className="prog">
      <div className="prog-h">
        <b>{c ? `Wilayah ${c[1]} dari ${c[2]}: ${c[3]}` : "Riset sedang berjalan"}</b>
        <span className="mono" style={{ color: "var(--muted)" }}>{el}</span>
        <button className="btn ghost" disabled={stopped} onClick={() => { setStopped(true); onStop(); }}>Hentikan</button>
      </div>
      <div className="prog-bar"><i style={{ width: Math.min(pct, 97) + "%" }} /></div>
      <ol>
        {STEP.map(([k, v], i) => (
          <li key={k} className={i + 1 < cur ? "done" : i + 1 === cur ? "now" : ""}>{v}</li>
        ))}
      </ol>
      <div className="eta">Biasanya 2 sampai 4 menit per wilayah. Boleh pindah tab atau halaman, kamu akan diberi tahu saat selesai.</div>
    </div>
  );
}

// =====================================================================
function ReportView({
  R, rival, current, watched, onSwapGoal, toast, openBusiness, rerender,
}: {
  R: Report; rival: boolean; current: number | null; watched: boolean; onSwapGoal: () => void; toast: (m: string) => void;
  openBusiness: ReturnType<typeof useShell>["openBusiness"]; rerender: () => void;
}) {
  const all = useMemo(() => R.all || [], [R]);
  const [tab, setTab] = useState<Tab>("sum");
  const [view, setView] = useState<View>({ q: "", filter: "all", sort: "reviews", dir: -1, open: null });
  const [isWatched, setWatched] = useState(watched);
  const [offer, setOfferState] = useState("");
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => setWatched(watched), [watched]);
  useEffect(() => setOfferState(getOffer()), []);
  useEffect(() => { powerScores(all); }, [all]);

  const s = R.summary, d = R.digital, q = R.data_quality;
  const nPros = all.filter((p) => isProspect(p, rival)).length;
  const v = verdict(R, all, rival);

  const goTab = (t: Tab) => {
    setTab(t);
    if (t === "pros") setView((x) => ({ ...x, filter: "prospect", sort: "lead", dir: -1 }));
    else if (t === "players" && view.filter === "prospect") setView((x) => ({ ...x, filter: "all", sort: "reviews", dir: -1 }));
  };
  const setFilter = (f: string) => setView((x) => ({ ...x, filter: f, open: null, ...(["prospect", "followup"].includes(f) ? { sort: "lead", dir: -1 } : {}) }));
  const sortBy = (k: string) => setView((x) => ({ ...x, dir: x.sort === k ? (-x.dir as 1 | -1) : k === "name" || k === "dist" ? 1 : -1, sort: k }));

  const filtered = useMemo(() => {
    const fn = FILTERS.find((f) => f[0] === view.filter)![2];
    let rows = all.filter((p) => fn(p, rival));
    if (view.q) rows = rows.filter((p) => [p.name, p.address, p.category, p.instagram, p.website, p.phone].join(" ").toLowerCase().includes(view.q));
    const key: Record<string, (p: Biz) => number | string> = {
      name: (p) => clean(p.name).toLowerCase(), rating: (p) => (p.rating || 0) * 1e6 + (p.reviews || 0), reviews: (p) => p.reviews || 0,
      rpm: (p) => p.reviews_per_month ?? -1, lead: (p) => p.lead_score ?? -1, website: (p) => (p.website ? 1 : 0), instagram: (p) => (p.instagram ? 1 : 0), dist: (p) => p.dist_km ?? 999,
    };
    const k = key[view.sort] || key.reviews;
    return [...rows].sort((a, b) => { const x = k(a), y = k(b); return (x > y ? 1 : x < y ? -1 : 0) * view.dir; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, view, rival, offer]);

  const toggleWatch = async () => {
    const on = !isWatched;
    setWatched(on);
    await postJson("/market/watch", { industry: R.industry, area: R.area, on, last_run: R.created });
  };
  const exportCsv = () => {
    const cols = ["name", "lead_score", "lead_reasons", "lead_status", "category", "rating", "reviews", "reviews_per_month", "phone", "website", "instagram", "emails", "address", "dist_km", "maps_url"];
    downloadCsv(`${R.industry}-${R.area}.csv`.replace(/\s+/g, "-").toLowerCase(), cols,
      filtered.map((p) => cols.map((c) => (c === "name" ? clean(p.name) : c === "lead_status" ? p.lead?.status : (p as Record<string, unknown>)[c]))));
  };
  const setLead = async (p: Biz, status: string) => {
    const { ok } = await postJson("/market/lead", { key: leadKey(p), name: clean(p.name), status });
    if (ok) p.lead = { status, updated: new Date().toISOString() };
    rerender();
  };
  const checkDetail = async (p: Biz) => {
    const { ok, j } = await postJson("/market/detail", { report_id: current, key: leadKey(p) });
    if (!ok) { toast((j.error as string) || "Gagal"); return; }
    Object.assign(p, j);
    toast(`Kontak ${clean(p.name)} diperbarui`);
    rerender();
  };
  const bars = (rows: [string, number][]) => {
    const mx = Math.max(1, ...rows.map((r) => r[1]));
    return rows.map(([k, val]) => (
      <div className="bar" key={k}><span>{k}</span><div className="t"><div className="fill" style={{ width: (val / mx) * 100 + "%" }} /></div><span className="n">{val}</span></div>
    ));
  };

  return (
    <>
      <div className="rh">
        <div>
          <h2>{R.industry} · {R.area}</h2>
          <div className="meta">
            Discrape {new Date(R.created).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} dari Google Maps ·{" "}
            {rival ? <>dilihat sebagai <b>pesaing</b></> : <>dilihat sebagai <b>calon klien</b></>}{" "}
            <button className="mini" style={{ marginLeft: 6 }} onClick={onSwapGoal}>{rival ? "ubah jadi calon klien" : "ubah jadi pesaing"}</button>
          </div>
        </div>
        <div className="acts">
          <button className={"btn ghost watch" + (isWatched ? " on" : "")} onClick={toggleWatch}>{isWatched ? "✓ Dipantau mingguan" : "+ Pantau mingguan"}</button>
          <button className="btn ghost" onClick={exportCsv}>Ekspor CSV</button>
        </div>
      </div>
      <div className="rtabs" ref={tabsRef}>
        <button className={tab === "sum" ? "on" : ""} onClick={() => goTab("sum")}>Ringkasan</button>
        <button className={tab === "players" ? "on" : ""} onClick={() => goTab("players")}>Semua pemain<b>{all.length}</b></button>
        {!rival && <button className={tab === "pros" ? "on" : ""} onClick={() => goTab("pros")}>Prospek<b>{nPros}</b></button>}
      </div>

      {tab === "sum" && (
        <section>
          <div className="verdict">
            <div className="tag">{rival ? "Kesimpulan: posisi kamu di antara pesaing" : "Kesimpulan: peluang dapat klien"}</div>
            <h3>{v.headline}</h3>
            <p className="why">{v.why}</p>
            {!rival && SELF_WORDS.test(R.industry) && (
              <p className="why" style={{ color: "var(--warn)", marginTop: 8 }}>
                Hati-hati: &quot;{R.industry}&quot; terdengar seperti bisnismu sendiri. Kalau iya, bisnis di daftar ini adalah pesaingmu, bukan calon klien.{" "}
                <button className="mini" onClick={onSwapGoal}>Ubah jadi pesaing</button>
              </p>
            )}
            <div className="next">
              <div><b>Langkah berikutnya:</b> {v.next[0]}<br /><span>{v.next[1]}</span></div>
              {rival
                ? (v.leaders || []).map((l) => <a key={l.name} className="btn ghost" href={l.maps_url} target="_blank">{clean(l.name)}</a>)
                : nPros > 0 && <button className="btn" onClick={() => { goTab("pros"); window.scrollTo({ top: (tabsRef.current?.offsetTop || 0) - 20, behavior: "smooth" }); }}>Lihat {nPros} prospek</button>}
            </div>
          </div>
          <div className="reasons">
            {v.reasons.map(([big, unit, txt, m]) => (
              <div className="reason" key={unit}><div className="big">{String(big)}<small>{unit}</small></div><p>{txt}</p><div className="m">{m}</div></div>
            ))}
          </div>
          <details className="raw">
            <summary>Lihat angka lengkap dan detail teknis</summary>
            <div className="key3">{keyPoints(R, all, rival).map(([k, val]) => <div key={k}><small>{k}</small><p>{val}</p></div>)}</div>
            <div className="stats">
              <div className="stat"><div className="l">Bisnis</div><div className="v">{s.businesses}{s.capped ? "+" : ""}</div><div className="s">{q ? q.brands + " brand" : "yang muncul di Maps"}{s.capped ? ", bisa lebih banyak" : ""}</div></div>
              <div className="stat"><div className="l">Rating rata-rata</div><div className="v">{s.avg_rating ?? "-"}</div><div className="s">median {num(s.median_reviews)} ulasan</div></div>
              <div className="stat"><div className="l">Total ulasan</div><div className="v">{num(s.total_reviews)}</div><div className="s">tanda seberapa ramai pasarnya</div></div>
              <div className="stat"><div className="l">Porsi 3 teratas</div><div className="v">{s.top3_share}%</div><div className="s">{s.top3_share >= 50 ? "dikuasai pemain besar" : s.top3_share >= 30 ? "ada beberapa pemain kuat" : "persaingan merata"}</div></div>
              <div className="stat"><div className="l">Punya website</div><div className="v">{d.website}%</div><div className="s">IG {d.instagram}%, dari {d.sampled} dicek</div></div>
              <div className="stat"><div className="l">Bisa WhatsApp</div><div className="v">{d.whatsapp}%</div><div className="s">dari sampel detail</div></div>
            </div>
            <div className="cols">
              <div>
                {R.ai_strategy && <div className="card ai" style={{ marginBottom: 12 }}><h3>Strategi</h3><ul>{R.ai_strategy.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                <div className="card"><h3>Temuan</h3><ul>{R.insights.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              </div>
              <div className="card">
                <h3>Sebaran</h3>
                <div className="dist">
                  <div><div className="sub" style={{ marginBottom: 4 }}>Rating</div>{bars(R.rating_buckets)}</div>
                  <div><div className="sub" style={{ marginBottom: 4 }}>Jumlah ulasan</div>{bars(R.size_buckets)}</div>
                </div>
                {q && (
                  <div className="quality">
                    <b>Kualitas data:</b> {q.raw} hasil mentah, {q.kept} disimpan. Dibuang {q.invalid_or_closed} tidak valid/tutup, {q.out_of_area} di luar wilayah,{" "}
                    {q.duplicates_merged} duplikat digabung. {q.chains} brand punya lebih dari satu cabang.
                  </div>
                )}
              </div>
            </div>
          </details>
        </section>
      )}

      {tab === "players" && <Charts R={R} all={all} rival={rival} />}

      {tab === "pros" && (
        <Wizard R={R} all={all} offer={offer} onOffer={(o) => { setOffer(o); setOfferState(o); }} setLead={setLead} toast={toast} />
      )}

      {tab !== "sum" && (
        <div className="tcard">
          {tab !== "pros" && (
            <div className="tools">
              <label className="q">{ICON.search}<input value={view.q} onChange={(e) => setView({ ...view, q: e.target.value.toLowerCase() })} placeholder="Cari nama, alamat, kategori, @ig, website" /></label>
              <div className="filters">
                {FILTERS.filter(([k]) => !(rival && (k === "prospect" || k === "followup"))).map(([k, l, fn]) => (
                  <button key={k} className={"f" + (k === view.filter ? " on" : "")} onClick={() => setFilter(k)}>{l}<b>{all.filter((p) => fn(p, rival)).length}</b></button>
                ))}
              </div>
              <span className="count">{filtered.length} dari {all.length} bisnis</span>
            </div>
          )}
          {tab === "pros" && <div className="pros-hint">Diurutkan dari skor prospek tertinggi. Kelola follow up semua wilayah di <Link href="/prospects">papan Prospek</Link>.</div>}
          {(view.filter === "prospect" || view.open != null) && (
            <div className="offer">Penawaranmu untuk draf pesan:
              <input value={offer} onChange={(e) => { setOffer(e.target.value); setOfferState(e.target.value); }} placeholder="mis. bikin website dan katalog online" />
            </div>
          )}
          <div className="tw">
            <table>
              <thead>
                <tr>
                  {([["name", "Bisnis", true], ["rating", "Google Maps", true], ["rpm", "Ulasan/bln", true], ["", "Telepon", false], ["website", "Website", true], ["instagram", "Instagram", true], ["", "Email", false], ["dist", "Jarak", true], ["", "Peta", false]] as [string, string, boolean][]).map(([k, l, sortable], i) => (
                    <th key={i} className={sortable ? "s" : ""} onClick={sortable ? () => sortBy(k) : undefined}>
                      {l}
                      {sortable && (k === view.sort || (view.sort === "reviews" && k === "rating")) && <span className="ar">{view.dir > 0 ? "▲" : "▼"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!filtered.length ? (
                  <tr><td colSpan={9} className="empty">Tidak ada bisnis yang cocok.</td></tr>
                ) : filtered.map((p, i) => (
                  <Row key={leadKey(p) || i} p={p} i={i} R={R} rival={rival} open={view.open === i} onToggleDraft={() => setView({ ...view, open: view.open === i ? null : i })}
                    onOpen={() => openBusiness(p, { industry: R.industry, area: R.area, report_id: current, onChange: rerender })}
                    onCheck={() => checkDetail(p)} onLead={(st) => setLead(p, st)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab !== "sum" && (
        <div className="legal">Semua baris hasil scraping Google Maps dan website bisnis. Kolom kosong berarti tidak tercantum di sumber, atau detailnya belum diambil (ditandai &quot;belum dicek&quot;). Hubungi secukupnya, satu pesan, jangan spam.</div>
      )}
    </>
  );
}

function Row({ p, i, R, rival, open, onToggleDraft, onOpen, onCheck, onLead }: {
  p: Biz; i: number; R: Report; rival: boolean; open: boolean; onToggleDraft: () => void; onOpen: () => void; onCheck: () => void; onLead: (st: string) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState("Salin");
  const g = gapsOf(p), wa = waOf(p);
  const msg = draft(p, R.industry, R.area);
  const no = <span className="none">-</span>;
  const unk = <button className="chk" disabled={checking} title="Ambil telepon, website, dan IG dari Google Maps" onClick={async () => { setChecking(true); await onCheck(); setChecking(false); }}>{checking ? "Mengecek…" : "Cek"}</button>;
  const ls = p.lead_score;
  return (
    <>
      <tr>
        <td className="biz">
          <div className="nm">
            <button className="nm-btn" onClick={onOpen}>{clean(p.name)}</button>{" "}
            {isGem(p) && <span className="badge g">hidden gem</span>}
            {isWeak(p) && <span className="badge r">rating rendah</span>}
            {(p.branches_in_area ?? 0) > 1 && <span className="badge">{p.branches_in_area} cabang</span>}
            {isProspect(p, rival) && <span className="badge w">prospek</span>}
          </div>
          <div className="sub">{clean(p.category || "")}{p.price ? " · " + p.price : ""}</div>
          <div className="sub">{clean(p.address || "")}</div>
          {ls != null && (
            <div className="lrow">
              <span className={"ls" + (ls >= 60 ? " hi" : "")} title={(p.lead_reasons || []).join(", ")}>{ls}</span>
              <span className="sub">{(p.lead_reasons || []).slice(0, 3).join(", ")}</span>
              <select className={p.lead ? "set" : ""} value={p.lead?.status || ""} onChange={(e) => e.target.value && onLead(e.target.value)}>
                <option value="">status</option>
                {LEAD_ST.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
          )}
          {g && g.length > 0 && <button className="mini" onClick={onToggleDraft}>{open ? "Tutup draf" : "Draf pesan"}</button>}
        </td>
        <td className="rating">{p.rating ? <><span className="st">★</span> <b>{dec(p.rating)}</b></> : no}<div className="rv">{num(p.reviews)} ulasan</div></td>
        <td>{p.reviews_per_month != null ? (p.reviews_per_month > 0 ? <span style={{ color: "var(--accent)" }}>+{p.reviews_per_month}</span> : p.reviews_per_month) : no}</td>
        <td>{p.phone ? <><div className="mono">{fmtPhone(p)}</div>{wa && <a className="wa" href={wa + "?text=" + encodeURIComponent(msg)} target="_blank">WhatsApp</a>}</> : p._detailed ? no : unk}</td>
        <td>{p.website ? <a className="lnk" href={p.website} target="_blank">{ICON.web}{host(p.website)}</a> : p._detailed ? no : unk}</td>
        <td>{p.instagram ? <><a className="lnk" href={"https://instagram.com/" + p.instagram} target="_blank">{ICON.ig}@{p.instagram}</a>{p.instagram_shared && <div className="sub">akun brand</div>}</> : p._detailed ? no : unk}</td>
        <td>{(p.emails || []).length ? p.emails!.slice(0, 2).map((e, k) => <span key={e}>{k > 0 && <br />}<a className="lnk" href={"mailto:" + e}>{ICON.mail}{e}</a></span>) : no}</td>
        <td className="mono">{p.dist_km != null ? dec(p.dist_km) + " km" : no}</td>
        <td><a className="lnk" href={p.maps_url} target="_blank">{ICON.pin}Buka</a></td>
      </tr>
      {open && (
        <tr className="draft"><td colSpan={9}><div className="dbox"><p>{msg}</p>
          <button className="btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(msg); setCopied("Tersalin ✓"); } catch { setCopied("Gagal"); } }}>{copied}</button>
        </div></td></tr>
      )}
    </>
  );
}

// ---------- panduan hubungi prospek, satu per satu ----------
function Wizard({ R, all, offer, onOffer, setLead, toast }: { R: Report; all: Biz[]; offer: string; onOffer: (o: string) => void; setLead: (p: Biz, st: string) => Promise<void>; toast: (m: string) => void }) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [copyTxt, setCopyTxt] = useState("Salin pesan");
  const [busy, setBusy] = useState(false);
  const [offerIn, setOfferIn] = useState("");
  const total = all.filter((p) => isProspect(p)).length;
  const done = all.filter((p) => isProspect(p) && p.lead && p.lead.status).length;
  const queue = all.filter((p) => isProspect(p)).filter((p) => !p.lead || !p.lead.status).filter((p) => !skipped.has(leadKey(p))).sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0));
  const prog = (
    <div className="prog"><span>{done} dari {total} sudah dihubungi</span><div className="t"><div className="fill" style={{ width: (total ? (done / total) * 100 : 0) + "%" }} /></div><span>{queue.length} tersisa</span></div>
  );
  if (!total) return <div className="wiz">{prog}<div className="done"><h4>Belum ada yang bisa dihubungi.</h4><p>Klik tombol <b>Cek</b> di tab Semua pemain untuk mengambil nomor dan IG beberapa bisnis, nanti prospeknya muncul di sini.</p></div></div>;
  if (!queue.length) return <div className="wiz">{prog}<div className="done"><h4>Semua prospek sudah kamu hubungi.</h4><p>Besok atau lusa cek siapa yang balas, lalu tandai Tertarik atau Deal di papan Prospek.</p><Link className="btn" href="/prospects">Buka papan Prospek</Link></div></div>;
  const p = queue[0], wa = waOf(p), g = gapsOf(p) || [];
  const text = msg != null && key === leadKey(p) ? msg : draft(p, R.industry, R.area);
  const how = wa ? "Klik tombol hijau. WhatsApp terbuka dengan pesan ini sudah terisi, tinggal tekan kirim."
    : p.instagram ? "Bisnis ini tidak ada nomor WhatsApp. Salin pesannya, buka Instagram-nya, lalu kirim lewat DM."
    : "Salin pesannya lalu kirim lewat kontak yang kamu temukan.";
  let n = 0;
  const defOffer = isDefaultOffer();
  void offer;
  return (
    <div className="wiz">
      {prog}
      {defOffer && (
        <div className="step"><div className="n">{++n}</div><div><b>Tulis dulu jasa yang kamu tawarkan</b><span>Satu kalimat saja, dipakai otomatis di semua pesan.</span>
          <input className="offerin" value={offerIn} onChange={(e) => setOfferIn(e.target.value)} onBlur={() => { if (offerIn) { onOffer(offerIn); setMsg(null); } }} placeholder="mis. bikin website dan katalog online, atau kelola Instagram" /></div></div>
      )}
      <div className="step"><div className="n">{++n}</div><div><b>Kirim pesan ke bisnis ini</b><span>{how}</span></div></div>
      <div className="who">
        <h4>{clean(p.name)}</h4>
        <div className="sub">{p.rating ? "★ " + dec(p.rating) + " · " : ""}{num(p.reviews)} ulasan{p.category ? " · " + clean(p.category) : ""}</div>
        <div className="gap">
          {g.map((x) => <span key={x} className="badge w">{x}</span>)}
          {p.instagram && <a className="lnk" href={"https://instagram.com/" + p.instagram} target="_blank">@{p.instagram}</a>}
          <a className="lnk" href={p.maps_url} target="_blank">Maps</a>
        </div>
      </div>
      <textarea className="msg" value={text} onChange={(e) => { setKey(leadKey(p)); setMsg(e.target.value); }} />
      <div className="acts2">
        {wa && <a className="btn wa" href={wa + "?text=" + encodeURIComponent(text)} target="_blank">Kirim via WhatsApp</a>}
        <button className="btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopyTxt("Tersalin"); } catch { setCopyTxt("Gagal"); } }}>{copyTxt}</button>
        <span className="sp" />
        <button className="btn ghost" onClick={() => { setSkipped(new Set([...skipped, leadKey(p)])); setMsg(null); }}>Lewati</button>
        <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await setLead(p, "dihubungi"); setMsg(null); toast(`${clean(p.name)} ditandai dihubungi`); setBusy(false); }}>Sudah dikirim, lanjut</button>
      </div>
      <div className="step" style={{ margin: "14px 0 0" }}><div className="n">{++n}</div><div><b>Setelah kirim, klik &quot;Sudah dikirim, lanjut&quot;</b><span>Bisnis ini ditandai Dihubungi dan prospek berikutnya muncul. Kalau nanti dibalas, ubah statusnya di papan Prospek.</span></div></div>
    </div>
  );
}

// ---------- charts ----------
function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; html: ReactNode } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const show = (e: React.MouseEvent, html: ReactNode) => {
    const w = ref.current?.offsetWidth || 200, h = ref.current?.offsetHeight || 60;
    setTip({ x: Math.min(e.clientX + 14, innerWidth - w - 8), y: Math.min(e.clientY + 14, innerHeight - h - 8), html });
  };
  const el = <div id="tip" ref={ref} style={{ opacity: tip ? 1 : 0, left: tip?.x, top: tip?.y }}>{tip?.html}</div>;
  return { show, hide: () => setTip(null), el };
}
const tipHtml = (p: Biz) => (
  <><b>{clean(p.name)}</b><br />★ {dec(p.rating ?? "-")} · {num(p.reviews)} ulasan{p._power ? <><br />Skor kekuatan {dec(p._power.toFixed(2))}</> : null}{p.category ? <><br />{clean(p.category)}</> : null}</>
);

function Charts({ R, all, rival }: { R: Report; all: Biz[]; rival: boolean }) {
  const [rankBy, setRankBy] = useState<"power" | "reviews" | "rating">("power");
  const tip = useTip();
  powerScores(all);
  const rated = all.filter((p) => p.rating);
  const keyF: Record<string, (p: Biz) => number> = { power: (p) => p._power || 0, reviews: (p) => p.reviews || 0, rating: (p) => (p.rating || 0) * 1e6 + (p.reviews || 0) };
  const valF: Record<string, (p: Biz) => number> = { power: (p) => p._power || 0, reviews: (p) => p.reviews || 0, rating: (p) => p.rating || 0 };
  const top = [...rated].sort((a, b) => keyF[rankBy](b) - keyF[rankBy](a)).slice(0, 10);
  const lo = rankBy === "reviews" ? 0 : Math.min(...top.map(valF[rankBy])) - (rankBy === "rating" ? 0.3 : 0.15);
  const hi = Math.max(...top.map(valF[rankBy]));

  const cats: Record<string, number> = {};
  all.forEach((p) => { const c = clean(p.category) || "Lainnya"; cats[c] = (cats[c] || 0) + 1; });
  const cr = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const topCats = cr.slice(0, 6), rest = cr.slice(6).reduce((s, x) => s + x[1], 0);
  if (rest) topCats.push(["Lainnya", rest]);
  const mxCat = Math.max(1, ...topCats.map((r) => r[1]));
  const dd = R.digital;

  return (
    <section>
      {tip.el}
      <div className="viz">
        <div className="ch">
          <div className="ch-h"><h3>Top 10</h3>
            <div className="seg">
              {(["power", "reviews", "rating"] as const).map((k) => <button key={k} className={rankBy === k ? "on" : ""} onClick={() => setRankBy(k)}>{{ power: "Skor kekuatan", reviews: "Ulasan", rating: "Rating" }[k]}</button>)}
            </div>
          </div>
          <div className="rank">
            {top.map((p, i) => {
              const w = hi > lo ? ((valF[rankBy](p) - lo) / (hi - lo)) * 100 : 100;
              const label = rankBy === "reviews" ? num(p.reviews) : rankBy === "rating" ? "★ " + dec(p.rating) : dec((p._power || 0).toFixed(2));
              const sub = rankBy === "reviews" ? "★ " + dec(p.rating) : rankBy === "power" ? "★ " + dec(p.rating) + " · " + num(p.reviews) : num(p.reviews) + " ulasan";
              return (
                <a key={i} className="rk" href={p.maps_url} target="_blank" onMouseMove={(e) => tip.show(e, tipHtml(p))} onMouseLeave={tip.hide}>
                  <span className="no">{i + 1}</span><span className="n">{clean(p.name)}</span>
                  <span className="tr"><span className="b" style={{ width: Math.max(w, 1.5) + "%" }} /></span><span className="v">{label}<small>{sub}</small></span>
                </a>
              );
            })}
          </div>
          <div className="legal">
            {rankBy === "power" ? "Skor kekuatan = rating yang disesuaikan jumlah ulasan (rata-rata Bayesian). Rating tinggi dari sedikit ulasan tidak langsung jadi juara."
              : rankBy === "rating" ? "Diurutkan dari rating; seri dipecah dengan jumlah ulasan. Sumbu tidak mulai dari nol supaya selisih terlihat." : ""}
          </div>
        </div>
        <div className="ch">
          <div className="ch-h"><h3>Peta posisi</h3><span className="hint">rating vs jumlah ulasan</span></div>
          <Scatter all={all} rival={rival} tip={tip} />
          <div className="legend"><span><i style={{ background: "var(--c1)" }} />Prospek (bagus, lemah digital)</span><span><i style={{ background: "var(--c2)" }} />Bisnis lain</span></div>
        </div>
      </div>
      <div className="viz2">
        <div className="ch">
          <div className="ch-h"><h3>Komposisi kategori</h3><span className="hint">jumlah bisnis</span></div>
          {topCats.map(([k, val]) => <div className="hb" key={k}><span className="n">{k}</span><span className="tr"><span className="b" style={{ width: (val / mxCat) * 100 + "%" }} /></span><span className="v">{val}</span></div>)}
        </div>
        <div className="ch">
          <div className="ch-h"><h3>Kematangan digital</h3><span className="hint">dari {dd.sampled} bisnis yang dicek detail</span></div>
          {([["Bisa WhatsApp", dd.whatsapp], ["Punya telepon", dd.phone], ["Punya website", dd.website], ["IG terdeteksi", dd.instagram]] as [string, number][]).map(([k, val]) => (
            <div className="hb" key={k}><span className="n">{k}</span><span className="tr"><span className="b" style={{ width: val + "%" }} /></span><span className="v">{val}%</span></div>
          ))}
          <div className="legal">Makin rendah persentasenya, makin besar peluang menawarkan jasa digital ke pasar ini.</div>
        </div>
      </div>
    </section>
  );
}

function Scatter({ all, rival, tip }: { all: Biz[]; rival: boolean; tip: ReturnType<typeof useTip> }) {
  const pts = all.filter((p) => p.rating && (p.reviews || 0) > 0);
  if (pts.length < 3) return <div className="empty" style={{ padding: 30 }}>Data belum cukup.</div>;
  const W = 520, H = 300, L = 38, Rr = 10, T = 22, B = 30;
  const lx = (v: number) => Math.log10(v), xs = pts.map((p) => lx(p.reviews!)), ys = pts.map((p) => p.rating!);
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.max(1, Math.floor((Math.min(...ys) - 0.1) * 10) / 10), y1 = 5.12;
  const X = (v: number) => L + ((lx(v) - x0) / (x1 - x0 || 1)) * (W - L - Rr), Y = (v: number) => T + ((y1 - v) / (y1 - y0 || 1)) * (H - T - B);
  const med = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const mx = med(pts.map((p) => p.reviews!)), my = med(ys);
  const grid: ReactNode[] = [];
  for (let e = x0; e <= x1; e++) { const xv = X(10 ** e); grid.push(<g key={"x" + e}><line className="grid" x1={xv} x2={xv} y1={T} y2={H - B} /><text x={xv} y={H - B + 16} textAnchor="middle">{num(10 ** e)}</text></g>); }
  for (let r = Math.ceil(y0 * 2) / 2; r <= 5.001; r += 0.5) { const yv = Y(r); grid.push(<g key={"y" + r}><line className="grid" x1={L} x2={W - Rr} y1={yv} y2={yv} /><text x={L - 6} y={yv + 4} textAnchor="end">{r.toFixed(1).replace(".", ",")}</text></g>); }
  const order = [...pts].sort((a, b) => (isProspect(a, rival) ? 1 : 0) - (isProspect(b, rival) ? 1 : 0));
  return (
    <svg className="sc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sebaran rating terhadap jumlah ulasan">
      {grid}
      <line className="med" x1={X(mx)} x2={X(mx)} y1={T} y2={H - B} /><line className="med" x1={L} x2={W - Rr} y1={Y(my)} y2={Y(my)} />
      <text className="ql" x={W - Rr - 4} y={T - 8} textAnchor="end">Pemimpin</text><text className="ql" x={L + 6} y={T - 8}>Hidden gem</text>
      <text className="ql" x={W - Rr - 4} y={H - B - 6} textAnchor="end">Ramai tapi lemah</text><text className="ql" x={L + 6} y={H - B - 6}>Tertinggal</text>
      {order.map((p, i) => (
        <circle key={i} cx={X(p.reviews!).toFixed(1)} cy={Y(p.rating!).toFixed(1)} r="5" fill={`var(${isProspect(p, rival) ? "--c1" : "--c2"})`}
          onMouseMove={(e) => tip.show(e, <>{tipHtml(p)}{isProspect(p, rival) ? <><br />Prospek</> : null}</>)} onMouseLeave={tip.hide} onClick={() => window.open(p.maps_url, "_blank")} />
      ))}
      <text x={(L + W) / 2} y={H - 2} textAnchor="middle">jumlah ulasan (skala log)</text>
    </svg>
  );
}

// ---------- bandingkan wilayah ----------
function CompareView({ c, onOpen }: { c: Compare; onOpen: (id: number) => void }) {
  if (!c.areas.length) return <div className="empty">Belum ada data untuk dibandingkan.</div>;
  return (
    <>
      <div className="rh"><div><h2>{c.industry} · {c.areas.length} wilayah</h2><div className="meta">Diurutkan dari skor peluang tertinggi</div></div></div>
      <div className="card"><h3>Kesimpulan</h3><ul>{c.insights.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      <div className="tcard"><div className="tw"><table>
        <thead><tr><th>Wilayah</th><th>Skor peluang</th><th>Bisnis</th><th>Rating</th><th>Ulasan/bisnis</th><th>Top 3</th><th>Hidden gem</th><th>Rating rendah</th><th>Website</th><th>WhatsApp</th><th>Prospek</th></tr></thead>
        <tbody>
          {c.areas.map((a, i) => (
            <tr key={a.report_id} className={i ? "" : "cmp-best"}>
              <td><div className="nm">{a.area}</div><button className="mini" onClick={() => onOpen(a.report_id)}>Buka laporan</button></td>
              <td className="score">{a.opportunity}</td><td>{a.businesses}{a.capped ? "+" : ""}</td><td>{a.avg_rating ?? "-"}</td><td>{num(a.reviews_per_business)}</td>
              <td>{a.top3_share}%</td><td>{a.gems}</td><td>{a.weak}</td><td>{a.website_pct}%</td><td>{a.whatsapp_pct}%</td><td>{a.prospects}</td>
            </tr>
          ))}
        </tbody>
      </table></div></div>
    </>
  );
}
