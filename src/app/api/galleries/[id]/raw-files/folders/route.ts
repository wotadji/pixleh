import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";

/**
 * Création d'un dossier dans l'espace "Fichiers" d'une galerie (voir modèle GalleryRawFolder)
 * — 18/09/2026, demande d'Adriel : "je veux que le user puisse organiser son espace par la
 * creation des dossiers". $queryRaw/$executeRaw : voir le commentaire du modèle dans
 * schema.prisma.
 *
 * Body JSON : `{ name: string, parentId?: string | null }`.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Le nom du dossier est requis." }, { status: 400 });
    if (name.length > 120) {
      return NextResponse.json({ error: "Le nom du dossier est trop long (120 caractères max)." }, { status: 400 });
    }

    const parentId: string | null = typeof body.parentId === "string" && body.parentId.length > 0 ? body.parentId : null;
    if (parentId) {
      const parentRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "GalleryRawFolder" WHERE "id" = ${parentId} AND "galleryId" = ${gallery.id}
      `;
      if (parentRows.length === 0) throw new AccessError("Dossier parent introuvable", 404);
    }

    const folderId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "GalleryRawFolder" ("id", "galleryId", "parentId", "name", "archived", "createdAt", "updatedAt")
      VALUES (${folderId}, ${gallery.id}, ${parentId}, ${name}, false, NOW(), NOW())
    `;

    return NextResponse.json(
      { folder: { id: folderId, name, parentId, archived: false, archivedAt: null, createdAt: new Date().toISOString() } },
      { status: 201 }
    );
  } catch (e) {
    return handleApiError(e);
  }
}
