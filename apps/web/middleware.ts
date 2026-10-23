import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifyToken } from "@/lib/auth";
import { buildCsp, makeNonce } from "@/lib/csp";
import { isPublicPath } from "@/lib/routes";

// Semua halaman butuh sesi. Endpoint data juga dilindungi di sini (cek tanda tangan) dan di Go (cek DB).
// Tiap respons membawa CSP dengan nonce; Next memakai nonce yang sama untuk skripnya sendiri (dibaca dari header request).
function withCsp(req: NextRequest) {
  const nonce = makeNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
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
  if (process.env.AUTO_GUEST === "1") url.searchParams.set("auto", "1");
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
