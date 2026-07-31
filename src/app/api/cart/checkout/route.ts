import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { checkGalleryAccess } from "@/lib/access";
import { getActivePrintCatalogItemsByIds } from "@/lib/printCatalog";
import { isShippingAddressComplete, type ShippingAddress } from "@/lib/shippingAddress";

interface CartItem {
  productId: string;
  quantity: number;
  photoId?: string | null;
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

  const totalCents = items.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId)!;
    return sum + product.priceCents * item.quantity;
  }, 0);

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

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customerEmail,
      line_items: items.map((item) => {
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
