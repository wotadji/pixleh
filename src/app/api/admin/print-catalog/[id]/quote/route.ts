import { NextResponse } from "next/server";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";
import { getPrintCatalogItem, updatePrintCatalogItem } from "@/lib/printCatalog";
import { getProdigiQuote } from "@/lib/prodigiSync";
import { prisma } from "@/lib/prisma";

/**
 * Bouton "Resynchroniser" du panel admin (/admin/print-catalog) : redemande le coût de
 * revient actuel auprès de Prodigi pour le SKU de ce produit et met à jour
 * wholesaleCostCents — n'écrase JAMAIS priceCents (le prix de vente pixleh), qui reste
 * toujours fixé manuellement.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const existing = await getPrintCatalogItem(params.id);
    if (!existing) throw new AccessError("Produit catalogue introuvable.", 404);
    if (!existing.sku) {
      return NextResponse.json({ error: "Aucun SKU Prodigi renseigné pour ce produit." }, { status: 400 });
    }

    const quote = await getProdigiQuote({ sku: existing.sku });
    if (!quote.synced) {
      return NextResponse.json({ prodigiSync: quote }, { status: 200 });
    }

    const item = await updatePrintCatalogItem(params.id, { wholesaleCostCents: quote.unitCostCents ?? null });

    // Mémorise les attributs Prodigi (ex: finish=Lustre) qui ont permis d'obtenir CE devis —
    // colonne pas encore dans le Prisma Client généré (tâche #254), même workaround $executeRaw
    // que le reste du catalogue plateforme. Réutilisé par la soumission de commande réelle
    // (src/lib/prodigiOrder.ts, phase 2) pour ne pas redécouvrir/deviner ces attributs à chaque
    // commande cliente.
    const attributesJson =
      quote.attributesUsed && Object.keys(quote.attributesUsed).length > 0
        ? JSON.stringify(quote.attributesUsed)
        : null;
    await prisma.$executeRaw`UPDATE "Product" SET "prodigiAttributes" = ${attributesJson} WHERE "id" = ${params.id}`;

    return NextResponse.json({ item, prodigiSync: quote });
  } catch (e) {
    return handleApiError(e);
  }
}
