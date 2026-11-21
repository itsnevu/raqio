// Pembaruan laporan secara immutable: setiap perubahan satu bisnis menghasilkan array dan objek laporan baru,
// sehingga useMemo yang bergantung pada `all` menghitung ulang (filter "Follow up" dan "Prospek" tidak basi).
import { type Biz, leadKey, type Lead, withLead } from "../biz";
import type { Report } from "./types";

export const sameBiz = (a: Biz, b: Biz) => {
  const ka = leadKey(a), kb = leadKey(b);
  return ka && kb ? ka === kb : a === b;
};

export function updateBiz(all: Biz[], target: Biz, f: (p: Biz) => Biz): Biz[] {
  return all.map((p) => (sameBiz(p, target) ? f(p) : p));
}

export function patchReport(R: Report, target: Biz, f: (p: Biz) => Biz): Report {
  return {
    ...R,
    all: updateBiz(R.all || [], target, f),
    leaders: R.leaders ? updateBiz(R.leaders, target, f) : R.leaders,
  };
}

export const setLeadIn = (R: Report, target: Biz, patch: Partial<Lead>) => patchReport(R, target, (p) => withLead(p, patch));
export const mergeDetail = (R: Report, target: Biz, detail: Partial<Biz>) => patchReport(R, target, (p) => ({ ...p, ...detail, _detailed: true }));

/** Cari bisnis dengan kunci tertentu di laporan. */
export const findByKey = (R: Report, key: string) => (R.all || []).find((p) => leadKey(p) === key) ?? null;
