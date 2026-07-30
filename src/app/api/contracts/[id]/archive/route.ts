import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";

/**
 * Archivage/désarchivage d'un contrat (demandé par Adriel, 31/07/2026) — volontairement une
 * route à part de PATCH /api/contracts/[id] : celle-ci bloque toute modification une fois le
 * contrat SIGNED (le contenu signé doit rester intact), alors qu'archiver est une simple
 * bascule de visibilité dans la liste, autorisée à tout statut (mais utile surtout une fois
 * signé, une fois le contrat "clos"). `archived` n'existe pas encore dans le Prisma Client
 * généré du sandbox (voir commentaire sur ce champ dans schema.prisma) — lu/écrit via
 * $queryRaw/$executeRaw, même workaround que studioSignatureDataUrl/place.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const existing = await prisma.contract.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!existing) throw new AccessError("Contrat introuvable", 404);

    const body = await req.json();
    const archived = Boolean(body.archived);

    await prisma.$executeRaw`UPDATE "Contract" SET "archived" = ${archived} WHERE id = ${existing.id}`;

    return NextResponse.json({ archived });
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
