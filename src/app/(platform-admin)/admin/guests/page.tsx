"use client";

import { useEffect, useMemo, useState } from "react";
import { PageSpinner } from "@/components/ui/Spinner";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface GuestDTO {
  id: string;
  email: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  marketingOptIn: boolean;
  createdAt: string;
  galleryId: string;
  galleryTitle: string;
  gallerySlug: string;
  studioId: string;
  studioName: string;
}

interface StudioOption {
  id: string;
  name: string;
}

type ViewMode = "list" | "grid";

// Pagination client-side — demande d'Adriel le 12/08/2026 ("ajouter a droite le nombre de
// item a afficher et la pagination"), même patron que /dashboard/guests côté studio (voir ce
// fichier) : 10 par défaut, sélecteur pour changer, prev/next sous la liste.
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

const STATUS_KEYS: Record<GuestDTO["status"], string> = {
  PENDING: "guests.status.pending",
  APPROVED: "guests.status.approved",
  REJECTED: "guests.status.rejected",
};

const STATUS_STYLES: Record<GuestDTO["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-gray-100 text-gray-500",
};

function initials(email: string): string {
  return email.trim().slice(0, 2).toUpperCase() || "?";
}

/**
 * Invités (GalleryGuest) — vue transverse à tous les studios, demande d'Adriel le 05/08/2026 :
 * "panel admin avoir la liste des invités du projet et la possibilité de filtrer par studio,
 * date, la recherche par email, l'affichage en liste et en colonne". Même architecture que
 * /admin/orders : filtre studio côté serveur (query `studioId`, voir /api/admin/guests),
 * recherche email + filtre date + bascule vue liste/grille côté client (volumes attendus bien
 * plus faibles que l'historique de commandes).
 */
