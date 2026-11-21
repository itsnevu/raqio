// Cache modul sederhana untuk data yang dibaca banyak komponen: badge jatuh tempo (dari /prospects/data) dan daftar pantauan.
// TTL 60 detik; invalidasi eksplisit setelah ada perubahan (saveLead, toggle watch, asisten selesai bekerja).
import { apiGet, type WatchRow } from "./api";
import { type Biz, today } from "./biz";

type Entry<T> = { at: number; value: Promise<T> };
const store = new Map<string, Entry<unknown>>();
const TTL = 60_000;

export function cached<T>(key: string, load: () => Promise<T>, ttl = TTL): Promise<T> {
  const e = store.get(key) as Entry<T> | undefined;
  if (e && Date.now() - e.at < ttl) return e.value;
  const value = load().catch((err) => {
    store.delete(key);
    throw err;
  });
  store.set(key, { at: Date.now(), value });
  return value;
}

export const invalidate = (key: string) => {
  store.delete(key);
};
export const invalidateAll = () => store.clear();

export const isDue = (p: Biz) => !!(p.lead && p.lead.remind && p.lead.remind <= today() && !["deal", "tolak"].includes(p.lead.status || ""));

export const PROSPECTS_KEY = "prospects";
export const WATCHES_KEY = "watches";

export const loadProspects = () => cached(PROSPECTS_KEY, () => apiGet<{ items: Biz[] }>("/prospects/data").then((j) => j.items || []));
export const loadDueCount = () => loadProspects().then((items) => items.filter(isDue).length);
export const loadWatches = () => cached(WATCHES_KEY, () => apiGet<WatchRow[]>("/market/watches").then((w) => (Array.isArray(w) ? w : [])));

/**
 * Event window yang dikirim store chat setelah asisten selesai bekerja (cache di atas sudah diinvalidasi).
 * detail.mutated = true kalau ada tool yang kemungkinan mengubah data (status prospek, pantauan); halaman memuat ulang
 * datanya dan menampilkan REFRESH_MSG bila mutated.
 */
export const REFRESH_EVENT = "raqio:refresh";
export const REFRESH_MSG = "Asisten mengubah data, halaman diperbarui";
export type RefreshDetail = { source: string; mutated: boolean };
