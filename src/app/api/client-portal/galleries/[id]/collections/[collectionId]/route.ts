import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientPortalSession } from "@/lib/clientSession";
import { sanitizeVisibility } from "@/lib/setVisibility";

export const runtime = "nodejs";

/**
 * Équivalent client-portal de PATCH /api/galleries/[id]/collections/[collectionId] — permet
 * au CLIENT (pas au studio) de gérer la visibilité de ses propres sets (Client/Invité,
 * activer/désactiver le set Portfolio) depuis /client/galleries/[id]. Protégé par la session
 * client (voir clientSession.ts) plutôt que requireStudioSession, avec vérification explicite
 * que la galerie appartient bien à un Client dont l'email correspond à la session — jamais
 * par studioId, puisque l'espace client n'a pas de notion de studio courant.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; collectionId: string } }
) {
  const session = getClientPortalSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const gallery = await prisma.gallery.findUnique({
    where: { id: params.id },
    include: { client: true },
  });
  if (!gallery || gallery.client?.email !== session.email) {
    return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });
  }

  const collection = await prisma.collection.findFirst({
    where: { id: params.collectionId, galleryId: gallery.id },
  });
  if (!collection) return NextResponse.json({ error: "Set introuvable" }, { status: 404 });

  const body = await req.json();
  const visibility = sanitizeVisibility(body.visibility);
  if (visibility === undefined) {
    return NextResponse.json({ error: "Visibilité invalide" }, { status: 400 });
  }

  const updated = await prisma.collection.update({
    where: { id: collection.id },
    data: { visibility },
  });

  return NextResponse.json({ collection: updated });
}
