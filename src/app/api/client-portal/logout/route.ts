import { NextResponse } from "next/server";
import { CLIENT_SESSION_COOKIE } from "@/lib/clientSession";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CLIENT_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
