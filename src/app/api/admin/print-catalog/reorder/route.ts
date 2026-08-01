import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin, handleApiError } from "@/lib/access";
import { reorderPrintCatalogItems } from "@/lib/printCatalog";

/**
 * Réordonnancement du catalogue impression par glisser-déposer (01/08/2026, demande d'Adriel :
 * "ajouter la possibilité de déplacer les groupe de produits pour classer par ordre d'affichage
 * (drill down par exemple)"). Reçoit la liste COMPLÈTE des ids d'un même "niveau" (soit les
 * lignes racine, soit les variantes d'un groupe précis) dans le nouvel ordre voulu — voir
 * reorderPrintCatalogItems, qui affecte sortOrder = index à chacune. Aucune validation
 * d'appartenance à un même niveau ici : l'admin UI ne peut de toute façon déplacer que dans une
 * même liste (racine ou variantes d'un groupe), jamais mélanger les deux.
 */
const reorderSchema = z.object({
  ids: z.array(z.string()).min(1),
});

export async function POST(req: Request) {
  try {
    await requirePlatformAdmin();
    const body = await req.json();
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    await reorderPrintCatalogItems(parsed.data.ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
