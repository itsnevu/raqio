"use client";
// Progres job lewat SSE GET /log/stream?job=<id> (event "log": {job,status,append,error}; event "done": {job,status}).
// Kalau EventSource gagal 3 kali, jatuh ke polling GET /log tiap 2 detik dengan backoff, kecuali pemanggil memberi
// `onSseFail` (mis. chat, yang punya endpoint poll sendiri). Berhenti saat tab disembunyikan, bersih saat dihentikan,
// dan aman di StrictMode (cleanup menutup koneksi sebelum effect dijalankan lagi).
// Inti logikanya `followJob` tidak bergantung React supaya bisa dipakai store chat; `useJobStream` membungkusnya.
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, isAbort, type JobLog } from "./api";

export type JobStatus = "idle" | "queued" | "running" | "done" | "failed" | "cancelled" | "none";
export type JobState = {
  job: number | null;
  status: JobStatus;
  log: string;
  error: string | null;
  started: number | null;
  transport: "sse" | "poll" | "off";
};

export const isActive = (s: JobStatus) => s === "queued" || s === "running";

const INITIAL: JobState = { job: null, status: "idle", log: "", error: null, started: null, transport: "off" };

type LogEvent = { job?: number; status?: string; append?: string; error?: string | null };
export type FollowHandlers = {
  /** setiap perubahan state (log bertambah, status berubah) */
  onState: (s: JobState) => void;
  /** sekali saat job berakhir (done/failed/cancelled/none) */
  onDone: (s: JobState) => void;
  /** kalau diberi: saat SSE tidak tersedia atau gagal 3 kali, pengikutan berhenti dan ini dipanggil (tidak jatuh ke polling /log) */
  onSseFail?: () => void;
};
type Opts = { onDone?: (s: JobState) => void; onSseFail?: () => void };

/**
 * Ikuti satu job sampai selesai. Mengembalikan fungsi untuk berhenti mengikuti (aman dipanggil berkali-kali).
 * Tidak menyentuh React; `useJobStream` memakainya untuk halaman riset, store chat memakainya langsung.
 */
