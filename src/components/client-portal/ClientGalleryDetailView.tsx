"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { SetVisibilityManager } from "@/components/client-portal/SetVisibilityManager";
import { GuestListManager } from "@/components/client-portal/GuestListManager";

type SetVisibility = "CLIENT" | "GUEST" | "PORTFOLIO";
type GuestStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Coquille traduite de /client/galleries/[id] — voir ClientGalleriesView pour la même
 * raison (useLanguage/t() n'est accessible que côté client). */
export function ClientGalleryDetailView({
  galleryId,
  galleryTitle,
  collections,
  guests,
}: {
  galleryId: string;
  galleryTitle: string;
  collections: { id: string; title: string; visibility: SetVisibility[]; isPortfolioDefault: boolean }[];
  guests: { id: string; email: string; status: GuestStatus; approvalToken: string | null }[];
}) {
  const { t } = useLanguage();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/client" className="text-sm text-gray-500 hover:underline">
        ← {t("client.galleryDetail.backLink")}
      </Link>
      <h1 className="mt-2 font-serif text-2xl font-semibold">{galleryTitle}</h1>

      <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {t("client.galleryDetail.disclaimer")}
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gray-900">{t("client.galleryDetail.visibilityTitle")}</h2>
        <p className="mt-1 text-xs text-gray-500">{t("client.galleryDetail.visibilityHint")}</p>
        <div className="mt-3">
          <SetVisibilityManager galleryId={galleryId} initialCollections={collections} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gray-900">{t("client.galleryDetail.guestsTitle")}</h2>
        <p className="mt-1 text-xs text-gray-500">{t("client.galleryDetail.guestsHint")}</p>
        <div className="mt-3">
          <GuestListManager galleryId={galleryId} initialGuests={guests} />
        </div>
      </section>
    </div>
  );
}
