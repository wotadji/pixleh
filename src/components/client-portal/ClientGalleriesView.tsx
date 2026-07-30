"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { ShareGalleryButton } from "@/components/client-portal/ShareGalleryButton";
import { galleryInitials, galleryColorForTitle } from "@/lib/galleryVisual";

interface GalleryRow {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  slug: string;
  coverPhotoId: string | null;
  coverUpdatedAt: string | null;
  approvedCount: number;
  pendingCount: number;
}

interface StudioRow {
  id: string;
  studioId: string;
  studioName: string;
  studioLogoUrl: string | null;
  galleries: GalleryRow[];
}

function coverUrl(studioId: string, galleryId: string, g: GalleryRow): string | null {
  if (!g.coverPhotoId) return null;
  const v = g.coverUpdatedAt ? new Date(g.coverUpdatedAt).getTime() : 0;
  return `/api/files/studios/${studioId}/galleries/${galleryId}/${g.coverPhotoId}/thumb.jpg?v=${v}`;
}

function statusDotColor(status: GalleryRow["status"]): string {
  if (status === "PUBLISHED") return "bg-green-500";
  if (status === "ARCHIVED") return "bg-gray-400";
  return "bg-yellow-500";
}

/**
 * Rendu (traduit) de /client, redessiné le 30/07/2026 à la demande d'Adriel ("redesign pro"
 * de l'espace client) : vraie vignette de couverture par galerie (comme /dashboard/galleries
 * côté studio, voir coverUrl ci-dessus — le fichier de couverture est public, pas besoin de
 * session galerie) avec repli sur des initiales colorées tant qu'aucune couverture n'existe
 * (lib/galleryVisual.ts, partagé avec le studio), point de statut coloré au lieu d'un badge
 * texte, et les trois actions (Voir galerie / Partager / Gérer) désormais différenciées par
 * une bordure colorée plutôt que le même bouton gris neutre pour les trois — hiérarchie
 * voulue : Voir (contour marque, action de consultation) < Partager (contour bleu, action de
 * communication) < Gérer (rempli, l'action principale de la ligne).
 *
 * page.tsx ne fait que la requête Prisma et passe les données déjà aplaties ici (useLanguage/
 * t() n'est accessible que côté client).
 */
export function ClientGalleriesView({ rows }: { rows: StudioRow[] }) {
  const { t } = useLanguage();

  const STATUS_LABELS: Record<string, string> = {
    DRAFT: t("client.galleries.statusDraft"),
    ARCHIVED: t("client.galleries.statusArchived"),
  };

  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-serif text-2xl font-semibold text-gray-900">{t("client.galleries.title")}</h1>

      {rows.length === 0 && (
        <p className="mt-8 rounded-xl border border-gray-200 bg-gray-50/50 p-6 text-sm text-gray-500">
          {t("client.galleries.emptyAll")}
        </p>
      )}

      <div className="mt-8 space-y-10">
        {rows.map((row) => (
          <div key={row.id}>
            <div className="flex items-center gap-2.5">
              {row.studioLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.studioLogoUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 font-serif text-xs font-semibold text-brand-700">
                  {row.studioName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <h2 className="text-sm font-semibold text-gray-900">{row.studioName}</h2>
            </div>

            {row.galleries.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">{t("client.galleries.emptyStudio")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                {row.galleries.map((g) => {
                  const src = coverUrl(row.studioId, g.id, g);
                  return (
                    <li key={g.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-50">
                          {src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={src} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div
                              className={`flex h-full w-full items-center justify-center font-serif text-sm font-semibold ${galleryColorForTitle(g.title)}`}
                            >
                              {galleryInitials(g.title)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium text-gray-900">{g.title}</span>
                            {g.status !== "PUBLISHED" && (
                              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                                {STATUS_LABELS[g.status]}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColor(g.status)}`} />
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
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {g.status !== "DRAFT" && (
                          <>
                            <a
                              href={`/client/galleries/${g.id}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-lg border-[1.5px] border-brand-400 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
                            >
                              {t("client.galleries.viewGallery")}
                            </a>
                            <ShareGalleryButton gallerySlug={g.slug} />
                          </>
                        )}
                        <Link
                          href={`/client/galleries/${g.id}`}
                          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700"
                        >
                          {t("client.galleries.manage")}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
