// Pengaturan org (jasa yang ditawarkan, tujuan riset per wilayah) disimpan di server lewat Go API,
// dengan cache di memori dan localStorage supaya fungsi sinkron seperti draft() tetap bisa dipakai.
export type Settings = { offer: string; goals: Record<string, string> };

let cache: Settings | null = null;
let loading: Promise<Settings> | null = null;

const DEFAULT_OFFER = "meningkatkan penjualan lewat kehadiran online";

function fromLocal(): Settings {
  try {
    return { offer: localStorage.getItem("offer") || "", goals: JSON.parse(localStorage.getItem("goals") || "{}") };
  } catch {
    return { offer: "", goals: {} };
  }
}

export function loadSettings(): Promise<Settings> {
  if (cache) return Promise.resolve(cache);
  if (!loading)
    loading = fetch("/org/settings")
      .then((r) => (r.ok ? r.json() : fromLocal()))
      .catch(fromLocal)
      .then((s: Settings) => {
        cache = { offer: s.offer || "", goals: s.goals || {} };
        try {
          localStorage.setItem("offer", cache.offer);
          localStorage.setItem("goals", JSON.stringify(cache.goals));
        } catch {}
        return cache;
      });
  return loading;
}

export const getOffer = () => (cache ? cache.offer : fromLocal().offer) || DEFAULT_OFFER;
export const isDefaultOffer = () => getOffer() === DEFAULT_OFFER;
export function setOffer(v: string) {
  if (!cache) cache = fromLocal();
  cache.offer = v;
  try {
    localStorage.setItem("offer", v);
  } catch {}
  fetch("/org/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer: v }) }).catch(() => {});
}

export const goalKey = (ind: string, area: string) => ind.trim().toLowerCase() + "|" + area.trim().toLowerCase();
export const getGoal = (ind: string, area: string) => (cache ? cache.goals : fromLocal().goals)[goalKey(ind, area)] || "client";
export function setGoal(ind: string, area: string, g: string) {
  if (!cache) cache = fromLocal();
  cache.goals[goalKey(ind, area)] = g;
  try {
    localStorage.setItem("goals", JSON.stringify(cache.goals));
  } catch {}
  fetch("/org/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goals: { [goalKey(ind, area)]: g } }) }).catch(() => {});
}
