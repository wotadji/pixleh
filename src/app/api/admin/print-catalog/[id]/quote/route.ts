import { NextResponse } from "next/server";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";
import { getPrintCatalogItem, updatePrintCatalogItem } from "@/lib/printCatalog";
import { getProdigiQuote, getProdigiProductDetails } from "@/lib/prodigiSync";
import { prisma } from "@/lib/prisma";

/**
 * Bouton "Resynchroniser" du panel admin (/admin/print-catalog) : redemande le coût de
 * revient actuel auprès de Prodigi pour le SKU de ce produit et met à jour
 * wholesaleCostCents — n'écrase JAMAIS priceCents (le prix de vente pixleh), qui reste
 * toujours fixé manuellement.
 *
 * Récupère AUSSI la liste complète des attributs sélectionnables du SKU (chantier "sélection
 * d'attribut au moment de l'achat", 02/08/2026, demande d'Adriel : "je veux construire une
 * vraie UI de sélection d'attribut au moment de l'achat") via getProdigiProductDetails, en plus
 * du devis — un seul clic "Resynchroniser" suffit à la fois à rafraîchir le coût ET à activer/
 * mettre à jour le sélecteur d'attribut côté client. Best-effort : si cet appel échoue, on
 * garde quand même le résultat du devis (prodigiAttributeOptions reste simplement inchangé).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const existing = await getPrintCatalogItem(params.id);
    if (!existing) throw new AccessError("Produit catalogue introuvable.", 404);
    if (!existing.sku) {
      return NextResponse.json({ error: "Aucun SKU Prodigi renseigné pour ce produit." }, { status: 400 });
    }

    const [quote, details] = await Promise.all([
      getProdigiQuote({ sku: existing.sku }),
      getProdigiProductDetails(existing.sku),
    ]);

    if (details.synced) {
      const hasOptions = details.attributes && Object.keys(details.attributes).length > 0;
      await updatePrintCatalogItem(params.id, {
        prodigiAttributeOptions: hasOptions ? JSON.stringify(details.attributes) : null,
      });
    }

    if (!quote.synced) {
      return NextResponse.json({ prodigiSync: quote, attributesSync: details }, { status: 200 });
    }

    const item = await updatePrintCatalogItem(params.id, { wholesaleCostCents: quote.unitCostCents ?? null });

    // Mémorise les attributs Prodigi (ex: finish=Lustre) qui ont permis d'obtenir CE devis —
    // colonne pas encore dans le Prisma Client généré (tâche #254), même workaround $executeRaw
    // que le reste du catalogue plateforme. Sert de valeur PAR DÉFAUT (fallback) pour toute clé
    // que le client n'a pas explicitement choisie via le sélecteur d'attribut, réutilisée par la
    // soumission de commande réelle (src/lib/prodigiOrder.ts).
    const attributesJson =
      quote.attributesUsed && Object.keys(quote.attributesUsed).length > 0
        ? JSON.stringify(quote.attributesUsed)
        : null;
    await prisma.$executeRaw`UPDATE "Product" SET "prodigiAttributes" = ${attributesJson} WHERE "id" = ${params.id}`;

    return NextResponse.json({ item, prodigiSync: quote, attributesSync: details });
  } catch (e) {
    return handleApiError(e);
  }
}
