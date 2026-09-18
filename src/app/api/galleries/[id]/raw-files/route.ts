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
 */

async function assertGalleryOwnership(galleryId: string, studioId: string) {
  const gallery = await prisma.gallery.findFirst({ where: { id: galleryId, studioId } });
  if (!gallery) throw new AccessError("Galerie introuvable", 404);
  return gallery;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    await assertGalleryOwnership(params.id, session.user.studioId);

    const files = await prisma.$queryRaw<
      { id: string; filename: string; sizeBytes: number; mimeType: string | null; createdAt: Date }[]
    >`SELECT "id", "filename", "sizeBytes", "mimeType", "createdAt" FROM "GalleryRawFile"
      WHERE "galleryId" = ${params.id} ORDER BY "createdAt" DESC`;

    return NextResponse.json({ files });
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
    const storageKey = buildRawFileKey(gallery.studioId, gallery.id, fileId, ext);

    const storage = getStorage();
    await storage.put(storageKey, buffer);

    await prisma.$executeRaw`
      INSERT INTO "GalleryRawFile" ("id", "galleryId", "filename", "storageKey", "sizeBytes", "mimeType", "createdAt")
      VALUES (${fileId}, ${gallery.id}, ${file.name}, ${storageKey}, ${buffer.length}, ${file.type || null}, NOW())
    `;

    return NextResponse.json(
      {
        file: {
          id: fileId,
          filename: file.name,
          sizeBytes: buffer.length,
          mimeType: file.type || null,
          createdAt: new Date().toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (e) {
    return handleApiError(e);
  }
}
