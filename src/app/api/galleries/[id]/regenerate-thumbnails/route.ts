import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage } from "@/lib/storage";
import { regenerateThumbnail, regeneratePreview } from "@/lib/image";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Régénère les miniatures ET les aperçus web de toutes les photos d'une galerie, à partir
 * de leur fichier original, avec le rendu actuel (voir src/lib/image.ts). Utile pour :
 *  - appliquer un nouveau rendu de miniature (ex: couleur du letterboxing) aux photos déjà
 *    uploadées, sans quoi seules les nouvelles photos en bénéficieraient ;
 *  - "nettoyer" les aperçus de photos uploadées avant le passage au filigrane dynamique
 *    (voir Task #33), qui pouvaient avoir un filigrane gravé dedans par l'ancien système —
 *    regeneratePreview produit désormais toujours un aperçu propre, le filigrane étant
 *    appliqué à la volée au moment de servir l'image.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
      include: { photos: true },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const storage = getStorage();
    let regenerated = 0;
    const errors: string[] = [];

    for (const photo of gallery.photos) {
      try {
        const originalBuffer = await storage.get(photo.storageKey);
        await regenerateThumbnail({
          originalBuffer,
          studioId: gallery.studioId,
          galleryId: gallery.id,
          photoId: photo.id,
        });
        await regeneratePreview({
          originalBuffer,
          studioId: gallery.studioId,
          galleryId: gallery.id,
          photoId: photo.id,
        });
        // Bump `updatedAt` pour invalider l'URL versionnée (?v=...) côté client — sinon
        // le navigateur continue de servir l'ancienne image depuis son cache HTTP.
        await prisma.photo.update({ where: { id: photo.id }, data: { position: photo.position } });
        regenerated++;
      } catch (e) {
        errors.push(`${photo.filename}: ${e instanceof Error ? e.message : "erreur inconnue"}`);
      }
    }

    return NextResponse.json({ regenerated, total: gallery.photos.length, errors });
  } catch (e) {
    return handleApiError(e);
  }
}
