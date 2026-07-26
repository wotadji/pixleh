import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { cookieNameFor, issueGalleryToken } from "@/lib/gallery-session";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Vérifie le mot de passe d'une galerie et pose un cookie de session
 * (30 jours) scoppé à cette galerie si correct.
 */
export async function POST(req: Request) {
  const { slug, password } = await req.json();
  if (!slug) return NextResponse.json({ error: "slug manquant" }, { status: 400 });

  // Le mot de passe de galerie est un code court partagé avec le client (pas un mot de
  // passe de compte) : sans limite, il serait tentable de le retrouver par force brute.
  // 20 essais / 15 min par IP et par galerie — large pour un client qui se trompe en
  // recopiant le code, bloquant pour un script.
  const ip = getClientIp(req);
  const limited = rateLimit(`gallery-password:${ip}:${slug}`, 20, 15 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const gallery = await prisma.gallery.findUnique({ where: { slug } });
  if (!gallery || gallery.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });
  }
  if (gallery.expiresAt && gallery.expiresAt < new Date()) {
    return NextResponse.json({ error: "Cette galerie a expiré" }, { status: 410 });
  }
  if (gallery.password && gallery.password !== password) {
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
  }

  const clientRef = randomUUID();
  const token = issueGalleryToken({ galleryId: gallery.id, clientRef });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieNameFor(gallery.slug), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
