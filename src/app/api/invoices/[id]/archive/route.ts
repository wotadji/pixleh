import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";

/**
 * Archivage/désarchivage d'une facture — parité avec /api/contracts/[id]/archive (demandé par
 * Adriel, 31/07/2026 : "amener la facturation au même niveau de rigueur que les contrats").
 * `archived` n'existe pas encore dans le Prisma Client généré du sandbox (voir schema.prisma)
 * — lu/écrit via $queryRaw/$executeRaw, même workaround que Contract.archived. Autorisé à
 * n'importe quel statut, comme pour les contrats.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const existing = await prisma.invoice.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!existing) throw new AccessError("Facture introuvable", 404);

    const body = await req.json();
    const archived = Boolean(body.archived);

    await prisma.$executeRaw`UPDATE "Invoice" SET archived = ${archived} WHERE id = ${existing.id}`;

    return NextResponse.json({ archived });
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
