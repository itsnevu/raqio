import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifyToken } from "@/lib/auth";

// Semua halaman butuh sesi. Endpoint data juga dilindungi di sini (cek tanda tangan) dan di Go (cek DB).
const PUBLIC = ["/login", "/register", "/forgot", "/reset", "/privacy", "/auth/login", "/auth/register", "/auth/forgot", "/auth/reset", "/auth/verify", "/auth/invite", "/billing/plans", "/billing/webhook/xendit", "/openapi.yaml", "/docs", "/metrics", "/logo.svg"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p)) return NextResponse.next();
  const ok = await verifyToken(req.cookies.get(COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (req.headers.get("accept")?.includes("application/json") || req.method !== "GET") {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : "?next=" + encodeURIComponent(pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
