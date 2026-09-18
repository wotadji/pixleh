import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage } from "@/lib/storage";

/**
 * Renommer / archiver / désarchiver / déplacer un dossier (voir modèle GalleryRawFolder) —
 * 18/09/2026, demande d'Adriel. `archived` ne se propage jamais aux sous-dossiers en base
 * (voir le commentaire du modèle dans schema.prisma) : c'est la navigation qui traite "être
 * sous un dossier archivé" comme suffisant.
 *
 * Body JSON : `{ name?: string, archived?: boolean, parentId?: string | null }`. `parentId`
 * déplace le dossier ailleurs dans l'arborescence (glisser-déposer côté UI) — refusé si la
 * destination est le dossier lui-même ou l'un de ses propres descendants (cycle impossible).
 */
export async function PATCH(req: Request, { params }: { params: { id: string; folderId: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "GalleryRawFolder" WHERE "id" = ${params.folderId} AND "galleryId" = ${params.id}
    `;
    if (existing.length === 0) throw new AccessError("Dossier introuvable", 404);

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    if (name !== undefined && name.length === 0) {
      return NextResponse.json({ error: "Le nom ne peut pas être vide." }, { status: 400 });
    }
    if (name !== undefined && name.length > 120) {
      return NextResponse.json({ error: "Le nom du dossier est trop long (120 caractères max)." }, { status: 400 });
    }
    const archived = typeof body.archived === "boolean" ? body.archived : undefined;

    const hasParentId = Object.prototype.hasOwnProperty.call(body, "parentId");
    let parentId: string | null | undefined;
    if (hasParentId) {
      parentId = body.parentId === null ? null : typeof body.parentId === "string" ? body.parentId : undefined;
      if (parentId === params.folderId) {
        return NextResponse.json({ error: "Un dossier ne peut pas être déplacé dans lui-même." }, { status: 400 });
      }
      if (parentId) {
        const parentRows = await prisma.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "GalleryRawFolder" WHERE "id" = ${parentId} AND "galleryId" = ${params.id}
        `;
        if (parentRows.length === 0) throw new AccessError("Dossier de destination introuvable", 404);

        // Un dossier ne peut pas être déplacé dans l'un de ses propres descendants (cycle).
        const descendants = await prisma.$queryRaw<{ id: string }[]>`
          WITH RECURSIVE descendants AS (
            SELECT "id" FROM "GalleryRawFolder" WHERE "id" = ${params.folderId}
            UNION ALL
            SELECT f."id" FROM "GalleryRawFolder" f
            JOIN descendants d ON f."parentId" = d."id"
          )
          SELECT "id" FROM descendants
        `;
        if (descendants.some((d) => d.id === parentId)) {
          return NextResponse.json(
            { error: "Impossible de déplacer un dossier dans l'un de ses propres sous-dossiers." },
            { status: 400 }
          );
        }
      }
    }

    const setClauses: string[] = [];
    if (name !== undefined) setClauses.push("name");
    if (archived !== undefined) setClauses.push("archived");
    if (hasParentId && parentId !== undefined) setClauses.push("parentId");
    if (setClauses.length === 0) return NextResponse.json({ ok: true });

    if (name !== undefined && archived !== undefined && hasParentId) {
      await prisma.$executeRaw`
        UPDATE "GalleryRawFolder"
        SET "name" = ${name}, "archived" = ${archived}, "archivedAt" = ${archived ? new Date() : null},
            "parentId" = ${parentId}, "updatedAt" = NOW()
        WHERE "id" = ${params.folderId}
      `;
    } else if (name !== undefined && archived !== undefined) {
      await prisma.$executeRaw`
        UPDATE "GalleryRawFolder"
        SET "name" = ${name}, "archived" = ${archived}, "archivedAt" = ${archived ? new Date() : null}, "updatedAt" = NOW()
        WHERE "id" = ${params.folderId}
      `;
    } else if (name !== undefined && hasParentId) {
      await prisma.$executeRaw`
        UPDATE "GalleryRawFolder" SET "name" = ${name}, "parentId" = ${parentId}, "updatedAt" = NOW()
        WHERE "id" = ${params.folderId}
      `;
    } else if (archived !== undefined && hasParentId) {
      await prisma.$executeRaw`
        UPDATE "GalleryRawFolder"
        SET "archived" = ${archived}, "archivedAt" = ${archived ? new Date() : null}, "parentId" = ${parentId}, "updatedAt" = NOW()
        WHERE "id" = ${params.folderId}
      `;
    } else if (name !== undefined) {
      await prisma.$executeRaw`
        UPDATE "GalleryRawFolder" SET "name" = ${name}, "updatedAt" = NOW() WHERE "id" = ${params.folderId}
      `;
    } else if (archived !== undefined) {
      await prisma.$executeRaw`
        UPDATE "GalleryRawFolder"
        SET "archived" = ${archived}, "archivedAt" = ${archived ? new Date() : null}, "updatedAt" = NOW()
        WHERE "id" = ${params.folderId}
      `;
    } else if (hasParentId) {
      await prisma.$executeRaw`
        UPDATE "GalleryRawFolder" SET "parentId" = ${parentId}, "updatedAt" = NOW() WHERE "id" = ${params.folderId}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * Suppression récursive d'un dossier (voir modèle GalleryRawFolder) — supprime aussi tous les
 * sous-dossiers et fichiers qu'il contient. `ON DELETE CASCADE` (self-relation) nettoie les
 * lignes en base automatiquement, mais PAS les fichiers réellement stockés (SFTP/local) : on
 * les collecte donc récursivement AVANT de supprimer la ligne du dossier, puis on les efface
 * du stockage un par un (best-effort, comme la suppression fichier existante).
 */
export async function DELETE(_req: Request, { params }: { params: { id: string; folderId: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "GalleryRawFolder" WHERE "id" = ${params.folderId} AND "galleryId" = ${params.id}
    `;
    if (existing.length === 0) throw new AccessError("Dossier introuvable", 404);

    // Collecte récursive de tous les fichiers sous ce dossier (lui-même inclus), pour
    // pouvoir nettoyer le stockage physique avant la suppression cascade en base.
    const files = await prisma.$queryRaw<{ storageKey: string }[]>`
      WITH RECURSIVE descendants AS (
        SELECT "id" FROM "GalleryRawFolder" WHERE "id" = ${params.folderId}
        UNION ALL
        SELECT f."id" FROM "GalleryRawFolder" f
        JOIN descendants d ON f."parentId" = d."id"
      )
      SELECT rf."storageKey" FROM "GalleryRawFile" rf
      WHERE rf."folderId" IN (SELECT "id" FROM descendants)
    `;

    await prisma.$executeRaw`DELETE FROM "GalleryRawFolder" WHERE "id" = ${params.folderId}`;

    const storage = getStorage();
    await Promise.all(
      files.map((f) =>
        storage.delete(f.storageKey).catch(() => {
          // Best-effort : voir le commentaire équivalent dans DELETE .../raw-files/[fileId].
        })
      )
    );

    return NextResponse.json({ ok: true, deletedFiles: files.length });
  } catch (e) {
    return handleApiError(e);
  }
}
