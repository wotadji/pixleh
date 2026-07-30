import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { issueClientToken, CLIENT_SESSION_COOKIE } from "@/lib/clientSession";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limited = rateLimit(`client-login:${ip}`, 10, 15 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const { email, password } = await req.json();
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!cleanEmail || typeof password !== "string") {
    return NextResponse.json({ error: "Identifiants invalides" }, { status: 400 });
  }

  const account = await prisma.clientAccount.findUnique({ where: { email: cleanEmail } });
  if (!account?.passwordHash) {
    return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
  }
  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
  }
  if (!account.emailVerified) {
    return NextResponse.json(
      { error: "Confirmez votre email avant de vous connecter — vérifiez votre boîte de réception." },
      { status: 403 }
    );
  }

  const token = issueClientToken({ clientAccountId: account.id, email: account.email });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CLIENT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
