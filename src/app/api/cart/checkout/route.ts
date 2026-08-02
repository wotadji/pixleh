import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { checkGalleryAccess } from "@/lib/access";
import { getActivePrintCatalogItemsByIds } from "@/lib/printCatalog";
import { isShippingAddressComplete, type ShippingAddress } from "@/lib/shippingAddress";
import { getProdigiShippingQuote } from "@/lib/prodigiSync";

interface CartItem {
  productId: string;
  quantity: number;
  photoId?: string | null;
  /** Attributs Prodigi choisis par le client pour cet article (ex: {"wrap":"White"}) — chantier
   * "sélection d'attribut au moment de l'achat" (02/08/2026, demande d'Adriel : "je veux
   * construire une vraie UI de sélection d'attribut au moment de l'achat"). Optionnel : absent
   * ou vide pour un article dont le produit n'a aucun attribut sélectionnable. */
  attributes?: Record<string, string> | null;
  /** Type de bordure choisi ("Photo pleine page"/"Bordure blanche") — chantier "type de
   * bordure" (02/08/2026, demande d'Adriel : "On dois ajouter dans panel admin type de bordure
   * [...] meme si nous ne mettons pas cela dans le visuel [transmis à Prodigi], juste pour la
   * représentation visuel"). Copié vers une colonne OrderItem.borderType SÉPARÉE de
   * `attributes` ci-dessous — jamais lu par submitProdigiOrder (voir src/lib/prodigiOrder.ts et
   * la doc sur Product.borderOptionEnabled dans schema.prisma). */
  borderType?: string | null;
}

/**
 * Crée une session de paiement Stripe Checkout pour un panier lié à une galerie
 * (achat de tirages / téléchargements par un client). Crée une Order en statut
 * PENDING, mise à jour en PAID par le webhook Stripe une fois le paiement confirmé.
 */
