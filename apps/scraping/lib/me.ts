// Profil sesi (/auth/me) diambil sekali dan dibagi ke semua komponen; sekaligus menyetel namespace localStorage.
import { apiGet, type Me } from "./api";
import { setOrgId } from "./storage";

let cache: Me | null = null;
let inflight: Promise<Me> | null = null;
const resetHooks = new Set<() => void>();

export function getMe(force = false): Promise<Me> {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight)
    inflight = apiGet<Me>("/auth/me")
      .then((m) => {
        cache = m;
        setOrgId(m.org_id);
        return m;
      })
      .finally(() => {
        inflight = null;
      });
  return inflight;
}

export const peekMe = () => cache;

/** Dipanggil saat sesi berganti (login, logout, hapus akun, gabung tim). Store lain (mis. chat) ikut membersihkan diri. */
export function resetMe() {
  cache = null;
  inflight = null;
  resetHooks.forEach((f) => f());
}

/** Daftarkan pembersih yang dijalankan setiap resetMe(). Mengembalikan fungsi untuk melepasnya. */
export function onResetMe(fn: () => void) {
  resetHooks.add(fn);
  return () => {
    resetHooks.delete(fn);
  };
}
