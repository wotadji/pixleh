"use client";

import { useEffect, useMemo, useState } from "react";
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
  downloadLimit: number | null;
  /** Date de la dernière transition vers PUBLISHED (voir Gallery.publishedAt, schema.prisma) —
   * null pour une galerie qui n'a jamais été publiée (toujours en DRAFT). */
  publishedAt: string | null;
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

/** Galerie aplatie avec les infos de son studio directement dessus, pour pouvoir
 * rechercher/filtrer/paginer sur l'ensemble des galeries d'un client sans être limité aux
 * frontières des groupes par studio (voir ClientGalleriesView ci-dessous). */
interface FlatGallery extends GalleryRow {
  studioId: string;
  studioName: string;
  studioLogoUrl: string | null;
}

type ViewMode = "grid" | "list";
type StatusFilter = "any" | "DRAFT" | "PUBLISHED" | "ARCHIVED";
type DownloadsFilter = "any" | "limited" | "unlimited";

const VIEW_STORAGE_KEY = "pixleh.client.galleries.view";
const PAGE_SIZE = 8;

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

function GalleryCover({ g, studioId, className }: { g: GalleryRow; studioId: string; className: string }) {
  const src = coverUrl(studioId, g.id, g);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div
      className={`flex h-full w-full items-center justify-center font-serif font-semibold ${galleryColorForTitle(
        g.title
      )} ${className}`}
    >
      {galleryInitials(g.title)}
    </div>
  );
}

/** Date formatée seule (sans libellé "Publiée le", demande d'Adriel du 30/07/2026) — rien si
 * la galerie n'a jamais été publiée (toujours en DRAFT). */
function PublishedDate({ publishedAt, locale }: { publishedAt: string | null; locale: string }) {
  if (!publishedAt) return null;
  const formatted = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(publishedAt));
  return <span className="shrink-0 text-[9px] text-gray-400">{formatted}</span>;
}

