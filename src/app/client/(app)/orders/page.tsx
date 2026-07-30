import { redirect } from "next/navigation";
import { getClientPortalSession } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  PAID: "Payée",
  FULFILLED: "Livrée",
  CANCELLED: "Annulée",
  REFUNDED: "Remboursée",
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-green-50 text-green-700",
  FULFILLED: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  REFUNDED: "bg-gray-100 text-gray-500",
};

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

/**
 * "Mes impressions" (/client/orders) — toutes les commandes du client, tous studios confondus
 * (contrairement aux galeries, groupées par studio sur /client, ici on affiche une liste plate
 * triée par date : un même client passe rarement plusieurs commandes le même jour chez
 * plusieurs studios, la distinction par studio dans chaque ligne suffit). Voir Order.customerEmail
 * dans schema.prisma — pas de relation directe Order → ClientAccount, on matche par email comme
 * pour les galeries (voir /client/page.tsx).
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

  return (
    <div className="px-6 py-10">
      <h1 className="font-serif text-2xl font-semibold">Mes impressions</h1>

      {orders.length === 0 ? (
        <p className="mt-8 text-sm text-gray-600">Aucune commande pour le moment.</p>
      ) : (
        <ul className="mt-8 divide-y divide-gray-100 rounded-lg border border-gray-100">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-4 px-4 py-4 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                {o.studio.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.studio.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{o.studio.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {o.items.map((it) => it.product.name).join(", ") || "Commande"}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(o.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-medium text-gray-900">{formatPrice(o.totalCents, o.currency)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[o.status]}`}>
                  {STATUS_LABELS[o.status]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
