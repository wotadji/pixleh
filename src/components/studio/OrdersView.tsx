"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface OrderPhoto {
  id: string;
  filename: string;
  thumbUrl: string;
  previewUrl: string;
}

interface OrderItemRow {
  id: string;
  quantity: number;
  productId: string;
  productName: string;
  photo: OrderPhoto | null;
}

interface OrderRow {
  id: string;
  customerName: string;
  customerEmail: string;
  galleryId: string | null;
  galleryTitle: string | null;
  createdAt: string;
  totalCents: number;
  currency: string;
  status: "PENDING" | "PAID" | "FULFILLED" | "CANCELLED" | "REFUNDED";
  items: OrderItemRow[];
}

/** Un groupe = toutes les lignes d'une commande pour un même produit (ex: 3 tirages
 * "Impression Photo 10*15") — regroupées pour éviter une ligne par unité comme avant, et
 * pour pouvoir ouvrir un seul panneau "Plus de détail" listant les photos de CE groupe. */
interface ProductGroup {
  productId: string;
  productName: string;
  count: number;
  photos: OrderPhoto[];
}

function groupItems(items: OrderItemRow[]): ProductGroup[] {
  const byProduct = new Map<string, ProductGroup>();
  for (const item of items) {
    const existing = byProduct.get(item.productId);
    if (existing) {
      existing.count += item.quantity;
      if (item.photo) existing.photos.push(item.photo);
    } else {
      byProduct.set(item.productId, {
        productId: item.productId,
        productName: item.productName,
        count: item.quantity,
        photos: item.photo ? [item.photo] : [],
      });
    }
  }
  return [...byProduct.values()];
}

// Même palette que ClientOrdersView (espace client) — cohérence visuelle entre les deux
// vues d'une même commande (30/07/2026, refonte demandée par Adriel).
const STATUS_STYLES: Record<OrderRow["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-green-50 text-green-700",
  FULFILLED: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  REFUNDED: "bg-gray-100 text-gray-500",
};

const PAGE_SIZE = 8;

/** Initiales du client (ex: "Marie Dupont" → "MD") pour l'avatar rond — ne prend que la
 * première et la dernière "unité" du nom pour rester à 2 caractères même sur un nom composé. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

export function OrdersView({ orders }: { orders: OrderRow[] }) {
  const { t, locale } = useLanguage();
  const [detailGroup, setDetailGroup] = useState<ProductGroup | null>(null);
  const [detailGalleryId, setDetailGalleryId] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderRow["status"] | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const STATUS_LABELS: Record<OrderRow["status"], string> = {
    PENDING: t("orderStatus.pending"),
    PAID: t("orderStatus.paid"),
    FULFILLED: t("orderStatus.fulfilled"),
    CANCELLED: t("orderStatus.cancelled"),
    REFUNDED: t("orderStatus.refunded"),
  };

  function formatPrice(cents: number, currency: string) {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesSearch =
        !q ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerEmail.toLowerCase().includes(q) ||
        (o.galleryTitle || "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "ALL" || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  // Revenir en page 1 dès que la recherche ou le filtre change, sinon on peut se retrouver
  // sur une page qui n'existe plus dans le résultat filtré (même logique que ClientGalleriesView).
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">{t("orders.title")}</h1>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="w-56 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("orders.searchPlaceholder")}
            className="input"
          />
        </div>
        <div className="w-44 shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderRow["status"] | "ALL")}
            className="input"
          >
            <option value="ALL">{t("orders.allStatuses")}</option>
            {(Object.keys(STATUS_LABELS) as OrderRow["status"][]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {filtered.length === 0 && <p className="p-6 text-sm text-gray-500">{t("orders.empty")}</p>}
        {paginated.map((o) => {
          const groups = groupItems(o.items);
          return (
            <div key={o.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {initials(o.customerName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{o.customerName}</p>
                    <p className="truncate text-sm text-gray-500">
                      {o.customerEmail} · {o.galleryTitle || "—"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400">{formatDate(o.createdAt, locale)}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-medium text-gray-900">{formatPrice(o.totalCents, o.currency)}</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[o.status]}`}
                  >
                    {STATUS_LABELS[o.status]}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {groups.map((g) => (
                  <div
                    key={g.productId}
                    className="flex items-center gap-2 rounded-full bg-gray-50 py-1 pl-3 pr-1 text-xs text-gray-700"
                  >
                    <span>
                      {g.count} × {g.productName}
                    </span>
                    {g.photos.length > 0 && (
                      <button
                        onClick={() => {
                          setDetailGroup(g);
                          setDetailGalleryId(o.galleryId);
                        }}
                        className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-brand-700 shadow-sm hover:bg-brand-50"
                      >
                        {t("orders.details")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length > 0 && (
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

      {detailGroup && (
        <OrderPhotosModal
          group={detailGroup}
          galleryId={detailGalleryId}
          onZoom={(i) => setZoomIndex(i)}
          onClose={() => {
            setDetailGroup(null);
            setDetailGalleryId(null);
          }}
        />
      )}

      {detailGroup && zoomIndex !== null && (
        <OrderPhotoZoom
          photos={detailGroup.photos}
          index={zoomIndex}
          onNavigate={setZoomIndex}
          onClose={() => setZoomIndex(null)}
        />
      )}
    </div>
  );
}

/** Panneau listant les photos d'un groupe produit (ex: les 3 photos "Impression 10*15" de
 * cette commande) en grille de vignettes carrées, cliquables pour zoomer en taille réelle. */
