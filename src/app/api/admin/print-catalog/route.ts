import { NextResponse } from "next/server";
import { requirePlatformAdmin, handleApiError } from "@/lib/access";
import { printCatalogItemSchema } from "@/lib/validators";
import { listPrintCatalog, createPrintCatalogItem, getPrintCatalogItem } from "@/lib/printCatalog";
import { getProdigiQuote } from "@/lib/prodigiSync";

/** Liste tout le catalogue impression plateforme (actif et inactif). */
export async function GET() {
  try {
    await requirePlatformAdmin();
    const items = await listPrintCatalog();
    return NextResponse.json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requirePlatformAdmin();
    const body = await req.json();
    const parsed = printCatalogItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const isProductGroup = parsed.data.isProductGroup ?? false;
    const groupId = parsed.data.groupId ?? null;

    // Chantier "groupe de produits" (02/08/2026, demande d'Adriel) : un produit est soit un
    // GROUPE (conteneur, pas de SKU propre), soit une VARIANTE à l'intérieur d'un groupe, soit
    // un produit autonome — jamais deux de ces trois à la fois.
    if (isProductGroup && groupId) {
      return NextResponse.json(
        { error: "Un groupe ne peut pas lui-même appartenir à un autre groupe." },
        { status: 400 }
      );
    }
    if (groupId) {
      const parent = await getPrintCatalogItem(groupId);
      if (!parent || !parent.isProductGroup) {
        return NextResponse.json({ error: "Groupe parent introuvable." }, { status: 400 });
      }
    }

    let wholesaleCostCents = parsed.data.wholesaleCostCents ?? null;
    let prodigiSync: { synced: boolean; error?: string } = { synced: false };
    // Synchro best-effort du coût de revient si un SKU Prodigi est renseigné et qu'aucun coût
    // n'a été saisi à la main — un coût explicite prime toujours sur la synchro automatique.
    // Jamais pour un groupe : il n'a pas de SKU propre (voir isProductGroup ci-dessus).
    if (!isProductGroup && parsed.data.sku && wholesaleCostCents == null) {
      const quote = await getProdigiQuote({ sku: parsed.data.sku });
      prodigiSync = quote;
      if (quote.synced && quote.unitCostCents != null) {
        wholesaleCostCents = quote.unitCostCents;
      }
    }

    const item = await createPrintCatalogItem({
      id: parsed.data.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      priceCents: parsed.data.priceCents,
      currency: parsed.data.currency,
      sku: isProductGroup ? null : (parsed.data.sku ?? null),
      imageUrl: parsed.data.imageUrl ?? null,
      active: parsed.data.active ?? true,
      wholesaleCostCents,
      isProductGroup,
      groupId,
      borderOptionEnabled: parsed.data.borderOptionEnabled ?? false,
      hasFrame: parsed.data.hasFrame ?? true,
      translations:
        parsed.data.translations && Object.keys(parsed.data.translations).length
          ? JSON.stringify(parsed.data.translations)
          : null,
    });

    return NextResponse.json({ item, prodigiSync }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
