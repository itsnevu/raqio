import { NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
