import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE } from "@/lib/auth";
import { safeHttpUrl } from "@/lib/safe";
import { publicOrigin } from "@/lib/publicOrigin";

/**
 * Buka produk Raqio di host lain dengan tiket SSO sekali pakai (apps/api/sso.go). Cookie sesi Raqio tidak pernah
 * dibagikan: server ini meminta tiket 60 detik ke API, browser membawanya di fragmen URL ke produk tujuan, lalu server
 * tujuan menukarnya ke API dengan rahasia bersama. Hak produk dicek API (403 product_required).
 */
const TARGETS: Record<string, () => string | null> = {
  wasuite: () => safeHttpUrl(process.env.WASUITE_APP_URL ?? process.env.NEXT_PUBLIC_WASUITE_APP_URL ??
    (process.env.NODE_ENV === "development" ? "http://localhost:3001" : undefined)),
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/pilih-produk?${q}`, publicOrigin(req)), 303);
  const toLogin = () => NextResponse.redirect(new URL("/login?next=%2Fpilih-produk", publicOrigin(req)), 303);
  const target = TARGETS[product]?.();
  if (!target) return back("error=unavailable");
  const session = (await cookies()).get(COOKIE);
  if (!session) return toLogin();

  let res: Response;
  try {
    res = await fetch(new URL("/auth/sso/ticket", process.env.API_URL || "http://127.0.0.1:8080"), {
      method: "POST",
      cache: "no-store",
      headers: { Cookie: `${COOKIE}=${session.value}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ product }),
    });
  } catch {
    return back("error=unavailable");
  }
  if (res.status === 401) return toLogin();
  const j = (await res.json().catch(() => ({}))) as { ticket?: string; code?: string };
  if (!res.ok || !j.ticket) return back(`error=${encodeURIComponent(j.code || "unavailable")}&product=${product}`);

  // tiket di fragmen URL: tidak pernah dikirim browser ke server mana pun (tidak masuk log maupun Referer);
  // halaman WA-Suite membacanya sekali, menghapusnya dari alamat, lalu menukarnya lewat POST /api/login.
  const dest = new URL("/", target);
  dest.hash = "raqio-ticket=" + j.ticket;
  const out = NextResponse.redirect(dest, 303);
  out.headers.set("Cache-Control", "no-store");
  out.headers.set("Referrer-Policy", "no-referrer");
  return out;
}
