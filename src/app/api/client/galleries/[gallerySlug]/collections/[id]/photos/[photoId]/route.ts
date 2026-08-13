import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/access";
import { requireClientCollectionAccess, getOwnedClientCollection, removePhotoFromClientCollection } from "@/lib/clientCollections";

/** Retire une photo d'une collection privée — ne supprime jamais la photo de la galerie elle-même. */
export async function DELETE(
  req: Request,
  { params }: { params: { gallerySlug: string; id: string; photoId: string } }
) {
  try {
    const { gallery, clientRef } = await requireClientCollectionAccess(params.gallerySlug);
    const collection = await getOwnedClientCollection(gallery.id, clientRef, params.id);
    if (!collection) return NextResponse.json({ error: "Collection introuvable" }, { status: 404 });

    await removePhotoFromClientCollection(collection.id, params.photoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