function StudioTag({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[9px] font-semibold text-brand-700">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

/** `dense` (utilisé en grille, où la carte n'a que ~300px de large pour les 3 actions) réduit
 * le padding/texte et empêche le retour à la ligne (flex-nowrap) — sans ça "Gérer" retombe
 * seul sur une 2e ligne dès que la carte est un peu étroite. En liste, plus de place
 * disponible : padding normal, retour à la ligne autorisé si besoin. */
function GalleryActions({ g, className, dense }: { g: GalleryRow; className?: string; dense?: boolean }) {
  const { t } = useLanguage();
  const pad = dense ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  return (
    <div className={`flex shrink-0 items-center gap-1.5 ${dense ? "flex-nowrap" : "flex-wrap gap-2"} ${className || ""}`}>
      {g.status !== "DRAFT" && (
        <>
          <a
            href={`/client/galleries/${g.id}/view`}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex shrink items-center justify-center whitespace-nowrap rounded-lg border-[1.5px] border-brand-400 font-medium text-brand-700 transition-colors hover:bg-brand-50 ${pad}`}
          >
            {t("client.galleries.viewGallery")}
          </a>
          <ShareGalleryButton gallerySlug={g.slug} dense={dense} />
        </>
      )}
      <Link
        href={`/client/galleries/${g.id}`}
        className={`inline-flex shrink items-center justify-center whitespace-nowrap rounded-lg border-[1.5px] border-transparent bg-brand-600 font-medium text-white transition-colors hover:bg-brand-700 ${pad}`}
      >
        {t("client.galleries.manage")}
      </Link>
    </div>
  );
}

/**
 * Rendu (traduit) de /client, redessiné le 30/07/2026 puis étendu le même jour à la demande
 * d'Adriel : recherche + filtres (statut, téléchargements) + bascule grille/liste + pagination,
 * façon /dashboard/galleries côté studio (voir GalleriesListView.tsx) mais volontairement plus
 * simple (selects plutôt que la mécanique complète de puces/calendrier, pas de tri par date
 * d'événement — non pertinent ici). Le regroupement par studio (en-tête par studio) a été
 * remplacé par un badge studio sur chaque carte/ligne : c'est ce qui permet à la recherche, aux
 * filtres et à la pagination de porter sur l'ensemble des galeries d'un client, tous studios
 * confondus, plutôt que d'être coincés dans des groupes séparés. Le filtre "Studio" ne
 * s'affiche que si le client a des galeries dans plus d'un studio.
 *
 * "Gérer" est maintenant rempli en brand-600 (au lieu du noir précédent) pour rester dans la
 * charte plutôt que d'utiliser une couleur neutre générique — toujours l'action principale de
 * la ligne, distincte des deux actions secondaires à bordure colorée (Voir/Partager).
 *
 * Le filtre "Téléchargements" porte sur la limite configurée par le studio (Gallery.downloadLimit,
 * "Limités"/"Illimités"), pas sur une consommation réelle : chaque clic sur "Voir galerie" émet
 * un nouveau clientRef (voir /client/galleries/[id]/view/route.ts), donc un décompte de
 * téléchargements par client ne serait pas fiable ici (contrairement au dashboard studio, qui
 * suit chaque visiteur via son propre clientRef stable pour une galerie donnée).
 *
 * page.tsx ne fait que la requête Prisma et passe les données déjà aplaties par studio ici
 * (useLanguage/t() n'est accessible que côté client) — l'aplatissement complet (tous studios
 * confondus) se fait ensuite dans ce composant via `allGalleries`.
 */
export function ClientGalleriesView({ rows }: { rows: StudioRow[] }) {
  const { t, locale } = useLanguage();

  const STATUS_LABELS: Record<StatusFilter, string> = {
    any: t("galleries.allStatuses"),
    DRAFT: t("client.galleries.statusDraft"),
    PUBLISHED: t("client.galleries.statusPublished"),
    ARCHIVED: t("client.galleries.statusArchived"),
  };

  const allGalleries: FlatGallery[] = useMemo(
    () =>
      rows.flatMap((row) =>
        row.galleries.map((g) => ({
          ...g,
          studioId: row.studioId,
          studioName: row.studioName,
          studioLogoUrl: row.studioLogoUrl,
        }))
      ),
    [rows]
  );

  const studioOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const g of allGalleries) if (!map.has(g.studioId)) map.set(g.studioId, { id: g.studioId, name: g.studioName });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allGalleries]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("any");
  const [downloadsFilter, setDownloadsFilter] = useState<DownloadsFilter>("any");
  const [studioFilter, setStudioFilter] = useState<string>("any");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);

  // Se souvient du dernier mode d'affichage choisi, comme côté studio.
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);

  function changeView(mode: ViewMode) {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_STORAGE_KEY, mode);
  }

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, downloadsFilter, studioFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allGalleries.filter((g) => {
      if (q && !g.title.toLowerCase().includes(q) && !g.studioName.toLowerCase().includes(q)) return false;
      if (statusFilter !== "any" && g.status !== statusFilter) return false;
      if (downloadsFilter === "limited" && !g.downloadLimit) return false;
      if (downloadsFilter === "unlimited" && g.downloadLimit) return false;
      if (studioFilter !== "any" && g.studioId !== studioFilter) return false;
      return true;
    });
  }, [allGalleries, search, statusFilter, downloadsFilter, studioFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const filtersActive = search.trim() !== "" || statusFilter !== "any" || downloadsFilter !== "any" || studioFilter !== "any";

  function resetFilters() {
    setSearch("");
    setStatusFilter("any");
    setDownloadsFilter("any");
    setStudioFilter("any");
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-serif text-2xl font-semibold text-gray-900">{t("client.galleries.title")}</h1>

      {/* Chaque contrôle est enveloppé dans un div de largeur fixe (shrink-0) : la classe
          utilitaire .input applique w-full (voir globals.css), qui écraserait sinon toute
          largeur passée directement sur l'<input>/<select>. justify-between garde la recherche
          collée à gauche et les filtres + la bascule grille/liste collés à droite (demande
          d'Adriel du 30/07/2026) ; chaque groupe peut retomber sur sa propre ligne si l'écran
          est trop étroit (flex-wrap), plutôt qu'un défilement horizontal forcé. */}
      {allGalleries.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="w-44 shrink-0">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("galleries.searchPlaceholder")}
              className="input text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-36 shrink-0">
              <select
                className="input text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="any">{STATUS_LABELS.any}</option>
                <option value="PUBLISHED">{STATUS_LABELS.PUBLISHED}</option>
                <option value="DRAFT">{STATUS_LABELS.DRAFT}</option>
                <option value="ARCHIVED">{STATUS_LABELS.ARCHIVED}</option>
              </select>
            </div>
            <div className="w-40 shrink-0">
              <select
                className="input text-sm"
                value={downloadsFilter}
                onChange={(e) => setDownloadsFilter(e.target.value as DownloadsFilter)}
              >
                <option value="any">{t("client.galleries.filterDownloads")}</option>
                <option value="limited">{t("client.galleries.downloadsLimited")}</option>
                <option value="unlimited">{t("client.galleries.downloadsUnlimited")}</option>
              </select>
            </div>
            {studioOptions.length > 1 && (
              <div className="w-40 shrink-0">
                <select
                  className="input text-sm"
                  value={studioFilter}
                  onChange={(e) => setStudioFilter(e.target.value)}
                >
                  <option value="any">{t("client.galleries.allStudios")}</option>
                  {studioOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 p-0.5">
              <button
                type="button"
                onClick={() => changeView("grid")}
                title={t("galleries.viewGrid")}
                className={`rounded-md p-1.5 ${viewMode === "grid" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <rect x="2" y="2" width="7" height="7" rx="1" fill="currentColor" />
                  <rect x="11" y="2" width="7" height="7" rx="1" fill="currentColor" />
                  <rect x="2" y="11" width="7" height="7" rx="1" fill="currentColor" />
                  <rect x="11" y="11" width="7" height="7" rx="1" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => changeView("list")}
                title={t("galleries.viewList")}
                className={`rounded-md p-1.5 ${viewMode === "list" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <rect x="2" y="3" width="16" height="3" rx="1" fill="currentColor" />
                  <rect x="2" y="8.5" width="16" height="3" rx="1" fill="currentColor" />
                  <rect x="2" y="14" width="16" height="3" rx="1" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {filtersActive && (
        <button type="button" onClick={resetFilters} className="mt-3 text-sm text-gray-500 underline-offset-2 hover:underline">
          {t("galleries.resetFilters")}
        </button>
      )}

      {allGalleries.length === 0 && (
        <p className="mt-8 rounded-xl border border-gray-200 bg-gray-50/50 p-6 text-sm text-gray-500">
          {t("client.galleries.emptyAll")}
        </p>
      )}

      {allGalleries.length > 0 && filtered.length === 0 && (
        <p className="mt-8 rounded-xl border border-gray-200 bg-gray-50/50 p-6 text-sm text-gray-500">
          {t("galleries.noResults")}
        </p>
      )}

      {paged.length > 0 && viewMode === "list" && (
        <ul className="mt-8 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {paged.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-50">
                  <GalleryCover g={g} studioId={g.studioId} className="text-sm" />
                </div>
                <div className="min-w-0">
                  <StudioTag name={g.studioName} logoUrl={g.studioLogoUrl} />
                  <div className="mt-0.5 flex min-w-0 items-center gap-2">
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
                        title={t("client.galleries.guestsApprovedTooltip").replace("{count}", String(g.approvedCount))}
                        className="flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
                      >
                        {g.approvedCount}
                      </span>
                    )}
                    {g.pendingCount > 0 && (
                      <span
                        title={t("client.galleries.guestsPendingTooltip").replace("{count}", String(g.pendingCount))}
                        className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                      >
                        {g.pendingCount}
                      </span>
                    )}
                    {g.downloadLimit != null && (
                      <span className="shrink-0 rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
                        {t("client.galleries.downloadLimitBadge").replace("{count}", String(g.downloadLimit))}
                      </span>
                    )}
                    <PublishedDate publishedAt={g.publishedAt} locale={locale} />
                  </div>
                </div>
              </div>
              <GalleryActions g={g} />
            </li>
          ))}
        </ul>
      )}

      {paged.length > 0 && viewMode === "grid" && (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {paged.map((g) => (
            <div key={g.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="relative aspect-[4/3] overflow-hidden bg-gray-50">
                <GalleryCover g={g} studioId={g.studioId} className="text-2xl" />
              </div>
              <div className="p-3.5">
                <StudioTag name={g.studioName} logoUrl={g.studioLogoUrl} />
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-gray-900">{g.title}</span>
                  {g.status !== "PUBLISHED" && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {STATUS_LABELS[g.status]}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColor(g.status)}`} />
                  {g.approvedCount > 0 && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      {g.approvedCount}
                    </span>
                  )}
                  {g.pendingCount > 0 && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {g.pendingCount}
                    </span>
                  )}
                  {g.downloadLimit != null && (
                    <span
                      title={t("client.galleries.downloadLimitBadge").replace("{count}", String(g.downloadLimit))}
                      className="shrink-0 rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-500"
                    >
                      {g.downloadLimit}
                    </span>
                  )}
                </div>
                <div className="mt-1">
                  <PublishedDate publishedAt={g.publishedAt} locale={locale} />
                </div>
                <GalleryActions g={g} className="mt-2" dense />
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="btn-secondary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("client.galleries.prevPage")}
          </button>
          <span className="text-sm text-gray-500">
            {t("client.galleries.pageInfo").replace("{page}", String(currentPage)).replace("{total}", String(totalPages))}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="btn-secondary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("client.galleries.nextPage")}
          </button>
        </div>
      )}
    </div>
  );
}
