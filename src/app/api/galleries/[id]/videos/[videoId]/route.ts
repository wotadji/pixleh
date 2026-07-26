import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage } from "@/lib/storage";

/** Renomme une vidéo (titre uniquement — pour changer le lien, on la supprime et on en
 * recolle une nouvelle plutôt que de gérer un ré-upsert des métadonnées oEmbed). */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; videoId: string } }
) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const video = await prisma.video.findFirst({
      where: { id: params.videoId, galleryId: gallery.id },
    });
    if (!video) throw new AccessError("Vidéo introuvable", 404);

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : undefined;

    const updated = await prisma.video.update({
      where: { id: video.id },
      data: {
        ...(title && { title }),
        ...(typeof body.position === "number" && { position: body.position }),
      },
    });

    return NextResponse.json({ video: updated });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; videoId: string } }
) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const video = await prisma.video.findFirst({
      where: { id: params.videoId, galleryId: gallery.id },
    });
    if (!video) throw new AccessError("Vidéo introuvable", 404);

    // Vidéo auto-hébergée (upload direct) : le fichier stocké n'est référencé que par cette
    // ligne, on le supprime aussi pour ne pas laisser de fichier orphelin. Une vidéo externe
    // (Vimeo/YouTube) n'a pas de storageKey, rien à nettoyer côté stockage.
    if (video.storageKey) {
      try {
        await getStorage().delete(video.storageKey);
      } catch {
        // Le fichier peut déjà être absent (nettoyage manuel, etc.) — la suppression de la
        // ligne ne doit pas échouer pour ça.
      }
    }

    await prisma.video.delete({ where: { id: video.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
