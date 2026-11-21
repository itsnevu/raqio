// Pengaturan org (jasa yang ditawarkan, tujuan riset per wilayah) disimpan di server lewat Go API,
// dengan cache di memori dan localStorage (per org) supaya fungsi sinkron seperti draft() tetap bisa dipakai.
import { apiGet, apiPost } from "./api";
import { getMe } from "./me";
import { lsGet, lsSet } from "./storage";

export type Settings = { offer: string; goals: Record<string, string> };

let cache: Settings | null = null;
let loading: Promise<Settings> | null = null;

const DEFAULT_OFFER = "meningkatkan penjualan lewat kehadiran online";

function fromLocal(): Settings {
  try {
    return { offer: lsGet("offer") || "", goals: JSON.parse(lsGet("goals") || "{}") as Record<string, string> };
  } catch {
    return { offer: "", goals: {} };
  }
}

function persist(s: Settings) {
  lsSet("offer", s.offer);
  lsSet("goals", JSON.stringify(s.goals));
}

export function loadSettings(): Promise<Settings> {
  if (cache) return Promise.resolve(cache);
  if (!loading)
    loading = getMe()
      .catch(() => null)
      .then(() => apiGet<Partial<Settings>>("/org/settings").catch(() => fromLocal()))
      .then((s) => {
        cache = { offer: s.offer || "", goals: s.goals || {} };
        persist(cache);
        return cache;
      })
      .finally(() => {
        loading = null;
      });
  return loading;
}

export function resetSettings() {
  cache = null;
  loading = null;
}

export const getOffer = () => (cache ? cache.offer : fromLocal().offer) || DEFAULT_OFFER;
export const isDefaultOffer = () => getOffer() === DEFAULT_OFFER;
export function setOffer(v: string) {
  if (!cache) cache = fromLocal();
  cache = { ...cache, offer: v };
  lsSet("offer", v);
  apiPost("/org/settings", { offer: v }).catch(() => {});
}

export const goalKey = (ind: string, area: string) => ind.trim().toLowerCase() + "|" + area.trim().toLowerCase();
export const getGoal = (ind: string, area: string) => (cache ? cache.goals : fromLocal().goals)[goalKey(ind, area)] || "client";
export function setGoal(ind: string, area: string, g: string) {
  if (!cache) cache = fromLocal();
  cache = { ...cache, goals: { ...cache.goals, [goalKey(ind, area)]: g } };
  lsSet("goals", JSON.stringify(cache.goals));
  apiPost("/org/settings", { goals: { [goalKey(ind, area)]: g } }).catch(() => {});
}
