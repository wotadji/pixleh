import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage } from "@/lib/storage";

/** Suppression d'un fichier RAW (voir modèle GalleryRawFile) — $queryRaw/$executeRaw, voir
 * le commentaire du modèle dans schema.prisma. */
export async function DELETE(_req: Request, { params }: { params: { id: string; fileId: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const rows = await prisma.$queryRaw<{ storageKey: string }[]>`
      SELECT "storageKey" FROM "GalleryRawFile" WHERE "id" = ${params.fileId} AND "galleryId" = ${params.id}
    `;
    const file = rows[0];
    if (!file) throw new AccessError("Fichier introuvable", 404);

    await prisma.$executeRaw`DELETE FROM "GalleryRawFile" WHERE "id" = ${params.fileId}`;

    try {
      await getStorage().delete(file.storageKey);
    } catch {
      // Best-effort : l'entrée en base est déjà retirée, un fichier orphelin sur le
      // stockage n'est pas bloquant pour l'utilisateur (même logique que la suppression
      // photo existante).
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
