import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { sanitizeVisibility } from "@/lib/setVisibility";

/** Renomme un set. */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; collectionId: string } }
) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const collection = await prisma.collection.findFirst({
      where: { id: params.collectionId, galleryId: gallery.id },
    });
    if (!collection) throw new AccessError("Set introuvable", 404);

    const body = await req.json();
    const visibility = sanitizeVisibility(body.visibility);
    const updated = await prisma.collection.update({
      where: { id: collection.id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(visibility !== undefined && { visibility }),
      },
    });

    return NextResponse.json({ collection: updated });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Supprime un set (les photos qu'il contenait retournent dans "Toutes les photos"). */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; collectionId: string } }
) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const collection = await prisma.collection.findFirst({
      where: { id: params.collectionId, galleryId: gallery.id },
    });
    if (!collection) throw new AccessError("Set introuvable", 404);

    await prisma.collection.delete({ where: { id: collection.id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
