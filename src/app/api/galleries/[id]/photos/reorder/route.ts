import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";

/**
 * Réordonnancement manuel des photos par glisser-déposer (grille Photos, GalleryManager) —
 * demande d'Adriel le 14/09/2026 ("on peux drap and drop le positionnement des images").
 * Le client envoie la liste COMPLÈTE des ids de photos de la galerie dans le nouvel ordre
 * voulu ; chaque photo reçoit `position` = son index dans ce tableau. Ordre appliqué par
 * `sortPhotos` (src/lib/photoSort.ts) uniquement quand Gallery.photoSortOrder === "manual"
 * (basculé côté client via changeSortOrder au moment du glisser-déposer).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const body = await req.json();
    const photoIds: string[] = Array.isArray(body.photoIds)
      ? body.photoIds.filter((id: unknown) => typeof id === "string")
      : [];
    if (photoIds.length === 0) {
      return NextResponse.json({ error: "Aucune photo à réordonner" }, { status: 400 });
    }

    const existing = await prisma.photo.findMany({
      where: { galleryId: gallery.id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((p) => p.id));
    // Sécurité : on n'accepte que des ids appartenant bien à cette galerie, et on ignore
    // silencieusement le reste (ex. photo supprimée entre-temps dans un autre onglet).
    const validIds = photoIds.filter((id) => existingIds.has(id));
    if (validIds.length === 0) {
      return NextResponse.json({ error: "Photos introuvables" }, { status: 400 });
    }

    await prisma.$transaction(
      validIds.map((id, index) => prisma.photo.update({ where: { id }, data: { position: index } }))
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
