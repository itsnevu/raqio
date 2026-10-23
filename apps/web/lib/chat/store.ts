// Store asisten tanpa React: satu percakapan per tab yang dipakai halaman / dan panel melayang bersamaan.
// Hidup di module scope supaya percakapan dan job yang sedang jalan tidak hilang saat berpindah halaman atau panel ditutup.
// sid selalu dari server (POST /chat/sid) dan disimpan per org di localStorage. Progres job lewat SSE (followJob);
// kalau SSE gagal, polling GET /chat/poll. Komponen membaca state lewat useChatState() dan memanggil aksi di bawah.
import { useSyncExternalStore } from "react";
import { ApiError, apiGet, apiPost, isAbort, type Org } from "../api";
import { invalidate, PROSPECTS_KEY, REFRESH_EVENT, WATCHES_KEY } from "../cache";
import { getMe, onResetMe } from "../me";
import { lsGet, lsRemove, lsSet } from "../storage";
import { followJob } from "../useJobStream";
import { getPageContext } from "./context";
import { CHIPS, describeError, isMutatingStep, isNoKey, NO_KEY_MSG, splitSteps } from "./steps";
import type {
  ChatLimits,
  ChatMessagesResponse,
  ChatPoll,
  ChatQuota,
  ChatSendResponse,
  ChatSession,
  ChatSessionsResponse,
  ChatSidResponse,
  ChatSuggestionsResponse,
  Msg,
} from "./types";

export type Running = { job: number | string; botId: number };
export type ChatState = {
  /** sid tersedia, boleh bertanya */
  ready: boolean;
  sid: string;
  msgs: Msg[];
  sessions: ChatSession[];
  running: Running | null;
  noKey: boolean;
  /** CHAT_ENABLED=0 di server */
  disabled: string | null;
  initError: string | null;
  /** pesan kegagalan aksi sesi (ganti/hapus sesi), tampil di atas input */
  notice: string | null;
  quota: ChatQuota | null;
  suggestions: string[];
};

const SID_KEY = "sid";
const INITIAL: ChatState = {
  ready: false, sid: "", msgs: [], sessions: [], running: null, noKey: false, disabled: null, initError: null, notice: null, quota: null, suggestions: [],
};

