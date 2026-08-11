"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";

interface BookingDTO {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  bookingType: { name: string } | null;
}

// Même palette que OrdersView (30/07/2026) — cohérence visuelle entre les listes du panel :
// une couleur = un statut, réutilisée partout plutôt que réinventée page par page.
const STATUS_STYLES: Record<BookingDTO["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  COMPLETED: "bg-green-50 text-green-700",
};

/** Initiales du client — même logique que OrdersView (initials()), dupliquée volontairement
 * plutôt que factorisée dans un helper partagé pour ce petit composant à deux endroits. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const PAGE_SIZE = 10;

export default function BookingsPage() {
  const { t, locale } = useLanguage();
  const STATUS_LABELS: Record<BookingDTO["status"], string> = {
    PENDING: t("bookingStatus.pending"),
    CONFIRMED: t("bookingStatus.confirmed"),
    CANCELLED: t("bookingStatus.cancelled"),
    COMPLETED: t("bookingStatus.completed"),
  };

  const [bookings, setBookings] = useState<BookingDTO[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BookingDTO["status"] | "ALL">("ALL");
  const [page, setPage] = useState(1);
  // Réservation ouverte dans le modal de détails (demande d'Adriel, 11/08/2026 : "on dois
  // cliquer sur les informations de la personne pour avoir dans un modal (toutes les
  // informations de la reservation)"). On garde l'id plutôt que l'objet entier pour toujours
  // afficher la version la plus fraîche depuis `bookings` après un changement de statut.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  function load() {
    fetch("/api/bookings")
      .then((r) => r.json())
      .then((d) => setBookings(d.bookings || []))
      .finally(() => setPageLoading(false));
  }
  useEffect(load, []);

  async function updateStatus(id: string, status: string) {
    setStatusUpdating(true);
    try {
      await fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      load();
    } finally {
      setStatusUpdating(false);
    }
  }

  function formatDateTime(iso: string) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  }

  function formatTimeRange(startsAt: string, endsAt: string) {
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(startsAt));
    const start = new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(startsAt));
    const end = new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(endsAt));
    return `${date} · ${start} – ${end}`;
  }

  const selectedBooking = useMemo(
    () => bookings.find((b) => b.id === selectedId) || null,
    [bookings, selectedId]
  );

  // Tri chronologique croissant (prochaine réservation en premier) — cohérent avec
  // "Réservations à venir" affiché sur la Vue d'ensemble, plus utile ici qu'un tri par date
  // de création qui mélangerait passé et futur sans ordre logique.
  const sorted = useMemo(
    () => [...bookings].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [bookings]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((b) => {
      const matchesSearch =
        !q || b.customerName.toLowerCase().includes(q) || b.customerEmail.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "ALL" || b.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [sorted, search, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (pageLoading) return <PageSpinner />;

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">{t("bookings.title")}</h1>

      {bookings.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="w-56 shrink-0">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("bookings.searchPlaceholder")}
              className="input"
            />
          </div>
          <div className="w-44 shrink-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as BookingDTO["status"] | "ALL")}
              className="input"
            >
              <option value="ALL">{t("bookings.allStatuses")}</option>
              {(Object.keys(STATUS_LABELS) as BookingDTO["status"][]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {bookings.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <IconCalendar />
            </span>
            <p className="text-sm font-medium text-gray-600">{t("bookings.empty")}</p>
            <p className="max-w-sm text-xs text-gray-400">{t("bookings.emptyHint")}</p>
          </div>
        )}
        {bookings.length > 0 && filtered.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-500">{t("bookings.emptyFiltered")}</p>
        )}
        {paginated.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setSelectedId(b.id)}
            className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-gray-50"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                {initials(b.customerName)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">
                  {b.customerName}
                  {b.bookingType ? <span className="font-normal text-gray-500"> — {b.bookingType.name}</span> : null}
                </p>
                <p className="truncate text-sm text-gray-500">{b.customerEmail}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">{formatDateTime(b.startsAt)}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[b.status]}`}>
                {STATUS_LABELS[b.status]}
              </span>
              {b.status === "PENDING" && (
                <div className="flex items-center gap-2">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateStatus(b.id, "CONFIRMED");
                    }}
                    className="btn-secondary text-xs"
                  >
                    {t("bookings.confirm")}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateStatus(b.id, "CANCELLED");
                    }}
                    className="btn-secondary text-xs"
                  >
                    {t("bookings.decline")}
                  </span>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {filtered.length > 0 && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="text-gray-600 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40"
          >
            {t("orders.prevPage")}
          </button>
          <span className="text-gray-500">
            {t("orders.pageInfo").replace("{page}", String(currentPage)).replace("{total}", String(totalPages))}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="text-gray-600 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40"
          >
            {t("orders.nextPage")}
          </button>
        </div>
      )}

      {selectedBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-serif text-lg font-semibold text-gray-900">{t("bookings.detailsTitle")}</h2>
              <button
                onClick={() => setSelectedId(null)}
                className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label={t("bookings.close")}
              >
                <IconClose />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                {initials(selectedBooking.customerName)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">{selectedBooking.customerName}</p>
                <span
                  className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[selectedBooking.status]}`}
                >
                  {STATUS_LABELS[selectedBooking.status]}
                </span>
              </div>
            </div>

            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-gray-500">{t("bookings.customer")}</dt>
                <dd className="text-right text-gray-900">{selectedBooking.customerEmail}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-gray-500">{t("bookings.phone")}</dt>
                <dd className="text-right text-gray-900">{selectedBooking.customerPhone || t("bookings.noPhone")}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-gray-500">{t("bookings.type")}</dt>
                <dd className="text-right text-gray-900">
                  {selectedBooking.bookingType?.name || t("bookings.noType")}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-gray-500">{t("bookings.slot")}</dt>
                <dd className="text-right text-gray-900">
                  {formatTimeRange(selectedBooking.startsAt, selectedBooking.endsAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-gray-500">{t("bookings.createdAt")}</dt>
                <dd className="text-right text-gray-900">{formatDateTime(selectedBooking.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t("bookings.notes")}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-gray-900">
                  {selectedBooking.notes || t("bookings.noNotes")}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
              {selectedBooking.status === "PENDING" && (
                <>
                  <button
                    disabled={statusUpdating}
                    onClick={() => updateStatus(selectedBooking.id, "CANCELLED")}
                    className="btn-secondary text-sm disabled:opacity-50"
                  >
                    {t("bookings.decline")}
                  </button>
                  <button
                    disabled={statusUpdating}
                    onClick={() => updateStatus(selectedBooking.id, "CONFIRMED")}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {t("bookings.confirm")}
                  </button>
                </>
              )}
              {selectedBooking.status === "CONFIRMED" && (
                // Demande d'Adriel (11/08/2026) : "une reservation validé peux etre annulé ou
                // mise en attente apres" — une réservation déjà confirmée n'est plus figée.
                <>
                  <button
                    disabled={statusUpdating}
                    onClick={() => updateStatus(selectedBooking.id, "PENDING")}
                    className="btn-secondary text-sm disabled:opacity-50"
                  >
                    {t("bookings.revertToPending")}
                  </button>
                  <button
                    disabled={statusUpdating}
                    onClick={() => updateStatus(selectedBooking.id, "CANCELLED")}
                    className="btn-secondary text-sm disabled:opacity-50"
                  >
                    {t("bookings.cancel")}
                  </button>
                </>
              )}
              <button onClick={() => setSelectedId(null)} className="btn-secondary text-sm">
                {t("bookings.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}
