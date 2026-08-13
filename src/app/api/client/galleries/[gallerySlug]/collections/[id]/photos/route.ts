import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/access";
import { requireClientCollectionAccess, getOwnedClientCollection, addPhotosToClientCollection } from "@/lib/clientCollections";

/** Ajoute une ou plusieurs photos à une collection privée du client — utilisé à la fois par
 * l'icône "Ajouter à une collection" d'une vignette (une seule photo) et par la sélection
 * multiple de la grille (voir GalleryView.tsx). */
export async function POST(req: Request, { params }: { params: { gallerySlug: string; id: string } }) {
  try {
    const { gallery, clientRef } = await requireClientCollectionAccess(params.gallerySlug);
    const collection = await getOwnedClientCollection(gallery.id, clientRef, params.id);
    if (!collection) return NextResponse.json({ error: "Collection introuvable" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const photoIds: string[] = Array.isArray(body.photoIds)
      ? body.photoIds.filter((v: unknown): v is string => typeof v === "string")
      : [];
    if (photoIds.length === 0) return NextResponse.json({ error: "Aucune photo fournie" }, { status: 400 });

    // Ne retient que les photos qui appartiennent réellement à CETTE galerie — un client ne
    // doit pas pouvoir référencer la photo d'une autre galerie dans sa collection.
    const validPhotos = await prisma.photo.findMany({
      where: { id: { in: photoIds }, galleryId: gallery.id },
      select: { id: true },
    });
    if (validPhotos.length === 0) return NextResponse.json({ error: "Aucune photo valide" }, { status: 400 });

    await addPhotosToClientCollection(
      collection.id,
      validPhotos.map((p) => p.id)
    );
    return NextResponse.json({ ok: true, added: validPhotos.length });
  } catch (e) {
    return handleApiError(e);
  }
}