export function followJob(jobId: number, h: FollowHandlers): () => void {
  let alive = true;
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let errors = 0;
  let pollDelay = 2000;
  let finished = false;
  const ac = new AbortController();
  let state: JobState = { ...INITIAL, job: jobId, status: "queued", started: Date.now() / 1000 };
  const emit = (patch: Partial<JobState>) => {
    state = { ...state, ...patch };
    h.onState(state);
  };

  const close = () => {
    if (es) {
      es.close();
      es = null;
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  };
  const finish = (status: JobStatus, patch: Partial<JobState> = {}) => {
    if (finished) return;
    finished = true;
    close();
    emit({ ...patch, status, transport: "off" });
    h.onDone(state);
  };
  const fallback = () => {
    if (!alive || finished) return;
    if (h.onSseFail) {
      finished = true;
      close();
      emit({ transport: "off" });
      h.onSseFail();
      return;
    }
    startPoll();
  };
  const openSse = () => {
    if (!alive || finished) return;
    if (typeof EventSource === "undefined") return fallback();
    let log = "";
    es = new EventSource("/log/stream?job=" + encodeURIComponent(String(jobId)));
    // server mengirim event pertama segera; kalau 8 detik kosong berarti stream ditahan proxy/kompresi: pindah ke polling
    watchdog = setTimeout(() => {
      if (!alive || finished) return;
      close();
      startPoll();
    }, 8000);
    const gotEvent = () => {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
    };
    es.addEventListener("log", (ev) => {
      if (!alive || finished) return;
      gotEvent();
      let d: LogEvent = {};
      try {
        d = JSON.parse((ev as MessageEvent).data as string) as LogEvent;
      } catch {}
      errors = 0;
      log += d.append || "";
      const st = (d.status as JobStatus) || "running";
      emit({ job: d.job ?? state.job, status: st, log, error: d.error ?? null, transport: "sse" });
      if (!isActive(st) && st !== "idle") finish(st, { log, error: d.error ?? null });
    });
    es.addEventListener("done", (ev) => {
      if (!alive || finished) return;
      gotEvent();
      let d: { job?: number; status?: string } = {};
      try {
        d = JSON.parse((ev as MessageEvent).data as string) as { job?: number; status?: string };
      } catch {}
      const st = (d.status as JobStatus) || "done";
      if (st === "none") finish("none");
      else finish(st, { log });
    });
    es.onerror = () => {
      if (!alive || finished) return;
      errors += 1;
      if (errors >= 3) {
        close();
        fallback();
      }
      // di bawah 3 kali: biarkan EventSource mencoba sambung ulang sendiri
    };
  };
  const startPoll = () => {
    if (!alive || finished) return;
    const tick = async () => {
      if (!alive || finished) return;
      if (document.hidden) return; // dilanjutkan oleh visibilitychange
      try {
        // ?job= supaya yang dipoll tetap job yang diikuti, bukan job terbaru org (bisa beda saat ada antrean)
        const j = await apiGet<JobLog>("/log?job=" + encodeURIComponent(String(jobId)), { signal: ac.signal });
        pollDelay = 2000;
        const st: JobStatus = j.running ? (j.status === "queued" ? "queued" : "running") : j.stopped ? "cancelled" : (j.status as JobStatus) || "done";
        emit({ log: j.log || "", started: j.started ?? state.started, status: st, transport: "poll" });
        if (!j.running) {
          finish(st, { log: j.log || "" });
          return;
        }
      } catch (e) {
        if (isAbort(e)) return;
        pollDelay = Math.min(pollDelay * 2, 30000);
      }
      timer = setTimeout(tick, pollDelay);
    };
    tick();
  };
  const onVis = () => {
    if (!alive || finished) return;
    if (document.hidden) close();
    else if (!es && !timer) openSse();
  };

  h.onState(state);
  document.addEventListener("visibilitychange", onVis);
  if (!document.hidden) openSse();

  return () => {
    alive = false;
    ac.abort();
    close();
    document.removeEventListener("visibilitychange", onVis);
  };
}

/**
 * @param jobId id job yang diikuti; null = tidak ada stream.
 */
export function useJobStream(jobId: number | null, opts: Opts = {}) {
  const [state, setState] = useState<JobState>(INITIAL);
  const onDone = useRef(opts.onDone);
  onDone.current = opts.onDone;
  const onSseFail = useRef(opts.onSseFail);
  onSseFail.current = opts.onSseFail;
  const hasSseFail = !!opts.onSseFail;

  useEffect(() => {
    if (jobId == null) {
      setState(INITIAL);
      return;
    }
    return followJob(jobId, {
      onState: setState,
      onDone: (s) => queueMicrotask(() => onDone.current?.(s)),
      onSseFail: hasSseFail ? () => onSseFail.current?.() : undefined,
    });
  }, [jobId, hasSseFail]);

  return state;
}

/** Ambil status job riset terakhir org sekali (untuk tahu apakah ada job yang masih jalan saat halaman dibuka). */
export const fetchLatestJob = (signal?: AbortSignal) => apiGet<JobLog>("/log", { signal });

export type ActiveRun = { id: number; label: string; status: string };

/** Job riset yang antre/berjalan milik org, paling lama di depan (itu yang sedang/akan dikerjakan worker). */
export async function fetchActiveRuns(signal?: AbortSignal): Promise<ActiveRun[]> {
  type Row = { id: number; kind: string; status: string; params?: { industry?: string; area?: string; areas?: string[] } | null };
  const rows = await apiGet<Row[]>("/jobs", { signal });
  return (Array.isArray(rows) ? rows : [])
    .filter((j) => (j.kind === "market_run" || j.kind === "market_compare") && (j.status === "queued" || j.status === "running"))
    .map((j) => ({ id: j.id, status: j.status, label: [j.params?.industry, j.params?.area || (j.params?.areas || []).join("; ")].filter(Boolean).join(" · ") }))
    .reverse();
}

/** Tunggu job tertentu selesai lewat SSE, maksimal `timeoutMs`. Resolve dengan status akhir; "timeout" kalau kehabisan waktu. */
export function waitJobDone(jobId: number, timeoutMs = 90_000): Promise<string> {
  return new Promise((resolve) => {
    if (typeof EventSource === "undefined") return resolve("unsupported");
    const es = new EventSource("/log/stream?job=" + encodeURIComponent(String(jobId)));
    const t = setTimeout(() => {
      es.close();
      resolve("timeout");
    }, timeoutMs);
    const end = (st: string) => {
      clearTimeout(t);
      es.close();
      resolve(st);
    };
    es.addEventListener("done", (ev) => {
      try {
        end(((JSON.parse((ev as MessageEvent).data as string) as { status?: string }).status as string) || "done");
      } catch {
        end("done");
      }
    });
    let errs = 0;
    es.onerror = () => {
      errs += 1;
      if (errs >= 3) end("error");
    };
  });
}

export function useAbortable() {
  const ref = useRef<AbortController | null>(null);
  const next = useCallback(() => {
    ref.current?.abort();
    ref.current = new AbortController();
    return ref.current.signal;
  }, []);
  useEffect(() => () => ref.current?.abort(), []);
  return next;
}