function OrderPhotosModal({
  group,
  galleryId,
  onZoom,
  onClose,
}: {
  group: ProductGroup;
  galleryId: string | null;
  onZoom: (index: number) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  // ZIP HD des photos de CE groupe uniquement (voir /api/galleries/[id]/download-all, qui
  // accepte un sous-ensemble via `ids`) — dédoublonné au cas où une même photo apparaîtrait
  // deux fois dans le groupe. Le studio n'est jamais bloqué par le réglage "Téléchargement"
  // de la galerie (voir la route), donc ce bouton fonctionne même si le client ne peut pas
  // télécharger lui-même.
  const photoIds = [...new Set(group.photos.map((p) => p.id))];
  const downloadUrl =
    galleryId && photoIds.length > 0
      ? `/api/galleries/${galleryId}/download-all?ids=${photoIds.join(",")}&size=hd`
      : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-sm bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-gray-800">
            {group.productName} ({group.photos.length})
          </h2>
          <div className="flex items-center gap-4">
            {downloadUrl && (
              <a
                href={downloadUrl}
                className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-700 hover:text-gray-900"
              >
                <IconDownload />
                {t("orders.download")}
              </a>
            )}
            <button
              onClick={onClose}
              aria-label={t("common.close")}
              className="flex h-6 w-6 items-center justify-center text-gray-500 hover:text-gray-800"
            >
              <IconX />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {group.photos.map((p, i) => (
              <button
                key={`${p.id}-${i}`}
                type="button"
                onClick={() => onZoom(i)}
                className="aspect-square overflow-hidden rounded bg-gray-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumbUrl}
                  alt={p.filename}
                  className="h-full w-full cursor-zoom-in object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Zoom plein écran d'une photo commandée, avec navigation précédent/suivant parmi les
 * photos du groupe (et raccourcis clavier flèches/Échap). */
function OrderPhotoZoom({
  photos,
  index,
  onNavigate,
  onClose,
}: {
  photos: OrderPhoto[];
  index: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
}) {
  const photo = photos[index];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNavigate((index + 1) % photos.length);
      if (e.key === "ArrowLeft") onNavigate((index - 1 + photos.length) % photos.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, photos.length, onNavigate, onClose]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 px-4" onClick={onClose}>
      <button
        onClick={onClose}
        aria-label="Fermer"
        className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <IconX />
      </button>
      {photos.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate((index - 1 + photos.length) % photos.length);
            }}
            aria-label="Photo précédente"
            className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-5"
          >
            ‹
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate((index + 1) % photos.length);
            }}
            aria-label="Photo suivante"
            className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-5"
          >
            ›
          </button>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.previewUrl}
        alt={photo.filename}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded object-contain shadow-2xl"
      />
    </div>
  );
}

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19h16" strokeLinecap="round" />
    </svg>
  );
}
