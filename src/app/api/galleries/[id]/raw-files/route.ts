import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { assertStorageQuota } from "@/lib/quotas";
import { getStorage, buildRawFileKey } from "@/lib/storage";
import { rejectRawFileReason } from "@/lib/rawFileUpload";

export const runtime = "nodejs";
// Un RAW peut dépasser largement une photo classique (jusqu'à 300 Mo, voir
// MAX_RAW_FILE_SIZE_BYTES) — même marge que l'upload vidéo pour le temps de transfert SFTP.
export const maxDuration = 300;

/**
 * Fichiers RAW/originaux d'une galerie (voir modèle GalleryRawFile) — toujours privé,
 * réservé au studio (requireStudioSession uniquement, jamais de route publique équivalente
 * à /api/files/[...path] pour les photos). $queryRaw/$executeRaw : voir le commentaire du
 * modèle dans schema.prisma.
 *
 * `folderId` (query param GET, form field POST) — dossier courant de l'espace "Fichiers"
 * (voir GalleryRawFolder). Absent/vide = racine de la galerie. Ajouté le 18/09/2026
 * (chantier "espace comme sur un ordinateur", demande d'Adriel).
 */

async function assertGalleryOwnership(galleryId: string, studioId: string) {
  const gallery = await prisma.gallery.findFirst({ where: { id: galleryId, studioId } });
  if (!gallery) throw new AccessError("Galerie introuvable", 404);
  return gallery;
}

/** Vérifie que le dossier appartient bien à cette galerie (évite qu'un studio pointe vers le
 * dossier d'une autre galerie/un autre studio via un id deviné). */