export default function AdminGuestsPage() {
  const [guests, setGuests] = useState<GuestDTO[] | null>(null);
  const [studios, setStudios] = useState<StudioOption[] | null>(null);
  const [studioFilter, setStudioFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { t, locale } = useLanguage();

  useEffect(() => {
    fetch("/api/admin/studios")
      .then((r) => r.json())
      .then((data) => setStudios((data.studios || []).map((s: any) => ({ id: s.id, name: s.name }))));
  }, []);

  useEffect(() => {
    setGuests(null);
    const url = studioFilter === "ALL" ? "/api/admin/guests" : `/api/admin/guests?studioId=${studioFilter}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => setGuests(data.guests || []));
  }, [studioFilter]);

  const filtered = useMemo(() => {
    if (!guests) return [];
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    // Borne "à" incluse jusqu'à la fin de la journée sélectionnée, sinon un invité créé le
    // jour même à 14h serait exclu par une comparaison stricte à minuit.
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    return guests.filter((g) => {
      const matchesSearch =
        !q || g.email.toLowerCase().includes(q) || g.galleryTitle.toLowerCase().includes(q);
      const created = new Date(g.createdAt);
      const matchesFrom = !from || created >= from;
      const matchesTo = !to || created <= to;
      return matchesSearch && matchesFrom && matchesTo;
    });
  }, [guests, search, dateFrom, dateTo]);

  // Revient à la page 1 dès qu'un filtre ou la taille de page change une liste filtrée plus
  // courte — sinon on peut se retrouver bloqué sur une page devenue vide.
  useEffect(() => {
    setPage(1);
  }, [search, dateFrom, dateTo, studioFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (!guests || !studios) return <PageSpinner />;

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">{t("admin.guests.title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("admin.guests.subtitle")}</p>

      {/* Sur mobile : Recherche et Studio occupent toute la largeur (chacun sur sa ligne),
          Du/Au restent côte à côte sur une même ligne (moitié chacun) — demande d'Adriel,
          12/08/2026 : "mettre la barre de recherche et studio sur toute la largeur et sur la
          meme ligne mettre du et au". À partir de sm, on repasse à la disposition en ligne
          d'origine (largeurs fixes). Le sélecteur "par page" + la bascule liste/grille
          passent à droite de la barre ("ajouter a droite le nombre de item a afficher et la
          pagination") ; les contrôles précédent/suivant restent sous la liste (même
          convention que /dashboard/guests côté studio). */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full sm:w-56 sm:shrink-0">
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("admin.guests.searchLabel")}</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.guests.searchPlaceholder")}
              className="input"
            />
          </div>
          <div className="w-full sm:w-52 sm:shrink-0">
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("admin.guests.studioLabel")}</label>
            <SearchableSelect
              value={studioFilter}
              onChange={setStudioFilter}
              placeholder={t("admin.guests.allStudios")}
              searchPlaceholder={t("admin.guests.searchStudioPlaceholder")}
              options={[
                { value: "ALL", label: t("admin.guests.allStudios") },
                ...studios.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </div>
          <div className="flex gap-2 sm:contents">
            <div className="w-1/2 sm:w-36 sm:shrink-0">
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("admin.guests.dateFromLabel")}</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input" />
            </div>
            <div className="w-1/2 sm:w-36 sm:shrink-0">
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("admin.guests.dateToLabel")}</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input" />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
          {/* Nombre d'invités par page réglable — demande d'Adriel le 12/08/2026. */}
          <label className="flex items-center gap-2 text-sm text-gray-600">
            {t("guests.perPage")}
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="input w-auto py-1.5 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          {/* Bascule vue liste/colonnes (grille) — même pattern que GalleriesListView côté
              studio (icônes grid/list, état actif en fond sombre). */}
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title={t("admin.guests.viewList")}
              aria-label={t("admin.guests.viewList")}
              className={`rounded-md p-1.5 ${viewMode === "list" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-white"}`}
            >
              <IconList />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title={t("admin.guests.viewGrid")}
              aria-label={t("admin.guests.viewGrid")}
              className={`rounded-md p-1.5 ${viewMode === "grid" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-white"}`}
            >
              <IconGrid />
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-gray-200 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-300">
            <IconUsers />
          </div>
          <p className="text-sm text-gray-500">
            {guests.length === 0 ? t("admin.guests.emptyNone") : t("admin.guests.emptyNoMatch")}
          </p>
        </div>
      )}

      {filtered.length > 0 && viewMode === "list" && (
        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,220px)_minmax(0,1fr)_auto_auto] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:grid">
            <span>{t("guests.colEmail")}</span>
            <span>{t("guests.colStudio")}</span>
            <span>{t("guests.colGallery")}</span>
            <span>{t("guests.colStatus")}</span>
            <span className="text-right">{t("guests.colDate")}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {paginated.map((g) => (
              <div
                key={g.id}
                className="grid grid-cols-1 gap-1.5 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {initials(g.email)}
                  </div>
                  <p className="truncate text-sm font-medium text-gray-900">{g.email}</p>
                </div>
                <span className="truncate rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {g.studioName}
                </span>
                <p className="truncate text-sm text-gray-600">{g.galleryTitle}</p>
                <span className={`inline-block w-fit rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[g.status]}`}>
                  {t(STATUS_KEYS[g.status])}
                </span>
                <p className="text-left text-xs text-gray-400 sm:text-right">
                  {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(g.createdAt))}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {filtered.length > 0 && viewMode === "grid" && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {paginated.map((g) => (
            <div key={g.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                  {initials(g.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{g.email}</p>
                  <p className="truncate text-xs text-gray-500">{g.studioName}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[g.status]}`}>
                  {t(STATUS_KEYS[g.status])}
                </span>
              </div>
              <p className="mt-3 truncate text-sm text-gray-600">{g.galleryTitle}</p>
              <p className="mt-1 text-xs text-gray-400">
                {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(g.createdAt))}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Pagination — demande d'Adriel le 12/08/2026 ("ajouter [...] la pagination"), même
          convention que /dashboard/guests côté studio (prev/next centrés sous la liste). */}
      {filtered.length > pageSize && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="btn-secondary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("guests.prevPage")}
          </button>
          <span className="text-sm text-gray-500">
            {t("guests.pageInfo").replace("{page}", String(currentPage)).replace("{total}", String(totalPages))}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="btn-secondary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("guests.nextPage")}
          </button>
        </div>
      )}
    </div>
  );
}

function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6" strokeLinecap="round" />
      <path d="M16 5.2c1.7.5 3 2.1 3 3.9 0 1.9-1.3 3.4-3 3.9" strokeLinecap="round" />
      <path d="M15 14c2.5.3 4.5 2.6 4.5 6" strokeLinecap="round" />
    </svg>
  );
}
