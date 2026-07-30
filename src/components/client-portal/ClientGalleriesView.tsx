"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { ShareGalleryButton } from "@/components/client-portal/ShareGalleryButton";

interface GalleryRow {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  slug: string;
  approvedCount: number;
  pendingCount: number;
}

interface StudioRow {
  id: string;
  studioName: string;
  studioLogoUrl: string | null;
  galleries: GalleryRow[];
}

/**
 * Rendu (traduit) de /client — extrait de page.tsx en composant client pour pouvoir utiliser
 * useLanguage()/t() : les Server Components de l'espace Client ne peuvent pas lire le contexte
 * de langue (React context, client-only), voir la demande d'Adriel le 30/07/2026 de traduire
 * intégralement l'espace client. page.tsx ne fait plus que la requête Prisma et passe les
 * données déjà aplaties ici.
 */
export function ClientGalleriesView({ rows }: { rows: StudioRow[] }) {
  const { t } = useLanguage();

  const STATUS_LABELS: Record<string, string> = {
    DRAFT: t("client.galleries.statusDraft"),
    ARCHIVED: t("client.galleries.statusArchived"),
  };

  return (
    <div className="px-6 py-10">
      <h1 className="font-serif text-2xl font-semibold">{t("client.galleries.title")}</h1>

      {rows.length === 0 && <p className="mt-8 text-sm text-gray-600">{t("client.galleries.emptyAll")}</p>}

      <div className="mt-8 space-y-8">
        {rows.map((row) => (
          <div key={row.id}>
            <div className="flex items-center gap-2">
              {row.studioLogoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.studioLogoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
              )}
              <h2 className="text-sm font-semibold text-gray-900">{row.studioName}</h2>
            </div>
            {row.galleries.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">{t("client.galleries.emptyStudio")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
                {row.galleries.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{g.title}</span>
                      {g.status !== "PUBLISHED" && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          {STATUS_LABELS[g.status]}
                        </span>
                      )}
                      {g.approvedCount > 0 && (
                        <span
                          title={t("client.galleries.guestsApprovedTooltip").replace(
                            "{count}",
                            String(g.approvedCount)
                          )}
                          className="flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
                        >
                          {g.approvedCount}
                        </span>
                      )}
                      {g.pendingCount > 0 && (
                        <span
                          title={t("client.galleries.guestsPendingTooltip").replace(
                            "{count}",
                            String(g.pendingCount)
                          )}
                          className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                        >
                          {g.pendingCount}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {g.status !== "DRAFT" && (
                        <>
                          <a
                            href={`/client/galleries/${g.id}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary px-3 py-1.5 text-xs"
                          >
                            {t("client.galleries.viewGallery")}
                          </a>
                          <ShareGalleryButton gallerySlug={g.slug} />
                        </>
                      )}
                      <Link href={`/client/galleries/${g.id}`} className="btn-secondary px-3 py-1.5 text-xs">
                        {t("client.galleries.manage")}
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
