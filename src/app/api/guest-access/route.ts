import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { cookieNameFor, issueGalleryToken } from "@/lib/gallery-session";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { sendStudioNewGalleryGuestEmail } from "@/lib/notifications";

/**
 * Équivalent de /api/gallery-access pour le lien "invité" (/invite/[guestSlug]) : pas de
 * mot de passe, juste un email. On enregistre cet email dans GalleryGuest (contrairement
 * au lien client, où l'email n'est jamais demandé) et on pose un cookie de session sur le
 * même mécanisme que le lien client (voir gallery-session.ts), scoppé au `guestSlug`
 * plutôt qu'au `slug` — les deux liens ont donc des sessions indépendantes.
 */
export async function POST(req: Request) {
  const { guestSlug, email } = await req.json();
  if (!guestSlug) return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  // Évite qu'un lien invité soit utilisé pour spammer la table GalleryGuest (création en
  // masse de faux emails) — limite large pour ne pas gêner un vrai afflux d'invités.
  const ip = getClientIp(req);
  const limited = rateLimit(`guest-access:${ip}`, 30, 15 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const gallery = await prisma.gallery.findUnique({ where: { guestSlug } });
  if (!gallery || gallery.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });
  }
  if (gallery.expiresAt && gallery.expiresAt < new Date()) {
    return NextResponse.json({ error: "Cette galerie a expiré" }, { status: 410 });
  }

  // Un même email qui revient garde le même clientRef (retrouvé par email+galerie),
  // plutôt que d'en recréer un nouveau à chaque visite.
  let guest = await prisma.galleryGuest.findFirst({
    where: { galleryId: gallery.id, email: cleanEmail },
  });
  if (!guest) {
    guest = await prisma.galleryGuest.create({
      data: { galleryId: gallery.id, email: cleanEmail, clientRef: randomUUID() },
    });
    // Uniquement à la première visite de cet email sur CETTE galerie (voir le `if (!guest)`
    // ci-dessus) — best-effort, ne doit jamais faire échouer l'accès à la galerie (voir
    // sendMail, qui logge déjà l'échec sans lever d'exception).
    sendStudioNewGalleryGuestEmail({
      studioId: gallery.studioId,
      galleryId: gallery.id,
      galleryTitle: gallery.title,
      guestEmail: cleanEmail,
    }).catch((e) => console.error("Échec de la notification nouvel invité :", e));
  }

  const token = issueGalleryToken({ galleryId: gallery.id, clientRef: guest.clientRef });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieNameFor(guestSlug), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
