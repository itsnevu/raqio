// Sesi login sederhana: cookie berisi token "exp.sig", sig = HMAC-SHA256(exp, AUTH_SECRET).
// Dipakai di middleware (Edge) dan route handler (Node), jadi hanya pakai Web Crypto.
export const COOKIE = "raqio_session";
const DAYS = 7;

function secret() {
  return process.env.AUTH_SECRET || "ganti-di-env-AUTH_SECRET";
}

async function hmac(msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, "");
}

export async function makeToken() {
  const exp = String(Date.now() + DAYS * 864e5);
  return `${exp}.${await hmac(exp)}`;
}

export async function verifyToken(token: string | undefined) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || +exp < Date.now()) return false;
  const want = await hmac(exp);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export function checkCredentials(user: string, pass: string) {
  const u = process.env.AUTH_USER || "", p = process.env.AUTH_PASS || "";
  if (!u || !p) return false;
  return user === u && pass === p;
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production" && process.env.AUTH_INSECURE_COOKIE !== "1",
  maxAge: DAYS * 86400,
};
