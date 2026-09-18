import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage } from "@/lib/storage";

export async function DELETE(_req: Request, { params }: { params: { id: string; fileId: string } }) {
  try {
    const session = await requireStudioSession();
    const transfer = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "QuickTransfer" WHERE id = ${params.id} AND "studioId" = ${session.user.studioId}
    `;
    if (!transfer[0]) throw new AccessError("Transfert introuvable", 404);

    const rows = await prisma.$queryRaw<{ storageKey: string }[]>`
      SELECT "storageKey" FROM "QuickTransferFile" WHERE id = ${params.fileId} AND "transferId" = ${params.id}
    `;
    const file = rows[0];
    if (!file) throw new AccessError("Fichier introuvable", 404);

    await prisma.$executeRaw`DELETE FROM "QuickTransferFile" WHERE id = ${params.fileId}`;

    try {
      await getStorage().delete(file.storageKey);
    } catch {
      // best-effort
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
