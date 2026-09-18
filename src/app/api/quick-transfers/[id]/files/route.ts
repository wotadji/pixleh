import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { assertStorageQuota } from "@/lib/quotas";
import { getStorage, buildQuickTransferFileKey } from "@/lib/storage";
import { rejectRawFileReason } from "@/lib/rawFileUpload";

export const runtime = "nodejs";
// Même marge que l'upload de fichiers RAW (voir /api/galleries/[id]/raw-files) — des fichiers
// jusqu'à 300 Mo peuvent prendre du temps sur un transfert SFTP.
export const maxDuration = 300;

async function assertTransferOwnership(id: string, studioId: string) {
  const rows = await prisma.$queryRaw<{ id: string; status: string; expiresAt: Date }[]>`
    SELECT id, status, "expiresAt" FROM "QuickTransfer" WHERE id = ${id} AND "studioId" = ${studioId}
  `;
  const transfer = rows[0];
  if (!transfer) throw new AccessError("Transfert introuvable", 404);
  return transfer;
}

/**
 * Upload d'un fichier dans un Transfert rapide (voir modèle QuickTransferFile) — mêmes
 * règles de validation que le bouton "Fichiers" d'une galerie (traditionnels + RAW, voir
 * src/lib/rawFileUpload.ts, réutilisé tel quel).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const transfer = await assertTransferOwnership(params.id, session.user.studioId);
    if (transfer.status === "FROZEN" || transfer.expiresAt < new Date()) {
      throw new AccessError("Ce transfert est gelé — impossible d'ajouter des fichiers.", 403);
    }

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

    await assertStorageQuota(session.user.studioId, file.size);

    const fileId = randomUUID();
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (path.extname(file.name).replace(".", "") || "bin").toLowerCase();
    const storageKey = buildQuickTransferFileKey(session.user.studioId, params.id, fileId, ext);

    await getStorage().put(storageKey, buffer);

    await prisma.$executeRaw`
      INSERT INTO "QuickTransferFile" ("id", "transferId", "filename", "storageKey", "sizeBytes", "mimeType", "createdAt")
      VALUES (${fileId}, ${params.id}, ${file.name}, ${storageKey}, ${buffer.length}, ${file.type || null}, NOW())
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
