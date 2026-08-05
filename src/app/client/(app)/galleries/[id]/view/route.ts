import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getClientPortalSession } from "@/lib/clientSession";
import { cookieNameFor, issueGalleryToken } from "@/lib/gallery-session";
import { hasAdditionalGalleryAccess } from "@/lib/galleryClientAccess";

export const runtime = "nodejs";

/**
 * Pointé par le bouton "Voir galerie" de /client (liste des galeries) — évite de faire
 * ressaisir le code de la galerie à un client déjà authentifié dans l'espace Client
 * (ClientAccount, voir clientSession.ts) alors qu'on sait déjà que son email correspond au
 * Client CRM propriétaire de cette galerie. Pose directement un cookie de session galerie
 * (même mécanisme que POST /api/gallery-access après saisie du code, voir gallery-session.ts)
 * puis redirige vers /g/[slug] — simple lien GET (pas de fetch + navigation côté client),
 * donc pas besoin de composant client pour ce bouton.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = getClientPortalSession();
  if (!session) return NextResponse.redirect(new URL("/client/login", _req.url));

  const gallery = await prisma.gallery.findUnique({
    where: { id: params.id },
    include: { client: true },
  });
  // Client principal OU additionnel (voir GalleryClientAccess) — même accès en lecture au
  // visionneur pour les deux, seul le principal pilote facturation/devis/notifications.
  const isOwner = gallery?.client?.email === session.email;
  const hasAccess = isOwner || (gallery ? await hasAdditionalGalleryAccess(gallery.id, session.email) : false);
  if (!gallery || !hasAccess || gallery.status === "DRAFT") {
    return NextResponse.redirect(new URL("/client", _req.url));
  }

  const clientRef = randomUUID();
  const token = issueGalleryToken({ galleryId: gallery.id, clientRef });

  const res = NextResponse.redirect(new URL(`/g/${gallery.slug}`, _req.url));
  res.cookies.set(cookieNameFor(gallery.slug), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