let state: ChatState = INITIAL;
const listeners = new Set<() => void>();
function set(patch: Partial<ChatState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const getChatState = () => state;
export const useChatState = () => useSyncExternalStore(subscribe, getChatState, () => INITIAL);

let seq = 0;
let orgId: string | null = null; // org yang sesinya dimuat; org lain (login ulang) berarti mulai dari nol
let initPromise: Promise<void> | null = null;
let stopStream: (() => void) | null = null;
let poller: AbortController | null = null;
let finalizing: string | null = null;
let suggestSeq = 0;

const here = () => (typeof location !== "undefined" ? location.pathname : "/");
const pollUrl = (job: number | string) => "/chat/poll?job=" + encodeURIComponent(String(job));
const patchMsg = (id: number, f: (m: Msg) => Msg) => set({ msgs: state.msgs.map((m) => (m.id === id ? f(m) : m)) });
const placeholder = (id: number): Msg => ({ id, role: "assistant", text: "", steps: [], done: false });

function sidPersist(sid: string) {
  set({ sid });
  lsSet(SID_KEY, sid);
}

function stopFollowing() {
  stopStream?.();
  stopStream = null;
  poller?.abort();
  poller = null;
  finalizing = null;
}

/** Buang semua state (logout, ganti akun). Job yang masih jalan tidak diikuti lagi. */
export function resetChat() {
  stopFollowing();
  orgId = null;
  initPromise = null;
  set({ ...INITIAL });
}
onResetMe(resetChat);

export async function refreshSessions() {
  try {
    const j = await apiGet<ChatSessionsResponse>("/chat/sessions");
    set({ sessions: Array.isArray(j?.sessions) ? j.sessions : [] });
  } catch {}
}

export async function refreshQuota() {
  try {
    const [me, org] = await Promise.all([getMe(true), apiGet<Org>("/org")]);
    const limit = (me.limits as ChatLimits | undefined)?.chats ?? (org.limits as ChatLimits | undefined)?.chats;
    set({ quota: typeof limit === "number" ? { used: Number(org.usage?.chat || 0), limit } : null });
  } catch {}
}

/** Saran pertanyaan sesuai halaman; maksimal 4; jatuh ke CHIPS lokal kalau endpoint gagal. */
export async function loadSuggestions() {
  const my = ++suggestSeq;
  const ctx = getPageContext(here());
  const q = new URLSearchParams({ page: ctx.page });
  if (ctx.report_id) q.set("report_id", String(ctx.report_id));
  let list: string[] = [];
  try {
    const j = await apiGet<ChatSuggestionsResponse>("/chat/suggestions?" + q.toString());
    list = Array.isArray(j?.suggestions) ? j.suggestions.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
  } catch {}
  if (my !== suggestSeq) return;
  set({ suggestions: (list.length ? list : CHIPS).slice(0, 4) });
}

function applyPoll(botId: number, p: ChatPoll) {
  const err = p.done && p.error ? String(p.error) : "";
  const nk = !!err && isNoKey(err);
  if (nk) set({ noKey: true });
  patchMsg(botId, (m) => ({
    ...m,
    steps: p.steps && p.steps.length ? p.steps : m.steps,
    done: !!p.done,
    text: p.answer || m.text,
    error: err ? (nk ? NO_KEY_MSG : err) : p.done && !p.answer && !m.text ? "Tidak ada jawaban dari asisten." : undefined,
    errorCode: err ? (nk ? "nokey" : "other") : undefined,
  }));
}

/** Setelah job berakhir: lepas stream, beri tahu halaman lain, segarkan sesi, kuota, dan saran. */
function finish() {
  const r = state.running;
  stopFollowing();
  set({ running: null });
  const bot = r ? state.msgs.find((m) => m.id === r.botId) : null;
  invalidate(PROSPECTS_KEY);
  invalidate(WATCHES_KEY);
  if (typeof window !== "undefined") {
    const mutated = !!bot && bot.steps.some(isMutatingStep);
    window.dispatchEvent(new CustomEvent(REFRESH_EVENT, { detail: { source: "chat", mutated } }));
  }
  void refreshSessions();
  void refreshQuota();
  void loadSuggestions();
}

async function pollJob(job: number | string, botId: number) {
  poller?.abort();
  const ac = new AbortController();
  poller = ac;
  let delay = 1200, fails = 0;
  const sleep = (ms: number) =>
    new Promise<void>((r) => {
      const t = setTimeout(r, ms);
      ac.signal.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true });
    });
  while (!ac.signal.aborted) {
    try {
      const p = await apiGet<ChatPoll>(pollUrl(job), { signal: ac.signal });
      fails = 0;
      delay = 1200;
      applyPoll(botId, p);
      if (p.done) break;
    } catch (e) {
      if (isAbort(e)) return;
      fails += 1;
      delay = Math.min(delay * 2, 15000);
      if (fails >= 5 || (e instanceof ApiError && (e.status === 401 || e.status === 404))) {
        const d = describeError(e);
        patchMsg(botId, (m) => ({ ...m, done: true, error: d.error, errorCode: d.code }));
        break;
      }
    }
    await sleep(typeof document !== "undefined" && document.hidden ? delay * 2 : delay);
  }
  if (ac.signal.aborted) return;
  if (poller === ac) poller = null;
  finish();
}

/** Event done dari SSE: baca jawaban sekali lewat /chat/poll; kalau server belum menandai selesai, lanjut polling. */
async function finalize(job: number | string, botId: number) {
  const k = String(job);
  if (finalizing === k) return;
  finalizing = k;
  try {
    const p = await apiGet<ChatPoll>(pollUrl(job));
    applyPoll(botId, p);
    if (p.done) {
      finish();
      return;
    }
  } catch {}
  finalizing = null;
  void pollJob(job, botId);
}

function start(job: number | string, botId: number) {
  stopFollowing();
  set({ running: { job, botId } });
  const n = Number(job);
  if (Number.isInteger(n) && n > 0) {
    stopStream = followJob(n, {
      onState: (s) => {
        if (state.running?.botId === botId && s.log) patchMsg(botId, (m) => (m.done ? m : { ...m, steps: splitSteps(s.log) }));
      },
      onDone: () => {
        stopStream = null;
        void finalize(job, botId);
      },
      onSseFail: () => {
        stopStream = null;
        void pollJob(job, botId);
      },
    });
  } else void pollJob(job, botId);
}

/** Pertanyaan terakhir belum dijawab saat sesi dimuat: cek jobnya sekali, lalu ikuti lagi kalau masih jalan. */
async function resume(job: number, botId: number) {
  try {
    const p = await apiGet<ChatPoll>(pollUrl(job));
    if (!p.done) {
      start(job, botId);
      return;
    }
    if (p.answer || p.error) applyPoll(botId, p);
    else set({ msgs: state.msgs.filter((m) => m.id !== botId) });
  } catch {
    set({ msgs: state.msgs.filter((m) => m.id !== botId) }); // job sudah tidak dikenal: lepas placeholder tanpa pesan
  }
}