export async function POST(req: Request) {
  const { galleryId, items, customerEmail, customerName, shippingAddress } = (await req.json()) as {
    galleryId: string;
    items: CartItem[];
    customerEmail: string;
    customerName: string;
    shippingAddress?: Partial<ShippingAddress> | null;
  };

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Panier vide" }, { status: 400 });
  }

  const gallery = await prisma.gallery.findUnique({ where: { id: galleryId } });
  if (!gallery) return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });

  const access = await checkGalleryAccess(gallery);
  if (!access.granted) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const productIds = items.map((i) => i.productId);
  // Un produit du panier peut venir soit du studio (téléchargement numérique, album,
  // package), soit du catalogue impression plateforme (studioId NULL, voir
  // /admin/print-catalog) — les deux sources sont interrogées puis fusionnées, chacune avec
  // sa propre règle d'appartenance (studioId pour l'un, platformManaged pour l'autre).
  const [studioProducts, printCatalogItems] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds }, studioId: gallery.studioId, active: true },
    }),
    getActivePrintCatalogItemsByIds(productIds),
  ]);
  const products = [...studioProducts, ...printCatalogItems];
  if (products.length !== new Set(productIds).size) {
    return NextResponse.json({ error: "Produit invalide" }, { status: 400 });
  }

  // Une adresse de livraison est requise dès que le panier contient au moins un article du
  // catalogue impression plateforme (chantier "impression pixleh Phase 2", 01/08/2026) — c'est
  // elle qui sera transmise à Prodigi pour l'expédition une fois la commande payée (voir
  // src/lib/prodigiOrder.ts). Un panier 100% studio (téléchargement numérique, album...) n'en a
  // jamais besoin, d'où cette vérification conditionnelle plutôt qu'un champ obligatoire global.
  const printCatalogIds = new Set(printCatalogItems.map((p) => p.id));
  const needsShipping = items.some((item) => printCatalogIds.has(item.productId));
  if (needsShipping && !isShippingAddressComplete(shippingAddress)) {
    return NextResponse.json({ error: "Adresse de livraison incomplète" }, { status: 400 });
  }

  const itemsTotalCents = items.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId)!;
    return sum + product.priceCents * item.quantity;
  }, 0);

  // Devis de livraison RECALCULÉ ici côté serveur (chantier "shipping dynamique", 02/08/2026,
  // demande d'Adriel : "un vrai calcul de shipping dynamique au moment du checkout [...] affiché
  // comme ligne Livraison séparée dans le panier") — jamais fait confiance à un montant transmis
  // par le client (voir /api/cart/shipping-quote, purement informatif côté UI). Fail-CLOSED
  // volontairement (contrairement à getProdigiQuote/submitProdigiOrder qui dégradent en
  // continuant sans bloquer) : ici il s'agit d'un montant réellement facturé au client, un échec
  // silencieux ferait payer le port par pixleh sur chaque commande plutôt que par le client.
  let shippingCents = 0;
  if (needsShipping) {
    const printItems = items
      .map((item) => {
        const product = printCatalogItems.find((p) => p.id === item.productId);
        if (!product?.sku) return null;
        return { sku: product.sku, copies: item.quantity, attributes: item.attributes ?? undefined };
      })
      .filter((i): i is { sku: string; copies: number; attributes: Record<string, string> | undefined } => i !== null);

    const quote = await getProdigiShippingQuote({
      items: printItems,
      destinationCountryCode: (shippingAddress as ShippingAddress).countryCode,
    });
    if (!quote.synced || quote.shippingCents === undefined) {
      console.error("Devis de livraison Prodigi indisponible au checkout :", quote.error);
      return NextResponse.json(
        { error: "Livraison temporairement indisponible, merci de réessayer dans quelques instants." },
        { status: 503 }
      );
    }
    shippingCents = quote.shippingCents;
  }

  const totalCents = itemsTotalCents + shippingCents;

  const order = await prisma.order.create({
    data: {
      studioId: gallery.studioId,
      galleryId: gallery.id,
      customerEmail,
      customerName,
      totalCents,
      currency: products[0]?.currency || "EUR",
      status: "PENDING",
      shippingAddress: needsShipping ? JSON.stringify(shippingAddress) : undefined,
      items: {
        create: items.map((item) => {
          const product = products.find((p) => p.id === item.productId)!;
          return {
            productId: product.id,
            photoId: item.photoId || null,
            quantity: item.quantity,
            unitPriceCents: product.priceCents,
          };
        }),
      },
    },
  });

  // Order.shippingCents n'existe pas encore dans le Prisma Client généré du sandbox (tâche
  // #254) — même workaround $executeRaw que le reste des champs récents du catalogue impression.
  if (needsShipping) {
    await prisma.$executeRaw`UPDATE "Order" SET "shippingCents" = ${shippingCents} WHERE "id" = ${order.id}`;
  }

  // Persiste les attributs Prodigi choisis par le client (ex: {"wrap":"White"}) — chantier
  // "sélection d'attribut au moment de l'achat" (02/08/2026, demande d'Adriel). OrderItem.
  // attributes n'existe pas encore dans le Prisma Client généré du sandbox (tâche #254), donc
  // pas incluse dans le `create` typé ci-dessus — on retrouve les OrderItem tout juste créés
  // (un par article du panier, matché par photoId+productId) et on les met à jour via
  // $executeRaw, même workaround que le reste du catalogue impression.
  const itemsWithAttributes = items.filter((item) => item.attributes && Object.keys(item.attributes).length > 0);
  if (itemsWithAttributes.length > 0) {
    const createdItems = await prisma.orderItem.findMany({
      where: { orderId: order.id },
      select: { id: true, photoId: true, productId: true },
    });
    for (const item of itemsWithAttributes) {
      const match = createdItems.find((ci) => ci.photoId === item.photoId && ci.productId === item.productId);
      if (!match) continue;
      await prisma.$executeRaw`UPDATE "OrderItem" SET "attributes" = ${JSON.stringify(item.attributes)} WHERE "id" = ${match.id}`;
    }
  }

  // Copie borderType (choix LOCAL, chantier "type de bordure", 02/08/2026) vers OrderItem —
  // requête $executeRaw SÉPARÉE de celle des attributs Prodigi ci-dessus, volontairement : elle
  // écrit une colonne différente ("borderType", pas "attributes") pour garantir qu'aucun code ne
  // puisse confondre les deux. submitProdigiOrder (src/lib/prodigiOrder.ts) ne sélectionne que
  // la colonne "attributes" et ignore totalement "borderType".
  const itemsWithBorderType = items.filter((item) => typeof item.borderType === "string" && item.borderType);
  if (itemsWithBorderType.length > 0) {
    const createdItems = await prisma.orderItem.findMany({
      where: { orderId: order.id },
      select: { id: true, photoId: true, productId: true },
    });
    for (const item of itemsWithBorderType) {
      const match = createdItems.find((ci) => ci.photoId === item.photoId && ci.productId === item.productId);
      if (!match) continue;
      await prisma.$executeRaw`UPDATE "OrderItem" SET "borderType" = ${item.borderType} WHERE "id" = ${match.id}`;
    }
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customerEmail,
      line_items: [
        ...items.map((item) => {
          const product = products.find((p) => p.id === item.productId)!;
          return {
            quantity: item.quantity,
            price_data: {
              currency: (product.currency || "eur").toLowerCase(),
              unit_amount: product.priceCents,
              product_data: { name: product.name },
            },
          };
        }),
        // Ligne "Livraison" SÉPARÉE (chantier "shipping dynamique", 02/08/2026, demande
        // d'Adriel : "affiché comme ligne Livraison séparée dans le panier [plutôt que] noyé
        // dans le prix produit") — un seul montant pour le panier complet (shippingCents
        // recalculé ci-dessus), pas une ligne par article.
        ...(shippingCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: (products[0]?.currency || "eur").toLowerCase(),
                  unit_amount: shippingCents,
                  product_data: { name: "Livraison" },
                },
              },
            ]
          : []),
      ],
      success_url: `${process.env.APP_URL}/g/${gallery.slug}/store?success=1`,
      cancel_url: `${process.env.APP_URL}/g/${gallery.slug}/store?canceled=1`,
      metadata: { orderId: order.id },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: session.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Paiement indisponible : vérifiez la configuration Stripe (STRIPE_SECRET_KEY)." },
      { status: 500 }
    );
  }
}
