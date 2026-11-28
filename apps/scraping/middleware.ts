import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifyToken } from "@/lib/auth";
import { buildCsp, makeNonce } from "@/lib/csp";
import { isPublicPath } from "@/lib/routes";
import { publicOrigin } from "@/lib/publicOrigin";

// Semua halaman butuh sesi. Endpoint data juga dilindungi di sini (cek tanda tangan) dan di Go (cek DB).
// Tiap respons membawa CSP dengan nonce; Next memakai nonce yang sama untuk skripnya sendiri (dibaca dari header request).
// Bahasa halaman akses: ?lang=en|id dari tautan Masuk di situs, lalu cookie raqio_lang, default Indonesia.
function langOf(req: NextRequest): { lang: "en" | "id"; fromQuery: boolean } {
  const q = req.nextUrl.searchParams.get("lang");
  if (q === "en" || q === "id") return { lang: q, fromQuery: true };
  return { lang: req.cookies.get("raqio_lang")?.value === "en" ? "en" : "id", fromQuery: false };
}

function withCsp(req: NextRequest) {
  const nonce = makeNonce();
  const { lang, fromQuery } = langOf(req);
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  headers.set("x-raqio-lang", lang);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  if (fromQuery) res.cookies.set("raqio_lang", lang, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return withCsp(req);
  const ok = await verifyToken(req.cookies.get(COOKIE)?.value);
  if (ok) return withCsp(req);
  if (req.headers.get("accept")?.includes("application/json") || req.method !== "GET") {
    return NextResponse.json({ error: "Belum login.", code: "unauthenticated" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : "?next=" + encodeURIComponent(pathname + req.nextUrl.search);
  // AUTO_GUEST=1 (dev): pengunjung tanpa sesi langsung masuk sebagai tamu, tanpa klik. Login tetap bisa lewat /login?manual=1
  if (process.env.AUTO_GUEST === "1" && pathname !== "/pilih-produk") url.searchParams.set("auto", "1");
  const { lang, fromQuery } = langOf(req);
  if (fromQuery) url.searchParams.set("lang", lang);
  return NextResponse.redirect(new URL(url.pathname + url.search, publicOrigin(req)));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
