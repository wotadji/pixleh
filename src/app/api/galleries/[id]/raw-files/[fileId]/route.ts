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

/**
 * Renommer et/ou déplacer un fichier RAW (voir modèle GalleryRawFile) — 18/09/2026, demande
 * d'Adriel : "renommer les images et les dossiers" + "organiser son espace". Le déplacement
 * (changement de `folderId`) est une simple mise à jour en base : la clé de stockage ne
 * dépend jamais du dossier (voir buildRawFileKey dans src/lib/storage.ts).
 *
 * Body JSON : `{ filename?: string, folderId?: string | null }`. `folderId: null` déplace le
 * fichier à la racine de l'espace Fichiers.
 */
export async function PATCH(req: Request, { params }: { params: { id: string; fileId: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "GalleryRawFile" WHERE "id" = ${params.fileId} AND "galleryId" = ${params.id}
    `;
    if (existing.length === 0) throw new AccessError("Fichier introuvable", 404);

    const body = await req.json().catch(() => ({}));
    const filename = typeof body.filename === "string" ? body.filename.trim() : undefined;
    const hasFolderId = Object.prototype.hasOwnProperty.call(body, "folderId");
    const folderId: string | null | undefined = hasFolderId
      ? body.folderId === null
        ? null
        : typeof body.folderId === "string"
          ? body.folderId
          : undefined
      : undefined;

    if (filename !== undefined && filename.length === 0) {
      return NextResponse.json({ error: "Le nom ne peut pas être vide." }, { status: 400 });
    }

    if (folderId) {
      const folderRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "GalleryRawFolder" WHERE "id" = ${folderId} AND "galleryId" = ${params.id}
      `;
      if (folderRows.length === 0) throw new AccessError("Dossier introuvable", 404);
    }

    if (filename !== undefined && hasFolderId) {
      await prisma.$executeRaw`
        UPDATE "GalleryRawFile" SET "filename" = ${filename}, "folderId" = ${folderId}
        WHERE "id" = ${params.fileId}
      `;
    } else if (filename !== undefined) {
      await prisma.$executeRaw`
        UPDATE "GalleryRawFile" SET "filename" = ${filename} WHERE "id" = ${params.fileId}
      `;
    } else if (hasFolderId) {
      await prisma.$executeRaw`
        UPDATE "GalleryRawFile" SET "folderId" = ${folderId} WHERE "id" = ${params.fileId}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
