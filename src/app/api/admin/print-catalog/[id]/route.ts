import { NextResponse } from "next/server";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";
import { printCatalogItemSchema } from "@/lib/validators";
import {
  getPrintCatalogItem,
  updatePrintCatalogItem,
  deletePrintCatalogItem,
  countPrintCatalogItemUsage,
} from "@/lib/printCatalog";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const body = await req.json();
    const parsed = printCatalogItemSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await getPrintCatalogItem(params.id);
    if (!existing) throw new AccessError("Produit catalogue introuvable.", 404);

    const item = await updatePrintCatalogItem(params.id, {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description ?? null }),
      ...(parsed.data.priceCents !== undefined && { priceCents: parsed.data.priceCents }),
      ...(parsed.data.currency !== undefined && { currency: parsed.data.currency }),
      ...(parsed.data.sku !== undefined && { sku: parsed.data.sku ?? null }),
      ...(parsed.data.imageUrl !== undefined && { imageUrl: parsed.data.imageUrl ?? null }),
      ...(parsed.data.active !== undefined && { active: parsed.data.active }),
      ...(parsed.data.wholesaleCostCents !== undefined && {
        wholesaleCostCents: parsed.data.wholesaleCostCents ?? null,
      }),
    });

    return NextResponse.json({ item });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * Même garde-fou que la suppression d'un Plan : si ce produit catalogue est déjà référencé
 * par une commande ou une sélection client existante, on refuse la suppression (casserait
 * l'historique) et on invite à désactiver (`active: false`) à la place.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const existing = await getPrintCatalogItem(params.id);
    if (!existing) throw new AccessError("Produit catalogue introuvable.", 404);

    const usage = await countPrintCatalogItemUsage(params.id);
    if (usage > 0) {
      throw new AccessError(
        `Ce produit est référencé par ${usage} commande(s)/sélection(s) — désactivez-le plutôt que de le supprimer.`,
        409
      );
    }

    await deletePrintCatalogItem(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
