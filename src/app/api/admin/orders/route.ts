import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, handleApiError } from "@/lib/access";

/**
 * Commandes de TOUS les studios, transverses — demande d'Adriel, 01/08/2026 : "mettre les
 * commandes dans les panels d'administrateur, on peut voir toutes les commandes de tous les
 * studios et des filtres aussi par studio". Complète (ne remplace pas) /dashboard/orders, qui
 * reste la vue d'un studio sur SES propres commandes.
 *
 * Utile notamment parce que le catalogue impression (/admin/print-catalog) est un service
 * pixleh — une partie des commandes affichées ici (celles contenant un article du catalogue
 * plateforme) correspond donc à du chiffre d'affaires pixleh, pas studio ; mais cette route
 * reste volontairement simple (pas de distinction par ligne pour l'instant) tant que le
 * Prisma Client généré du sandbox n'a pas les colonnes platformManaged (voir tâche #254).
 *
 * `?studioId=xxx` filtre sur un studio précis ; sans ce paramètre, toutes les commandes de
 * la plateforme sont retournées (triées récentes d'abord).
 */
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
    const { searchParams } = new URL(req.url);
    const studioId = searchParams.get("studioId") || undefined;

    const orders = await prisma.order.findMany({
      where: studioId ? { studioId } : undefined,
      include: {
        studio: { select: { id: true, name: true } },
        gallery: { select: { title: true } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    const data = orders.map((o) => ({
      id: o.id,
      studioId: o.studioId,
      studioName: o.studio.name,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      galleryTitle: o.gallery?.title || null,
      createdAt: o.createdAt,
      totalCents: o.totalCents,
      currency: o.currency,
      status: o.status,
      items: o.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        productName: item.product.name,
      })),
    }));

    return NextResponse.json({ orders: data });
  } catch (e) {
    return handleApiError(e);
  }
}
