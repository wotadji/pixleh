import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Téléchargement d'un fichier RAW — réservé au studio (requireStudioSession), jamais de
 * pendant public/client/invité (voir le commentaire du modèle GalleryRawFile). */
export async function GET(_req: Request, { params }: { params: { id: string; fileId: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const rows = await prisma.$queryRaw<
      { filename: string; storageKey: string; mimeType: string | null }[]
    >`SELECT "filename", "storageKey", "mimeType" FROM "GalleryRawFile"
      WHERE "id" = ${params.fileId} AND "galleryId" = ${params.id}`;
    const file = rows[0];
    if (!file) throw new AccessError("Fichier introuvable", 404);

    const buffer = await getStorage().get(file.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
