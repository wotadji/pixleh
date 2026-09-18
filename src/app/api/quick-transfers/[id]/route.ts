import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function assertTransferOwnership(id: string, studioId: string) {
  const rows = await prisma.$queryRaw<{ id: string; slug: string; title: string | null; message: string | null; recipientEmail: string | null; status: string; createdAt: Date; expiresAt: Date; frozenAt: Date | null }[]>`
    SELECT id, slug, title, message, "recipientEmail", status, "createdAt", "expiresAt", "frozenAt"
    FROM "QuickTransfer" WHERE id = ${id} AND "studioId" = ${studioId}
  `;
  const transfer = rows[0];
  if (!transfer) throw new AccessError("Transfert introuvable", 404);
  return transfer;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const transfer = await assertTransferOwnership(params.id, session.user.studioId);

    const files = await prisma.$queryRaw<
      { id: string; filename: string; sizeBytes: number; mimeType: string | null; createdAt: Date }[]
    >`SELECT id, filename, "sizeBytes", "mimeType", "createdAt" FROM "QuickTransferFile"
      WHERE "transferId" = ${params.id} ORDER BY "createdAt" DESC`;

    return NextResponse.json({
      transfer: {
        id: transfer.id,
        slug: transfer.slug,
        title: transfer.title,
        message: transfer.message,
        recipientEmail: transfer.recipientEmail,
        status: transfer.status === "FROZEN" || transfer.expiresAt < new Date() ? "FROZEN" : "ACTIVE",
        createdAt: transfer.createdAt.toISOString(),
        expiresAt: transfer.expiresAt.toISOString(),
      },
      files: files.map((f) => ({
        id: f.id,
        filename: f.filename,
        sizeBytes: f.sizeBytes,
        mimeType: f.mimeType,
        createdAt: f.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Supprime le transfert ET ses fichiers stockés — contrairement au gel automatique (qui
 * conserve toujours les fichiers, voir le commentaire du modèle QuickTransfer), une
 * suppression manuelle par le studio est définitive. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    await assertTransferOwnership(params.id, session.user.studioId);

    const files = await prisma.$queryRaw<{ storageKey: string }[]>`
      SELECT "storageKey" FROM "QuickTransferFile" WHERE "transferId" = ${params.id}
    `;
    const storage = getStorage();
    for (const f of files) {
      try {
        await storage.delete(f.storageKey);
      } catch {
        // best-effort — voir la même logique sur la suppression d'un fichier RAW.
      }
    }

    await prisma.$executeRaw`DELETE FROM "QuickTransfer" WHERE id = ${params.id}`;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
