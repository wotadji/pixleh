import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";

/**
 * Déplace plusieurs photos vers un set (Collection) d'un coup, ou les remet dans "Toutes
 * les photos" (collectionId null) — même règle que le PATCH unitaire (src/app/api/
 * galleries/[id]/photos/[photoId]/route.ts), en une seule requête pour la sélection
 * multiple de l'onglet Photos (GalleryManager).
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

    if (body.collectionId) {
      const collection = await prisma.collection.findFirst({
        where: { id: body.collectionId, galleryId: gallery.id },
      });
      if (!collection) throw new AccessError("Set introuvable", 404);
    }

    const result = await prisma.photo.updateMany({
      where: { id: { in: photoIds }, galleryId: gallery.id },
      data: { collectionId: body.collectionId || null },
    });

    return NextResponse.json({ ok: true, moved: result.count });
  } catch (e) {
    return handleApiError(e);
  }
}
