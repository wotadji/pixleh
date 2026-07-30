"use client";

import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface OrderRow {
  id: string;
  studioName: string;
  studioLogoUrl: string | null;
  productNames: string[];
  createdAt: string;
  totalCents: number;
  currency: string;
  status: "PENDING" | "PAID" | "FULFILLED" | "CANCELLED" | "REFUNDED";
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-green-50 text-green-700",
  FULFILLED: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  REFUNDED: "bg-gray-100 text-gray-500",
};

/** Coquille traduite de /client/orders — voir ClientGalleriesView pour la même raison. Les
 * dates/prix suivent aussi la langue choisie (Intl accepte "fr"/"en"/"es"/"pt"/"zh"/"ar" tels
 * quels, pas besoin d'un tag BCP47 complet type "fr-FR"). */
export function ClientOrdersView({ orders }: { orders: OrderRow[] }) {
  const { t, locale } = useLanguage();

  const STATUS_LABELS: Record<string, string> = {
    PENDING: t("orderStatus.pending"),
    PAID: t("orderStatus.paid"),
    FULFILLED: t("orderStatus.fulfilled"),
    CANCELLED: t("orderStatus.cancelled"),
    REFUNDED: t("orderStatus.refunded"),
  };

  function formatPrice(cents: number, currency: string) {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  }

  return (
    <div className="px-6 py-10">
      <h1 className="font-serif text-2xl font-semibold">{t("client.orders.title")}</h1>

      {orders.length === 0 ? (
        <p className="mt-8 text-sm text-gray-600">{t("client.orders.empty")}</p>
      ) : (
        <ul className="mt-8 divide-y divide-gray-100 rounded-lg border border-gray-100">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-4 px-4 py-4 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                {o.studioLogoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.studioLogoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{o.studioName}</p>
                  <p className="truncate text-xs text-gray-500">
                    {o.productNames.join(", ") || t("client.orders.fallbackLabel")}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(o.createdAt))}
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
