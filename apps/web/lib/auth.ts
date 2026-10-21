// Verifikasi stateless token sesi yang diterbitkan Go API: "sid.exp.sig", sig = HMAC-SHA256(sid.exp, AUTH_SECRET).
// Go memegang AUTH_SECRET yang sama dan tetap mengecek tabel sessions (untuk logout/revoke).
export const COOKIE = "raqio_session";

function secret() {
  return process.env.AUTH_SECRET || "";
}

async function hmac(msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function verifyToken(token: string | undefined) {
  if (!token || !secret()) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [sid, exp, sig] = parts;
  if (!/^\d+$/.test(exp) || +exp < Date.now()) return false;
  const want = await hmac(sid + "." + exp);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
