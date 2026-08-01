import { NextResponse } from "next/server";
import { getStorage, buildPrintCatalogImageKey } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sert l'image d'un produit du catalogue impression plateforme, sans authentification :
 * ces produits sont proposés dans toutes les galeries publiques (voir printCatalog.ts), au
 * même titre que /api/marketing-blocks/[id]/image pour le site pixleh.com. L'URL contient un
 * `?v=` posé à l'upload (cache-busting), donc un cache long "immutable" est sûr ici.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const buffer = await getStorage().get(buildPrintCatalogImageKey(params.id));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image introuvable" }, { status: 404 });
  }
}
