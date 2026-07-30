import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limited = rateLimit(`guest-reject:${ip}`, 20, 15 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const { token } = await req.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
  }

  const guest = await prisma.galleryGuest.findUnique({ where: { approvalToken: token } });
  if (!guest || guest.status !== "PENDING") {
    return NextResponse.json(
      { error: "Cette demande a déjà été traitée ou n'existe plus." },
      { status: 410 }
    );
  }

  await prisma.galleryGuest.update({
    where: { id: guest.id },
    data: { status: "REJECTED", approvalToken: null },
  });

  return NextResponse.json({ ok: true });
}
