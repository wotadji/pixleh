"use client";

import { useEffect, useMemo, useState } from "react";
import { PageSpinner } from "@/components/ui/Spinner";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

type OrderStatus = "PENDING" | "PAID" | "FULFILLED" | "CANCELLED" | "REFUNDED";

interface OrderPhoto {
  id: string;
  filename: string;
  thumbUrl: string;
  previewUrl: string;
}

interface OrderItemDTO {
  id: string;
  quantity: number;
  productId: string;
  productName: string;
  photo: OrderPhoto | null;
}

interface OrderDTO {
  id: string;
  studioId: string;
  studioName: string;
  customerName: string;
  customerEmail: string;
  galleryId: string | null;
  galleryTitle: string | null;
  createdAt: string;
  totalCents: number;
  currency: string;
  status: OrderStatus;
  items: OrderItemDTO[];
}

interface StudioOption {
  id: string;
  name: string;
}

/** Un groupe = toutes les lignes d'une commande pour un même produit (ex: 11 tirages
 * "Impression Photo 10*15") — regroupées pour éviter une ligne par unité, même logique que
 * OrdersView côté studio (voir /dashboard/orders), demandée ici aussi par Adriel le
 * 01/08/2026 : "ranger par regroupement (genre 11* pour un produit)". */
interface ProductGroup {
  productId: string;
  productName: string;
  count: number;
  photos: OrderPhoto[];
}

function groupItems(items: OrderItemDTO[]): ProductGroup[] {
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

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "En attente",
  PAID: "Payée",
  FULFILLED: "Traitée",
  CANCELLED: "Annulée",
  REFUNDED: "Remboursée",
};

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-green-50 text-green-700",
  FULFILLED: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  REFUNDED: "bg-gray-100 text-gray-500",
};

const PAGE_SIZE = 10;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(iso));
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

/**
 * Commandes plateforme — vue transverse à tous les studios, demandée par Adriel le 01/08/2026 :
 * "mettre les commandes dans les panels d'administrateur, on peut voir toutes les commandes
 * de tous les studios et des filtres aussi par studio". Complète /dashboard/orders (vue d'UN
 * studio sur ses propres commandes), ne la remplace pas.
 *
 * Regroupement par produit + bouton "Plus de détail" ajoutés le 01/08/2026 (même demande) —
 * reprend le composant OrdersView du dashboard studio. Nécessite que checkGalleryAccess
 * accorde l'accès aux photos de N'IMPORTE QUEL studio à un admin plateforme (voir
 * src/lib/access.ts), sinon les vignettes retourneraient 403.
 */
export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  const [studios, setStudios] = useState<StudioOption[] | null>(null);
  const [studioFilter, setStudioFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailGroup, setDetailGroup] = useState<ProductGroup | null>(null);
  const [detailGalleryId, setDetailGalleryId] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/studios")
      .then((r) => r.json())
      .then((data) => setStudios((data.studios || []).map((s: any) => ({ id: s.id, name: s.name }))));
  }, []);

  useEffect(() => {
    setOrders(null);
    const url = studioFilter === "ALL" ? "/api/admin/orders" : `/api/admin/orders?studioId=${studioFilter}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => setOrders(data.orders || []));
  }, [studioFilter]);

  const stats = useMemo(() => {
    if (!orders) return null;
    const revenue = orders
      .filter((o) => o.status === "PAID" || o.status === "FULFILLED")
      .reduce((sum, o) => sum + o.totalCents, 0);
    const pending = orders.filter((o) => o.status === "PENDING").length;
    const studioIds = new Set(orders.map((o) => o.studioId));
    return {
      total: orders.length,
      revenue,
      currency: orders[0]?.currency || "EUR",
      pending,
      studioCount: studioIds.size,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesSearch =
        !q ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerEmail.toLowerCase().includes(q) ||
        o.studioName.toLowerCase().includes(q) ||
        (o.galleryTitle || "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "ALL" || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, studioFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!orders || !studios || !stats) return <PageSpinner />;

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Commandes</h1>
      <p className="mt-1 text-sm text-gray-500">
        Toutes les commandes de tous les studios, y compris les commandes d&apos;impression
        (catalogue plateforme, voir Catalogue impression) — filtrable par studio.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Commandes" value={String(stats.total)} />
        <StatCard label="CA payé / traité" value={formatMoney(stats.revenue, stats.currency)} />
        <StatCard label="En attente" value={String(stats.pending)} tone={stats.pending > 0 ? "amber" : undefined} />
        <StatCard label="Studios concernés" value={String(stats.studioCount)} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="w-56 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (client, studio, galerie)"
            className="input"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="w-52 shrink-0">
            <SearchableSelect
              value={studioFilter}
              onChange={setStudioFilter}
              placeholder="Tous les studios"
              searchPlaceholder="Rechercher un studio..."
              options={[
                { value: "ALL", label: "Tous les studios" },
                ...studios.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </div>
          <div className="w-44 shrink-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "ALL")}
              className="input"
            >
              <option value="ALL">Tous les statuts</option>
              {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-300">
              <IconBag />
            </div>
            <p className="text-sm text-gray-500">
              {orders.length === 0 ? "Aucune commande pour le moment." : "Aucune commande ne correspond à ta recherche."}
            </p>
          </div>
        )}
        {paginated.map((o) => {
          const groups = groupItems(o.items);
          return (
            <div key={o.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {initials(o.customerName)}
                  </div>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 truncate font-medium text-gray-900">
                      {o.customerName}
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {o.studioName}
                      </span>
                    </p>
                    <p className="truncate text-sm text-gray-500">
                      {o.customerEmail} · {o.galleryTitle || "—"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400">{formatDate(o.createdAt)}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-medium text-gray-900">{formatMoney(o.totalCents, o.currency)}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[o.status]}`}>
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
                        Plus de détail
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
            Précédent
          </button>
          <span className="text-gray-500">
            Page {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="text-gray-600 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40"
          >
            Suivant
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

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === "amber" ? "text-amber-600" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

/** Panneau listant les photos d'un groupe produit, cliquables pour zoomer — même composant
 * que OrdersView (dashboard studio), adapté ici pour fonctionner quel que soit le studio. */
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
                Télécharger
              </a>
            )}
            <button
              onClick={onClose}
              aria-label="Fermer"
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
                <img src={p.thumbUrl} alt={p.filename} className="h-full w-full cursor-zoom-in object-cover" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Zoom plein écran d'une photo commandée, navigation précédent/suivant. */
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

function IconBag() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 8h12l1 12.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20.5L6 8Z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" strokeLinecap="round" />
    </svg>
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
