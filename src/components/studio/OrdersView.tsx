"use client";

import { useEffect, useState } from "react";
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
  totalCents: number;
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

export function OrdersView({ orders }: { orders: OrderRow[] }) {
  const { t } = useLanguage();
  const [detailGroup, setDetailGroup] = useState<ProductGroup | null>(null);
  const [detailGalleryId, setDetailGalleryId] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  const STATUS_LABELS: Record<OrderRow["status"], string> = {
    PENDING: t("orderStatus.pending"),
    PAID: t("orderStatus.paid"),
    FULFILLED: t("orderStatus.fulfilled"),
    CANCELLED: t("orderStatus.cancelled"),
    REFUNDED: t("orderStatus.refunded"),
  };

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">{t("orders.title")}</h1>
      <div className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {orders.length === 0 && <p className="p-6 text-sm text-gray-500">{t("orders.empty")}</p>}
        {orders.map((o) => {
          const groups = groupItems(o.items);
          return (
            <div key={o.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{o.customerName}</p>
                  <p className="text-sm text-gray-500">
                    {o.customerEmail} · {o.galleryTitle || "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{(o.totalCents / 100).toFixed(2)} €</p>
                  <span className="text-xs text-gray-500">{STATUS_LABELS[o.status]}</span>
                </div>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-gray-500">
                {groups.map((g) => (
                  <li key={g.productId} className="flex items-center justify-between gap-3">
                    <span>
                      {g.count} × {g.productName}
                    </span>
                    {g.photos.length > 0 && (
                      <button
                        onClick={() => {
                          setDetailGroup(g);
                          setDetailGalleryId(o.galleryId);
                        }}
                        className="shrink-0 text-xs font-medium uppercase tracking-wide text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
                      >
                        {t("orders.details")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

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
