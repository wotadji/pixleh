import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";
import { marketingBlockMoveSchema } from "@/lib/validators";

/**
 * Réordonne un bloc en échangeant sa position avec son voisin immédiat (au-dessus ou
 * en-dessous, au sein de la même page) — plus simple et plus sûr qu'un drag-and-drop côté
 * client pour un premier jet : deux boutons ↑/↓, pas de recalcul de position pour toute la
 * liste à chaque déplacement.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const body = await req.json();
    const parsed = marketingBlockMoveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const current = await prisma.marketingBlock.findUnique({ where: { id: params.id } });
    if (!current) throw new AccessError("Bloc introuvable.", 404);

    const neighbor = await prisma.marketingBlock.findFirst({
      where: {
        page: current.page,
        position: parsed.data.direction === "up" ? { lt: current.position } : { gt: current.position },
      },
      orderBy: { position: parsed.data.direction === "up" ? "desc" : "asc" },
    });

    if (!neighbor) {
      // Déjà en première/dernière position : rien à faire, pas une erreur.
      return NextResponse.json({ ok: true });
    }

    await prisma.$transaction([
      prisma.marketingBlock.update({ where: { id: current.id }, data: { position: neighbor.position } }),
      prisma.marketingBlock.update({ where: { id: neighbor.id }, data: { position: current.position } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
