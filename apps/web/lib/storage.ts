// localStorage dengan namespace org_id: data satu org (penawaran, tujuan riset, sid chat) tidak bocor ke org lain
// di browser yang sama, dan bisa dibersihkan saat logout. Sebelum org diketahui, kunci memakai namespace "anon".

let orgId = "anon";
const PREFIX = "raqio:";

export const setOrgId = (id: string | null | undefined) => {
  orgId = id || "anon";
};
export const getOrgId = () => orgId;
export const lsKey = (k: string) => `${PREFIX}${orgId}:${k}`;

export function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(lsKey(k));
  } catch {
    return null;
  }
}
export function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(lsKey(k), v);
  } catch {}
}
export function lsRemove(k: string) {
  try {
    localStorage.removeItem(lsKey(k));
  } catch {}
}

/** Hapus semua data per org (semua org) dan kunci lama tanpa namespace. Dipanggil saat logout. */
export function clearOrgStorage() {
  try {
    const legacy = ["offer", "goals", "sid", "guest_hours"];
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX) || legacy.includes(k));
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

/** Nilai yang tidak terikat org (mis. jam kedaluwarsa tamu, disimpan sebelum org diketahui). Ikut dibersihkan saat logout. */
export function lsGetGlobal(k: string): string | null {
  try {
    return localStorage.getItem(`${PREFIX}anon:${k}`);
  } catch {
    return null;
  }
}
export function lsSetGlobal(k: string, v: string) {
  try {
    localStorage.setItem(`${PREFIX}anon:${k}`, v);
  } catch {}
}
