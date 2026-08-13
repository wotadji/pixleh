import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/access";
import {
  requireClientCollectionAccess,
  listClientCollections,
  createClientCollection,
} from "@/lib/clientCollections";

/**
 * Collections privées du CLIENT connecté pour une galerie (12/08/2026, demande d'Adriel :
 * "comme pour un concurent, pouvons nous creer les colections dans la galerie (uniquement par
 * le client)") — voir GalleryView.tsx (onglet "Mes collections") et
 * src/lib/clientCollections.ts pour le contexte complet (confidentialité, limitation sandbox).
 */
export async function GET(req: Request, { params }: { params: { gallerySlug: string } }) {
  try {
    const { gallery, clientRef } = await requireClientCollectionAccess(params.gallerySlug);
    const collections = await listClientCollections(gallery.id, clientRef);
    return NextResponse.json({ collections });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request, { params }: { params: { gallerySlug: string } }) {
  try {
    const { gallery, clientRef } = await requireClientCollectionAccess(params.gallerySlug);
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    if (!title) return NextResponse.json({ error: "Nom manquant" }, { status: 400 });

    const collection = await createClientCollection(gallery.id, clientRef, title);
    return NextResponse.json({ collection: { ...collection, photoCount: 0, coverPhotoId: null } }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
