import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage } from "@/lib/storage";

/**
 * Déplace une photo vers un set (Collection) ou la remet dans "Toutes les photos" (null).
 * Accepte aussi, indépendamment, `portfolioTagged`/`socialTagged` (booléens) pour
 * ajouter/retirer la photo du set Portfolio ou Réseaux sociaux SANS toucher à collectionId
 * (retour d'Adriel, 21/08/2026 — voir le commentaire sur ces champs dans schema.prisma).
 * Ces deux champs sont lus/écrits via $executeRaw : trop récents pour le Prisma Client
 * généré du sandbox (même limitation que Collection.isSocialDefault).
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; photoId: string } }
) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const photo = await prisma.photo.findFirst({
      where: { id: params.photoId, galleryId: gallery.id },
    });
    if (!photo) throw new AccessError("Photo introuvable", 404);

    const body = await req.json();

    if (body.collectionId !== undefined) {
      if (body.collectionId) {
        const collection = await prisma.collection.findFirst({
          where: { id: body.collectionId, galleryId: gallery.id },
        });
        if (!collection) throw new AccessError("Set introuvable", 404);
      }
      await prisma.photo.update({
        where: { id: photo.id },
        data: { collectionId: body.collectionId || null },
      });
    }

    if (typeof body.portfolioTagged === "boolean") {
      await prisma.$executeRaw`UPDATE "Photo" SET "portfolioTagged" = ${body.portfolioTagged} WHERE id = ${photo.id}`;
    }
    if (typeof body.socialTagged === "boolean") {
      await prisma.$executeRaw`UPDATE "Photo" SET "socialTagged" = ${body.socialTagged} WHERE id = ${photo.id}`;
    }

    const [updated] = await prisma.$queryRaw<
      { id: string; collectionId: string | null; portfolioTagged: boolean; socialTagged: boolean }[]
    >`SELECT "id", "collectionId", "portfolioTagged", "socialTagged" FROM "Photo" WHERE id = ${photo.id}`;

    return NextResponse.json({ photo: updated });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; photoId: string } }
) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const photo = await prisma.photo.findFirst({
      where: { id: params.photoId, galleryId: gallery.id },
    });
    if (!photo) throw new AccessError("Photo introuvable", 404);

    const storage = getStorage();
    await Promise.allSettled([
      storage.delete(photo.storageKey),
      photo.thumbKey ? storage.delete(photo.thumbKey) : Promise.resolve(),
      photo.previewKey ? storage.delete(photo.previewKey) : Promise.resolve(),
    ]);

    await prisma.photo.delete({ where: { id: photo.id } });

    if (gallery.coverPhotoId === photo.id) {
      const next = await prisma.photo.findFirst({ where: { galleryId: gallery.id } });
      await prisma.gallery.update({
        where: { id: gallery.id },
        data: { coverPhotoId: next?.id || null },
      });
    }

    revalidatePath("/dashboard/galleries");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
