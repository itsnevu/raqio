"use client";
// Riset pasar: orkestrasi saja. Logika domain ada di lib/market/*, tampilan di components/market/*.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, useMemo } from "react";
import "./market.css";
import StatsStrip from "@/components/market/StatsStrip";
import LoadError from "@/components/LoadError";
import { useShell, useToast } from "@/components/Shell";
import { useTour } from "@/components/Tour";
import CompareView from "@/components/market/CompareView";
import ReportView from "@/components/market/ReportView";
import RunForm, { type Suggestion } from "@/components/market/RunForm";
import StatusLine from "@/components/market/StatusLine";
import { ApiError, apiGet, apiPost, errMsg } from "@/lib/api";
import { invalidate, loadWatches, REFRESH_MSG, WATCHES_KEY } from "@/lib/cache";
import { setReportContext } from "@/lib/chat/context";
import { resetMe } from "@/lib/me";
import { parseOutcome } from "@/lib/market/progress";
import type { Compare, Goal, Mode, Report, ReportRow, RunArgs, RunResult, StatusMsg, Watch } from "@/lib/market/types";
import { isReport, normalizeReport } from "@/lib/market/verdict";
import { getGoal, loadSettings, setGoal as writeGoal } from "@/lib/settings";
import { MARKET_TOUR } from "@/lib/tours";
import { type ActiveRun, fetchActiveRuns, isActive, type JobState, useJobStream } from "@/lib/useJobStream";
import { useRefresh } from "@/lib/useRefresh";

export default function MarketPage() {
  return (
    <Suspense fallback={<div className="wrap" />}>
      <Market />
    </Suspense>
  );
}

type Loaded<T> = { loading: boolean; error: string | null; data: T };