async function loadMessages(sid: string) {
  const j = await apiGet<ChatMessagesResponse>("/chat/messages?sid=" + encodeURIComponent(sid));
  const rows = Array.isArray(j?.messages) ? j.messages : [];
  const msgs: Msg[] = rows.map((r) => ({ id: ++seq, role: r.role === "user" ? "user" : "assistant", text: r.content || "", steps: [], done: true }));
  sidPersist(sid);
  set({ msgs });
  // active_job: job chat sesi ini yang masih jalan (mis. setelah reload). Fallback: pertanyaan terakhir belum dijawab tapi punya job_id.
  const last = rows[rows.length - 1];
  const job = typeof j?.active_job === "number" ? j.active_job : last && last.role === "user" && typeof last.job_id === "number" ? last.job_id : null;
  if (job != null && !state.running) {
    const botId = ++seq;
    set({ msgs: [...state.msgs, placeholder(botId)] });
    void resume(job, botId);
  }
}

async function createSid() {
  const j = await apiPost<ChatSidResponse>("/chat/sid", {});
  if (!j || typeof j.sid !== "string" || !j.sid) throw new Error("Server tidak mengembalikan id sesi.");
  sidPersist(j.sid);
  return j.sid;
}

async function init() {
  set({ initError: null, disabled: null });
  try {
    const me = await getMe().catch(() => null);
    const org = me?.org_id || "anon";
    if (orgId && orgId !== org) {
      stopFollowing();
      set({ ...INITIAL });
    }
    orgId = org;
    const stored = lsGet(SID_KEY) || "";
    let ok = false;
    if (stored) {
      try {
        await loadMessages(stored);
        ok = true;
      } catch (e) {
        if (e instanceof ApiError && [400, 403, 404].includes(e.status)) lsRemove(SID_KEY);
        else throw e;
      }
    }
    if (!ok) {
      set({ msgs: [] });
      await createSid();
    }
    set({ ready: true });
    void refreshSessions();
    void refreshQuota();
    // saran pertanyaan dimuat komponen (ChatPanel) karena bergantung halaman yang sedang dibuka
  } catch (e) {
    const d = describeError(e);
    if (d.code === "disabled") set({ disabled: d.error });
    else set({ initError: d.error });
    initPromise = null; // boleh dicoba lagi
  }
}

/** Dipanggil komponen chat saat dipasang. Inisialisasi hanya sekali per sesi login; pemanggilan berikutnya langsung selesai. */
export function activate(): Promise<void> {
  if (!initPromise) initPromise = init();
  return initPromise;
}
export function retry() {
  initPromise = null;
  return activate();
}

export async function ask(text: string) {
  text = text.trim();
  if (!text || state.running || !state.sid) return;
  const meId = ++seq, botId = ++seq;
  set({
    notice: null,
    running: { job: "", botId }, // menunggu id job dari server; mencegah kirim ganda
    msgs: [...state.msgs, { id: meId, role: "user", text, steps: [], done: true }, placeholder(botId)],
  });
  try {
    const j = await apiPost<ChatSendResponse>("/chat", { sid: state.sid, message: text, context: getPageContext(here()) });
    if (j && typeof j.sid === "string" && j.sid && j.sid !== state.sid) sidPersist(j.sid);
    if (j == null || j.job == null || j.job === "") throw new Error("Server tidak mengembalikan id job.");
    start(j.job, botId);
  } catch (e) {
    const d = describeError(e);
    if (d.code === "nokey") set({ noKey: true });
    if (d.code === "disabled") set({ disabled: d.error });
    set({ running: null });
    patchMsg(botId, (m) => ({ ...m, done: true, error: d.error, errorCode: d.code }));
  }
}

export async function stop() {
  const r = state.running;
  stopFollowing();
  set({
    running: null,
    msgs: state.msgs.map((m) => (m.role === "assistant" && !m.done ? { ...m, done: true, error: m.text ? undefined : "Dihentikan." } : m)),
  });
  if (r && r.job !== "") await apiPost("/chat/stop", { job: r.job }).catch(() => {});
  void refreshSessions();
}

export async function newChat() {
  if (state.running) await stop();
  set({ notice: null });
  try {
    await createSid();
    set({ msgs: [] });
    void loadSuggestions();
  } catch (e) {
    set({ notice: describeError(e).error });
  }
}

export async function openSession(id: string) {
  if (!id || id === state.sid) return;
  if (state.running) await stop();
  set({ notice: null });
  try {
    await loadMessages(id);
    void loadSuggestions();
  } catch (e) {
    set({ notice: describeError(e).error });
  }
}

export async function deleteSession(id: string) {
  set({ notice: null });
  try {
    await apiPost("/chat/sessions/delete", { sid: id });
    set({ sessions: state.sessions.filter((s) => s.id !== id) });
    if (id === state.sid) {
      if (state.running) await stop();
      set({ msgs: [] });
      await createSid();
    }
  } catch (e) {
    set({ notice: describeError(e).error });
  }
}
