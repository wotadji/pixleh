import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkGalleryAccess } from "@/lib/access";
import { getActivePrintCatalogItemsByIds } from "@/lib/printCatalog";
import { getProdigiShippingQuote } from "@/lib/prodigiSync";

interface QuoteItem {
  productId: string;
  quantity: number;
  attributes?: Record<string, string> | null;
}

/**
 * Devis de LIVRAISON en direct pour le panier — chantier "shipping dynamique au checkout"
 * (02/08/2026, demande d'Adriel : "mets en place un vrai calcul de shipping dynamique au moment
 * du checkout [...] affiché comme ligne Livraison séparée dans le panier"). Appelée par
 * PrintSelectionPageView dès que le panier contient au moins un article du catalogue impression
 * ET que l'adresse de livraison minimale (rue/ville/code postal/pays) est saisie — voir
 * getProdigiShippingQuote pour le détail de l'appel Prodigi.
 *
 * PUREMENT INFORMATIF pour l'affichage : sert à montrer une ligne "Livraison" réaliste avant
 * paiement, mais /api/cart/checkout REFAIT ce même devis côté serveur au moment de créer la
 * session Stripe plutôt que de faire confiance à un montant transmis par le client — voir la doc
 * dans ce fichier pour la raison (un client pourrait sinon manipuler le montant envoyé ici).
 */
export async function POST(req: Request) {
  const { galleryId, items, countryCode } = (await req.json()) as {
    galleryId?: string;
    items?: QuoteItem[];
    countryCode?: string;
  };

  if (!galleryId || !items || items.length === 0 || !countryCode) {
    return NextResponse.json({ synced: false, error: "Paramètres manquants" }, { status: 400 });
  }

  const gallery = await prisma.gallery.findUnique({ where: { id: galleryId } });
  if (!gallery) return NextResponse.json({ synced: false, error: "Galerie introuvable" }, { status: 404 });

  const access = await checkGalleryAccess(gallery);
  if (!access.granted) return NextResponse.json({ synced: false, error: "Accès refusé" }, { status: 403 });

  // Les SKU/attributs sont relus depuis la base à partir des productId (jamais fait confiance à
  // un SKU envoyé directement par le client) — même précaution que /api/cart/checkout.
  const productIds = [...new Set(items.map((i) => i.productId))];
  const printCatalogItems = await getActivePrintCatalogItemsByIds(productIds);
  const productMap = new Map(printCatalogItems.map((p) => [p.id, p]));

  const prodigiItems = items
    .map((item) => {
      const product = productMap.get(item.productId);
      if (!product?.sku) return null;
      return { sku: product.sku, copies: item.quantity, attributes: item.attributes ?? undefined };
    })
    .filter((i): i is { sku: string; copies: number; attributes: Record<string, string> | undefined } => i !== null);

  if (prodigiItems.length === 0) {
    // Panier sans aucun article du catalogue impression plateforme (téléchargement numérique,
    // album studio...) : rien à expédier, pas la peine d'appeler Prodigi.
    return NextResponse.json({ synced: true, shippingCents: 0, currency: "EUR" });
  }

  const result = await getProdigiShippingQuote({ items: prodigiItems, destinationCountryCode: countryCode });
  return NextResponse.json(result);
}