function Market() {
  const toast = useToast();
  const { notify, askNotify } = useShell();
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("one");
  const [goal, setGoal] = useState<Goal>("client");
  const [industry, setIndustry] = useState("");
  const [area, setArea] = useState("");
  const [recent, setRecent] = useState<Loaded<ReportRow[]>>({ loading: true, error: null, data: [] });
  const [current, setCurrent] = useState<number | "cmp" | null>(null);
  const [report, setReport] = useState<Loaded<Report | null>>({ loading: false, error: null, data: null });
  const [cmp, setCmp] = useState<Compare | null>(null);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [status, setStatus] = useState<StatusMsg>({ kind: "idle" });
  const [jobId, setJobId] = useState<number | null>(null);
  const [waiting, setWaiting] = useState<ActiveRun[]>([]); // riset yang antre di belakang job yang diikuti
  const [rival, setRival] = useState(false);
  const [suggest, setSuggest] = useState<Suggestion[]>([]);
  // saran wilayah untuk mode Bandingkan: dari riset sebelumnya dan pasangan instan, tanpa duplikat
  const areaOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of recent.data) if (r.area) seen.set(r.area.toLowerCase(), r.area);
    for (const s of suggest) if (s.area) seen.set(s.area.toLowerCase(), s.area);
    return [...seen.values()];
  }, [recent.data, suggest]);
  const pending = useRef<{ industry: string; areas: string[] } | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  useTour("market", MARKET_TOUR, !recent.loading);

  const show = useCallback(async (id: number) => {
    setCurrent(id);
    setCmp(null);
    setReport((s) => ({ ...s, loading: true, error: null }));
    try {
      const rep = await apiGet<unknown>("/market/report?id=" + encodeURIComponent(String(id)));
      if (!isReport(rep)) throw new Error("Laporan tidak lengkap atau rusak.");
      const R = normalizeReport(rep);
      setReport({ loading: false, error: null, data: R });
      setRival(getGoal(R.industry, R.area) === "rival");
      loadWatches().then(setWatches).catch(() => {});
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // id laporan sudah tidak ada untuk org ini (mis. sesi tamu lama): kembali ke keadaan kosong, bukan kotak error
        setCurrent(null);
        setReport({ loading: false, error: null, data: null });
        toast("Laporan itu sudah tidak tersedia, pilih riset lain atau jalankan riset baru.", "warn");
        return;
      }
      setReport({ loading: false, error: errMsg(e, "Laporan gagal dimuat."), data: null });
    }
  }, [toast]);

  const loadRecent = useCallback(async (selectId?: number | null, force = false) => {
    setRecent((s) => ({ ...s, loading: true, error: null }));
    try {
      const list = await apiGet<ReportRow[]>("/market/reports");
      const rows = Array.isArray(list) ? list : [];
      setRecent({ loading: false, error: null, data: rows });
      const id = selectId || rows[0]?.id;
      if (id && (force || selectId || !currentRef.current)) show(id);
    } catch (e) {
      setRecent({ loading: false, error: errMsg(e, "Daftar riset gagal dimuat."), data: [] });
    }
  }, [show]);

  // lanjut ke riset berikutnya di antrean (kalau ada). Mengembalikan true kalau masih ada yang diikuti.
  const chainNext = useCallback(async () => {
    try {
      const [first, ...rest] = await fetchActiveRuns();
      if (first) {
        setJobId(first.id);
        setWaiting(rest);
        setStatus({ kind: "running" });
        return true;
      }
    } catch {}
    setWaiting([]);
    return false;
  }, []);

  const onDone = useCallback(async (s: JobState) => {
    setJobId(null);
    const out = parseOutcome(s.log, s.error);
    if (s.status === "cancelled") { setWaiting([]); setStatus({ kind: "info", text: "Riset dihentikan." }); return; } // /stop membatalkan seisi antrean
    if (s.status === "failed" || s.status === "none") {
      const msg = "Gagal: " + (out.failReason || "tidak ada keterangan dari worker.");
      if (await chainNext()) toast(msg); // antrean jalan terus; kegagalan tetap terlihat
      else setStatus({ kind: "error", text: msg });
      return;
    }
    const pend = pending.current;
    if (pend && out.compareDone) {
      setStatus({ kind: "info", text: "Selesai." });
      notify("Perbandingan wilayah selesai", pend.industry);
      try {
        const c = await apiGet<Compare>("/market/compare?industry=" + encodeURIComponent(pend.industry) + "&areas=" + encodeURIComponent(pend.areas.join(";")));
        setCmp({ industry: c.industry, areas: c.areas || [], insights: c.insights || [] });
        setReport({ loading: false, error: null, data: null });
        setCurrent("cmp");
      } catch (e) {
        setStatus({ kind: "error", text: errMsg(e, "Hasil perbandingan gagal dimuat.") });
      }
      pending.current = null;
      loadRecent();
      void chainNext();
      return;
    }
    if (out.reportId) {
      setStatus({ kind: "info", text: "Selesai." });
      notify("Riset selesai", "Laporan sudah siap dibuka.");
      loadRecent(out.reportId, true);
      void chainNext();
    } else {
      const msg = "Gagal: " + (out.failReason || "laporan tidak ditemukan.");
      if (await chainNext()) toast(msg);
      else setStatus({ kind: "error", text: msg });
      loadRecent(null, true);
    }
  }, [loadRecent, notify, toast, chainNext]);

  const stream = useJobStream(jobId, { onDone });
  const running = jobId != null && (stream.status === "idle" || isActive(stream.status));

  useEffect(() => {
    const ac = new AbortController();
    const id = params.get("id");
    loadSettings().then(() => loadRecent(id ? +id : null));
    fetchActiveRuns(ac.signal).then(([first, ...rest]) => {
      if (first) { setJobId(first.id); setWaiting(rest); setStatus({ kind: "running" }); }
    }).catch(() => {});
    apiGet<{ items?: Suggestion[] }>("/market/suggest", { signal: ac.signal }).then((j) => setSuggest(j.items || [])).catch(() => {});
    // datang dari tautan verifikasi email (Go mengarahkan ke sini saat sudah login): profil dimuat ulang supaya bar verifikasi hilang
    if (params.get("msg") === "verified" || params.get("verified") === "1") { resetMe(); toast("Email terverifikasi."); router.replace("/market"); }
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // laporan yang sedang dibuka jadi konteks pertanyaan ke asisten; dilepas saat pindah halaman
  const R = report.data;
  useEffect(() => {
    setReportContext(R ? { industry: R.industry, area: R.area, report_id: R.id ?? (typeof current === "number" ? current : null) } : null);
  }, [R, current]);
  useEffect(() => () => setReportContext(null), []);
  // asisten selesai bekerja (mis. mengubah status prospek atau pantauan): muat ulang laporan yang terbuka
  useRefresh((mutated) => {
    invalidate(WATCHES_KEY);
    if (typeof currentRef.current === "number") void show(currentRef.current);
    if (mutated) toast(REFRESH_MSG);
  });

  const run = useCallback(async (args: RunArgs) => {
    const ind = args.industry.trim(), ar = args.area.trim();
    if (!ind || !ar) { setStatus({ kind: "error", text: "Isi industri dan wilayah." }); return; }
    const m = args.mode ?? mode;
    try {
      let res: RunResult;
      if (m === "cmp") {
        pending.current = { industry: ind, areas: ar.split(/[;\n]/).map((s) => s.trim()).filter(Boolean) };
        res = await apiPost<RunResult>("/market/compare/run", pending.current);
      } else {
        pending.current = null;
        writeGoal(ind, ar, goal);
        res = await apiPost<RunResult>("/market/run", { industry: ind, area: ar, fresh: !!args.fresh });
      }
      if (res.cached && res.report_id) {
        await loadRecent(Number(res.report_id), true);
        setStatus({ kind: "cached", ageHours: Number(res.age_hours || 0), reportId: Number(res.report_id) });
        toast("Hasil instan tersedia");
        return;
      }
      if (typeof res.job !== "number") { setStatus({ kind: "error", text: "Server tidak mengembalikan id job." }); return; }
      askNotify();
      if (jobId != null) {
        // sudah ada riset yang diikuti: yang baru masuk antrean (worker mengerjakan berurutan)
        const jid = res.job;
        setWaiting((w) => [...w, { id: jid, status: "queued", label: ind + " · " + ar }]);
        toast("Masuk antrean riset");
      } else {
        setStatus({ kind: "running" });
        setJobId(res.job);
      }
    } catch (e) {
      setStatus({ kind: "error", text: errMsg(e, "Riset gagal dimulai."), upgrade: e instanceof ApiError && e.code === "quota_exceeded" });
    }
  }, [mode, goal, jobId, loadRecent, toast, askNotify]);

  const stop = useCallback(async () => {
    try { await apiPost("/stop", {}); } catch (e) { toast(errMsg(e, "Gagal menghentikan")); throw e; }
  }, [toast]);
  const onReport = useCallback((f: (r: Report) => Report) => setReport((s) => (s.data ? { ...s, data: f(s.data) } : s)), []);

  return (
    <div className="wrap">
      <h1>Peta pasar industri apa pun.</h1>
      <p className="lead">Scraping langsung dari Google Maps dan website bisnis. Data dibersihkan, tanpa duplikat.</p>
      <StatsStrip />
      <RunForm mode={mode} goal={goal} industry={industry} area={area} running={running} suggest={suggest} areaOptions={areaOptions}
        onMode={setMode} onGoal={setGoal} onIndustry={setIndustry} onArea={setArea} onRun={run} />
      <StatusLine status={running ? { kind: "running" } : status.kind === "running" ? { kind: "idle" } : status} log={stream.log} started={stream.started}
        queue={waiting.map((w) => w.label)} onStop={stop}
        onRescan={() => run({ industry: R?.industry || industry, area: R?.area || area, fresh: true, mode: "one" })} />
      <div className="recent" role="group" aria-label="Riset sebelumnya">
        {recent.error && <LoadError error={recent.error} onRetry={() => loadRecent()} />}
        {recent.data.map((r) => (
          <button key={r.id} type="button" className={"chip" + (current === r.id ? " on" : "")} aria-pressed={current === r.id}
            onClick={() => { router.replace("/market?id=" + r.id); show(r.id); }}>
            {r.industry} · {r.area}
          </button>
        ))}
      </div>
      <div id="report">
        {cmp ? (
          <CompareView c={cmp} onOpen={(id) => show(id)} />
        ) : report.error ? (
          <LoadError error={report.error} onRetry={() => typeof current === "number" && show(current)} title="Laporan gagal dimuat" />
        ) : R ? (
          <ReportView key={R.id ?? String(current)} R={R} rival={rival} current={typeof current === "number" ? current : null}
            watched={watches.some((w) => w.industry.toLowerCase() === R.industry.toLowerCase() && w.area.toLowerCase() === R.area.toLowerCase())}
            onSwapGoal={() => { writeGoal(R.industry, R.area, rival ? "client" : "rival"); setRival(!rival); }} onReport={onReport} />
        ) : report.loading ? (
          <div className="empty" aria-busy="true">Memuat laporan…</div>
        ) : !recent.loading && !recent.data.length && !recent.error ? (
          <div className="empty">Belum ada riset. Isi industri dan wilayah di atas.</div>
        ) : null}
      </div>
    </div>
  );
}
