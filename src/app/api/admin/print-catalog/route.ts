import { NextResponse } from "next/server";
import { requirePlatformAdmin, handleApiError } from "@/lib/access";
import { printCatalogItemSchema } from "@/lib/validators";
import { listPrintCatalog, createPrintCatalogItem } from "@/lib/printCatalog";
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

    let wholesaleCostCents = parsed.data.wholesaleCostCents ?? null;
    let prodigiSync: { synced: boolean; error?: string } = { synced: false };
    // Synchro best-effort du coût de revient si un SKU Prodigi est renseigné et qu'aucun coût
    // n'a été saisi à la main — un coût explicite prime toujours sur la synchro automatique.
    if (parsed.data.sku && wholesaleCostCents == null) {
      const quote = await getProdigiQuote({ sku: parsed.data.sku });
      prodigiSync = quote;
      if (quote.synced && quote.unitCostCents != null) {
        wholesaleCostCents = quote.unitCostCents;
      }
    }

    const item = await createPrintCatalogItem({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      priceCents: parsed.data.priceCents,
      currency: parsed.data.currency,
      sku: parsed.data.sku ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      active: parsed.data.active ?? true,
      wholesaleCostCents,
    });

    return NextResponse.json({ item, prodigiSync }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
