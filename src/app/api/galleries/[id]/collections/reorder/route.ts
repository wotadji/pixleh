import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";

/**
 * Réordonnancement manuel des sessions (Collections) par glisser-déposer (sidebar Photos,
 * GalleryManager) — demande d'Adriel le 14/09/2026 ("on peux drag and drop les position de
 * sections"), même principe que /api/galleries/[id]/photos/reorder. Le client envoie la
 * liste COMPLÈTE des ids de sessions de la galerie dans le nouvel ordre voulu ; chaque
 * session reçoit `position` = son index dans ce tableau.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const body = await req.json();
    const collectionIds: string[] = Array.isArray(body.collectionIds)
      ? body.collectionIds.filter((id: unknown) => typeof id === "string")
      : [];
    if (collectionIds.length === 0) {
      return NextResponse.json({ error: "Aucune session à réordonner" }, { status: 400 });
    }

    const existing = await prisma.collection.findMany({
      where: { galleryId: gallery.id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((c) => c.id));
    // Sécurité : on n'accepte que des ids appartenant bien à cette galerie, et on ignore
    // silencieusement le reste (ex. session supprimée entre-temps dans un autre onglet).
    const validIds = collectionIds.filter((id) => existingIds.has(id));
    if (validIds.length === 0) {
      return NextResponse.json({ error: "Sessions introuvables" }, { status: 400 });
    }

    await prisma.$transaction(
      validIds.map((id, index) => prisma.collection.update({ where: { id }, data: { position: index } }))
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
