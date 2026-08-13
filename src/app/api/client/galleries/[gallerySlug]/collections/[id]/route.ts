import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/access";
import {
  requireClientCollectionAccess,
  getOwnedClientCollection,
  listClientCollectionPhotos,
  renameClientCollection,
  deleteClientCollection,
} from "@/lib/clientCollections";

/** Détail d'une collection privée (titre + ses photos) — pour la vue dédiée dans GalleryView. */
export async function GET(req: Request, { params }: { params: { gallerySlug: string; id: string } }) {
  try {
    const { gallery, clientRef } = await requireClientCollectionAccess(params.gallerySlug);
    const collection = await getOwnedClientCollection(gallery.id, clientRef, params.id);
    // 404 (pas 403) que la collection n'existe pas du tout OU qu'elle appartienne à un autre
    // client : ne jamais laisser deviner qu'un autre visiteur a créé une collection ici.
    if (!collection) return NextResponse.json({ error: "Collection introuvable" }, { status: 404 });

    const photos = await listClientCollectionPhotos(collection.id);
    return NextResponse.json({ collection, photos });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Renomme la collection (seul champ modifiable). */
export async function PATCH(req: Request, { params }: { params: { gallerySlug: string; id: string } }) {
  try {
    const { gallery, clientRef } = await requireClientCollectionAccess(params.gallerySlug);
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    if (!title) return NextResponse.json({ error: "Nom manquant" }, { status: 400 });

    const ok = await renameClientCollection(gallery.id, clientRef, params.id, title);
    if (!ok) return NextResponse.json({ error: "Collection introuvable" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Supprime la collection (jamais les photos de la galerie elle-même, seulement ce dossier
 * personnel). Vérifie explicitement `clientRef` avant toute suppression, voir
 * deleteClientCollection — impossible de supprimer la collection d'un autre client. */
export async function DELETE(req: Request, { params }: { params: { gallerySlug: string; id: string } }) {
  try {
    const { gallery, clientRef } = await requireClientCollectionAccess(params.gallerySlug);
    const ok = await deleteClientCollection(gallery.id, clientRef, params.id);
    if (!ok) return NextResponse.json({ error: "Collection introuvable" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