async function assertFolderOwnership(folderId: string, galleryId: string) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "GalleryRawFolder" WHERE "id" = ${folderId} AND "galleryId" = ${galleryId}
  `;
  if (rows.length === 0) throw new AccessError("Dossier introuvable", 404);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    await assertGalleryOwnership(params.id, session.user.studioId);

    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get("folderId") || null;
    const archivedView = searchParams.get("archived") === "1";

    if (folderId) await assertFolderOwnership(folderId, params.id);

    if (archivedView) {
      // Vue "Archives" : tous les dossiers archivés à la racine (peu importe leur parent),
      // affichés à plat — voir GalleryRawFolder.archived dans schema.prisma. Pas de fichiers
      // à la racine dans cette vue : on navigue dans un dossier archivé pour voir son contenu.
      const folders = await prisma.$queryRaw<
        { id: string; name: string; parentId: string | null; archived: boolean; archivedAt: Date | null; createdAt: Date }[]
      >`SELECT "id", "name", "parentId", "archived", "archivedAt", "createdAt" FROM "GalleryRawFolder"
        WHERE "galleryId" = ${params.id} AND "archived" = true ORDER BY "archivedAt" DESC`;
      return NextResponse.json({ folders, files: [], folderId: null, archivedView: true });
    }

    const folders = folderId
      ? await prisma.$queryRaw<
          { id: string; name: string; parentId: string | null; archived: boolean; archivedAt: Date | null; createdAt: Date }[]
        >`SELECT "id", "name", "parentId", "archived", "archivedAt", "createdAt" FROM "GalleryRawFolder"
          WHERE "galleryId" = ${params.id} AND "parentId" = ${folderId} AND "archived" = false ORDER BY "name" ASC`
      : await prisma.$queryRaw<
          { id: string; name: string; parentId: string | null; archived: boolean; archivedAt: Date | null; createdAt: Date }[]
        >`SELECT "id", "name", "parentId", "archived", "archivedAt", "createdAt" FROM "GalleryRawFolder"
          WHERE "galleryId" = ${params.id} AND "parentId" IS NULL AND "archived" = false ORDER BY "name" ASC`;

    const files = folderId
      ? await prisma.$queryRaw<
          { id: string; filename: string; sizeBytes: number; mimeType: string | null; createdAt: Date }[]
        >`SELECT "id", "filename", "sizeBytes", "mimeType", "createdAt" FROM "GalleryRawFile"
          WHERE "galleryId" = ${params.id} AND "folderId" = ${folderId} ORDER BY "createdAt" DESC`
      : await prisma.$queryRaw<
          { id: string; filename: string; sizeBytes: number; mimeType: string | null; createdAt: Date }[]
        >`SELECT "id", "filename", "sizeBytes", "mimeType", "createdAt" FROM "GalleryRawFile"
          WHERE "galleryId" = ${params.id} AND "folderId" IS NULL ORDER BY "createdAt" DESC`;

    // Fil d'Ariane (breadcrumb) jusqu'à la racine, pour l'UI façon explorateur de fichiers.
    let breadcrumb: { id: string; name: string }[] = [];
    if (folderId) {
      const chain = await prisma.$queryRaw<{ id: string; name: string; parentId: string | null }[]>`
        WITH RECURSIVE ancestors AS (
          SELECT "id", "name", "parentId" FROM "GalleryRawFolder" WHERE "id" = ${folderId}
          UNION ALL
          SELECT f."id", f."name", f."parentId" FROM "GalleryRawFolder" f
          JOIN ancestors a ON f."id" = a."parentId"
        )
        SELECT "id", "name", "parentId" FROM ancestors
      `;
      // La CTE récursive remonte du dossier courant vers la racine : on inverse pour
      // obtenir l'ordre racine → courant attendu par l'UI.
      breadcrumb = chain.reverse().map((f) => ({ id: f.id, name: f.name }));
    }

    return NextResponse.json({ folders, files, folderId, breadcrumb });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await assertGalleryOwnership(params.id, session.user.studioId);

    const formData = await req.formData();
    const file = formData.get("file");
    if (typeof file === "string" || !file) {
      return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }
    const folderIdRaw = formData.get("folderId");
    const folderId = typeof folderIdRaw === "string" && folderIdRaw.length > 0 ? folderIdRaw : null;
    if (folderId) await assertFolderOwnership(folderId, gallery.id);

    const reason = rejectRawFileReason(file);
    if (reason === "unsupportedType") {
      return NextResponse.json({ error: "Format de fichier non pris en charge." }, { status: 400 });
    }
    if (reason === "tooLarge") {
      return NextResponse.json({ error: "Le fichier dépasse la taille maximale autorisée (300 Mo)." }, { status: 400 });
    }

    // [S2] Tâche #127 — même quota de stockage que photos/vidéos (voir src/lib/quotas.ts,
    // choix d'Adriel le 18/09/2026).
    await assertStorageQuota(gallery.studioId, file.size);

    const fileId = randomUUID();
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (path.extname(file.name).replace(".", "") || "raw").toLowerCase();
    // Clé de stockage volontairement indépendante du dossier (fileId uniquement) : déplacer
    // un fichier entre dossiers reste une simple mise à jour en base, jamais un déplacement
    // physique sur le stockage (voir buildRawFileKey dans src/lib/storage.ts).
    const storageKey = buildRawFileKey(gallery.studioId, gallery.id, fileId, ext);

    const storage = getStorage();
    await storage.put(storageKey, buffer);

    await prisma.$executeRaw`
      INSERT INTO "GalleryRawFile" ("id", "galleryId", "folderId", "filename", "storageKey", "sizeBytes", "mimeType", "createdAt")
      VALUES (${fileId}, ${gallery.id}, ${folderId}, ${file.name}, ${storageKey}, ${buffer.length}, ${file.type || null}, NOW())
    `;

    return NextResponse.json(
      {
        file: {
          id: fileId,
          filename: file.name,
          sizeBytes: buffer.length,
          mimeType: file.type || null,
          createdAt: new Date().toISOString(),
          folderId,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    return handleApiError(e);
  }
}
