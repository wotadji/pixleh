import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage } from "@/lib/storage";

/**
 * Supprime plusieurs photos d'un coup (sélection multiple, voir l'onglet Photos de
 * GalleryManager) — même logique que le DELETE unitaire (src/app/api/galleries/[id]/photos/
 * [photoId]/route.ts) mais en une seule requête plutôt qu'un aller-retour par photo, et avec
 * un seul recalcul de coverPhotoId à la fin plutôt qu'à chaque suppression.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const body = await req.json();
    const photoIds: string[] = Array.isArray(body.photoIds) ? body.photoIds.filter((id: unknown) => typeof id === "string") : [];
    if (photoIds.length === 0) {
      return NextResponse.json({ error: "Aucune photo sélectionnée" }, { status: 400 });
    }

    const photos = await prisma.photo.findMany({
      where: { id: { in: photoIds }, galleryId: gallery.id },
    });
    if (photos.length === 0) {
      return NextResponse.json({ error: "Photos introuvables" }, { status: 404 });
    }

    const storage = getStorage();
    await Promise.allSettled(
      photos.flatMap((photo) => [
        storage.delete(photo.storageKey),
        photo.thumbKey ? storage.delete(photo.thumbKey) : Promise.resolve(),
        photo.previewKey ? storage.delete(photo.previewKey) : Promise.resolve(),
      ])
    );

    await prisma.photo.deleteMany({ where: { id: { in: photos.map((p) => p.id) } } });

    if (gallery.coverPhotoId && photos.some((p) => p.id === gallery.coverPhotoId)) {
      const next = await prisma.photo.findFirst({ where: { galleryId: gallery.id } });
      await prisma.gallery.update({
        where: { id: gallery.id },
        data: { coverPhotoId: next?.id || null },
      });
    }

    revalidatePath("/dashboard/galleries");
    return NextResponse.json({ ok: true, deleted: photos.length });
  } catch (e) {
    return handleApiError(e);
  }
}
