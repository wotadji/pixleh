import { redirect } from "next/navigation";
import { getClientPortalSession } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { ClientOrdersView } from "@/components/client-portal/ClientOrdersView";

export const dynamic = "force-dynamic";

/**
 * "Mes impressions" (/client/orders) — toutes les commandes du client, tous studios confondus
 * (contrairement aux galeries, groupées par studio sur /client, ici on affiche une liste plate
 * triée par date : un même client passe rarement plusieurs commandes le même jour chez
 * plusieurs studios, la distinction par studio dans chaque ligne suffit). Voir Order.customerEmail
 * dans schema.prisma — pas de relation directe Order → ClientAccount, on matche par email comme
 * pour les galeries (voir /client/page.tsx). Ne fait plus que la requête + l'aplatissement : le
 * rendu (traduit) vit dans ClientOrdersView (useLanguage/t() n'est pas accessible ici).
 */
export default async function ClientOrdersPage() {
  const session = getClientPortalSession();
  if (!session) redirect("/client/login");

  const orders = await prisma.order.findMany({
    where: { customerEmail: session.email },
    include: {
      studio: { select: { name: true, slug: true, logoUrl: true } },
      items: { include: { product: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = orders.map((o) => ({
    id: o.id,
    studioName: o.studio.name,
    studioLogoUrl: o.studio.logoUrl,
    productNames: o.items.map((it) => it.product.name),
    createdAt: o.createdAt.toISOString(),
    totalCents: o.totalCents,
    currency: o.currency,
    status: o.status,
  }));

  return <ClientOrdersView orders={rows} />;
}
