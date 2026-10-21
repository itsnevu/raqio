import { NextResponse } from "next/server";
import { COOKIE, checkCredentials, cookieOptions, makeToken } from "@/lib/auth";

// Rem sederhana: maksimal 10 percobaan gagal per IP per 15 menit (hilang saat restart).
const fails = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const f = fails.get(ip);
  if (f && f.n >= 10 && f.until > Date.now()) return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi 15 menit lagi." }, { status: 429 });

  let body: { user?: string; pass?: string } = {};
  try {
    body = await req.json();
  } catch {}
  if (!process.env.AUTH_USER || !process.env.AUTH_PASS) {
    return NextResponse.json({ error: "AUTH_USER dan AUTH_PASS belum diisi di apps/web/.env.local." }, { status: 500 });
  }
  if (!checkCredentials(String(body.user || ""), String(body.pass || ""))) {
    fails.set(ip, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 15 * 60e3 });
    return NextResponse.json({ error: "Username atau password salah." }, { status: 401 });
  }
  fails.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await makeToken(), cookieOptions);
  return res;
}
