"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";

interface GuestDTO {
  id: string;
  email: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  marketingOptIn: boolean;
  createdAt: string;
  galleryId: string;
  galleryTitle: string;
  gallerySlug: string;
}

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

/**
 * Liste des invités (GalleryGuest) de toutes les galeries du studio — demande d'Adriel le
 * 05/08/2026 : "voir la liste des emails des invités d'un studio" depuis le panel studio.
 * Recherche par email uniquement ici (côté admin plateforme : filtres studio + date en plus,
 * voir /admin/guests) — un studio n'a qu'à retrouver SES invités, pas besoin de plus.
 */
export default function GuestsPage() {
  const { t, locale } = useLanguage();
  const [guests, setGuests] = useState<GuestDTO[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/guests")
      .then((r) => r.json())
      .then((d) => setGuests(d.guests || []));
  }, []);

  const filtered = useMemo(() => {
    if (!guests) return [];
    const q = search.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter(
      (g) => g.email.toLowerCase().includes(q) || g.galleryTitle.toLowerCase().includes(q)
    );
  }, [guests, search]);

  if (!guests) return <PageSpinner />;

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">{t("guests.title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("guests.subtitle")}</p>

      <div className="mt-5 w-64">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("guests.searchPlaceholder")}
          className="input w-full"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
        {filtered.length > 0 && (
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:grid">
            <span>{t("guests.colEmail")}</span>
            <span>{t("guests.colGallery")}</span>
            <span>{t("guests.colStatus")}</span>
            <span className="text-right">{t("guests.colDate")}</span>
          </div>
        )}
        <div className="divide-y divide-gray-100">
          {filtered.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-500">
              {guests.length === 0 ? t("guests.empty") : t("guests.emptyNoMatch")}
            </p>
          )}
          {filtered.map((g) => (
            <div
              key={g.id}
              className="grid grid-cols-1 gap-1.5 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3"
            >
              <p className="truncate text-sm font-medium text-gray-900">{g.email}</p>
              <Link
                href={`/dashboard/galleries/${g.galleryId}`}
                className="truncate text-sm text-brand-600 hover:underline"
              >
                {g.galleryTitle}
              </Link>
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
    </div>
  );
}
