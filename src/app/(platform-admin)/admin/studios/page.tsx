"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface StudioListItem {
  id: string;
  name: string;
  slug: string;
  ownerName: string | null;
  ownerEmail: string | null;
  plan: { id: string; name: string; isFree: boolean } | null;
  subscriptionStatus: string | null;
  galleryCount: number;
  clientCount: number;
  createdAt: string;
}

// Recherche + pagination — demande d'Adriel, 12/08/2026 : "mettre dans cette page la
// pagination, la barre de recherche et le nombre d'item a afficher". Même patron que
// /admin/guests et /dashboard/guests (10 par page par défaut, sélecteur pour changer,
// prev/next centrés sous la liste) — la page listait jusque-là TOUS les studios d'un coup,
// sans aucun filtre ni découpage.
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

export default function AdminStudiosPage() {
  const [studios, setStudios] = useState<StudioListItem[] | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { t, locale } = useLanguage();

  useEffect(() => {
    fetch("/api/admin/studios")
      .then((res) => res.json())
      .then((data) => setStudios(data.studios));
  }, []);

  const filtered = useMemo(() => {
    if (!studios) return [];
    const q = search.trim().toLowerCase();
    if (!q) return studios;
    return studios.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.ownerName || "").toLowerCase().includes(q) ||
        (s.ownerEmail || "").toLowerCase().includes(q)
    );
  }, [studios, search]);

  // Revient à la page 1 dès que la recherche ou la taille de page change une liste filtrée
  // plus courte — sinon on peut se retrouver bloqué sur une page devenue vide.
  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (!studios) return <PageSpinner />;

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Studios</h1>
      <p className="mt-1 text-sm text-gray-500">{t("admin.studios.subtitle")}</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="w-full sm:w-64">
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("admin.studios.searchLabel")}</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.studios.searchPlaceholder")}
            className="input"
          />
        </div>
        {/* Nombre de studios par page réglable — demande d'Adriel le 12/08/2026. */}
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
      </div>

      <div className="mt-6 space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-gray-500">
            {studios.length === 0 ? t("admin.studios.empty") : t("admin.studios.emptyNoMatch")}
          </p>
        )}
        {paginated.map((studio) => (
          <Link
            key={studio.id}
            href={`/admin/studios/${studio.id}`}
            className="card flex items-center justify-between hover:border-brand-600"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{studio.name}</p>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {studio.plan ? studio.plan.name : t("admin.studios.noPlan")}
                </span>
                {studio.subscriptionStatus && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {studio.subscriptionStatus}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {studio.ownerName || "—"} · {studio.ownerEmail || "—"} · {studio.galleryCount}{" "}
                {t("admin.studios.galleryUnit")} · {studio.clientCount} {t("admin.studios.clientUnit")}
              </p>
            </div>
            <p className="shrink-0 text-xs text-gray-400">
              {t("admin.studios.registeredOn")} {new Date(studio.createdAt).toLocaleDateString(locale)}
            </p>
          </Link>
        ))}
      </div>

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
