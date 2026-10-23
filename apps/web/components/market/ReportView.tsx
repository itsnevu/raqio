"use client";
// Satu laporan: tab, filter, tabel, grafik, panduan prospek. Semua perubahan data lewat `onReport` (immutable).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useShell, useToast } from "@/components/Shell";
import { apiPost, errMsg } from "@/lib/api";
import { type Biz, clean, downloadCsv, getOffer, isProspect, leadKey, saveLead, setOffer } from "@/lib/biz";
import { invalidate, WATCHES_KEY } from "@/lib/cache";
import { checkDetail } from "@/lib/market/detail";
import { DEFAULT_VIEW, applyView, setFilter as setFilterIn, toggleSort } from "@/lib/market/filters";
import { powerScores } from "@/lib/market/power";
import { mergeDetail, setLeadIn } from "@/lib/market/report";
import type { Report, SortKey, Tab, View } from "@/lib/market/types";
import { verdict } from "@/lib/market/verdict";
import BizTable from "./BizTable";
import Charts from "./Charts";
import DraftPanel from "./DraftPanel";
import ReportHeader from "./ReportHeader";
import SummaryCards from "./SummaryCards";

type Props = { R: Report; rival: boolean; current: number | null; watched: boolean; onSwapGoal: () => void; onReport: (f: (r: Report) => Report) => void };

export default function ReportView({ R, rival, current, watched, onSwapGoal, onReport }: Props) {
  const toast = useToast();
  const { openBusiness } = useShell();
  const all = useMemo(() => R.all || [], [R]);
  const [tab, setTab] = useState<Tab>("sum");
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [isWatched, setWatched] = useState(watched);
  const [watchBusy, setWatchBusy] = useState(false);
  const [offer, setOfferState] = useState("");
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => setWatched(watched), [watched]);
  useEffect(() => setOfferState(getOffer()), []);

  const power = useMemo(() => powerScores(all), [all]);
  const nPros = useMemo(() => all.filter((p) => isProspect(p, rival)).length, [all, rival]);
  const v = useMemo(() => verdict(R, all, rival), [R, all, rival]);
  const filtered = useMemo(() => applyView(all, view, rival), [all, view, rival]);

  const goTab = (t: Tab) => {
    setTab(t);
    if (t === "pros") setView((x) => ({ ...x, filter: "prospect", sort: "lead", dir: -1 }));
    else if (t === "players" && view.filter === "prospect") setView((x) => ({ ...x, filter: "all", sort: "reviews", dir: -1 }));
  };
  const onQuery = useCallback((q: string) => setView((x) => (x.q === q ? x : { ...x, q })), []);
  const onFilter = useCallback((k: string) => setView((x) => setFilterIn(x, k)), []);
  const onSort = useCallback((k: SortKey) => setView((x) => toggleSort(x, k)), []);
  const onOffer = useCallback((o: string) => { setOffer(o); setOfferState(o); }, []);

  const toggleWatch = async () => {
    const on = !isWatched;
    setWatchBusy(true);
    try {
      await apiPost("/market/watch", { industry: R.industry, area: R.area, on, last_run: R.created });
      setWatched(on);
      invalidate(WATCHES_KEY);
      toast(on ? "Dipantau, riset ulang otomatis sesuai jadwal paket" : "Pantauan dimatikan");
    } catch (e) {
      toast(errMsg(e, "Gagal mengubah pantauan"));
    } finally {
      setWatchBusy(false);
    }
  };
  const exportCsv = () => {
    const cols = ["name", "lead_score", "lead_reasons", "lead_status", "category", "rating", "reviews", "reviews_per_month", "phone", "website", "instagram", "emails", "address", "dist_km", "maps_url"];
    downloadCsv(`${R.industry}-${R.area}.csv`.replace(/\s+/g, "-").toLowerCase(), cols,
      filtered.map((p) => cols.map((c) => (c === "name" ? clean(p.name) : c === "lead_status" ? p.lead?.status : (p as Record<string, unknown>)[c]))));
  };
  const setLead = useCallback(async (p: Biz, status: string) => {
    try {
      await saveLead(p, { status });
      onReport((r) => setLeadIn(r, p, { status }));
    } catch (e) {
      toast(errMsg(e, "Gagal menyimpan status"));
    }
  }, [onReport, toast]);
  const onCheck = useCallback(async (p: Biz, onPending?: () => void) => {
    if (!current) return;
    try {
      const next = await checkDetail(current, p, onPending);
      onReport((r) => mergeDetail(r, p, next));
      toast(`Kontak ${clean(p.name)} diperbarui`);
    } catch (e) {
      toast(errMsg(e, "Gagal mengambil kontak"));
    }
  }, [current, onReport, toast]);
  const onOpen = useCallback((p: Biz) => {
    openBusiness(p, { industry: R.industry, area: R.area, report_id: current, onChange: (q) => onReport((r) => mergeDetail(r, p, q)) });
  }, [openBusiness, R.industry, R.area, current, onReport]);
  const onToggleDraft = useCallback((p: Biz) => {
    const k = leadKey(p);
    setView((x) => ({ ...x, open: x.open === k ? null : k }));
  }, []);

  const tabs: [Tab, string, number | null][] = [["sum", "Ringkasan", null], ["players", "Semua pemain", all.length], ...(rival ? [] : [["pros", "Prospek", nPros] as [Tab, string, number]])];

  return (
    <>
      <ReportHeader R={R} rival={rival} watched={isWatched} watchBusy={watchBusy} printHref={current ? "/market/print?id=" + current : null}
        onSwapGoal={onSwapGoal} onToggleWatch={toggleWatch} onExport={exportCsv} />
      <div className="rtabs" ref={tabsRef} role="tablist" aria-label="Bagian laporan">
        {tabs.map(([t, l, n]) => (
          <button key={t} type="button" role="tab" id={"tab-" + t} aria-selected={tab === t} aria-controls={"panel-" + t} className={tab === t ? "on" : ""} onClick={() => goTab(t)}>
            {l}{n != null && <b>{n}</b>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={"panel-" + tab} aria-labelledby={"tab-" + tab}>
        {tab === "sum" && (
          <SummaryCards R={R} all={all} rival={rival} v={v} nPros={nPros} onSwapGoal={onSwapGoal}
            onSeeProspects={() => { goTab("pros"); window.scrollTo({ top: (tabsRef.current?.offsetTop || 0) - 20, behavior: "smooth" }); }} />
        )}
        {tab === "players" && (
          <ErrorBoundary label="Grafik">
            <Charts R={R} all={all} rival={rival} power={power} onOpen={onOpen} />
          </ErrorBoundary>
        )}
        {tab === "pros" && <DraftPanel R={R} all={all} offer={offer} onOffer={onOffer} setLead={setLead} toast={toast} />}
        {tab !== "sum" && (
          <BizTable tab={tab} all={all} filtered={filtered} view={view} rival={rival} industry={R.industry} area={R.area} offer={offer}
            onQuery={onQuery} onFilter={onFilter} onSort={onSort} onOffer={onOffer} onToggleDraft={onToggleDraft} onOpen={onOpen} onCheck={onCheck} onLead={setLead} />
        )}
        {tab !== "sum" && (
          <div className="legal">Semua baris hasil scraping Google Maps dan website bisnis. Kolom kosong berarti tidak tercantum di sumber, atau detailnya belum diambil (ditandai &quot;belum dicek&quot;). Hubungi secukupnya, satu pesan, jangan spam.</div>
        )}
      </div>
    </>
  );
}
