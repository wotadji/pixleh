"use client";

import Link from "next/link";

/**
 * Liste classée (top N galeries) avec une mini-barre de progression par ligne — utilisée pour
 * "Espace occupé par galerie" (une seule métrique : les octets) et "Galeries les plus
 * populaires" (deux métriques combinées : favoris + téléchargements, voir `meta`). Même
 * esprit que SimpleBarChart (pas de dépendance de charting) mais en liste horizontale, plus
 * lisible ici qu'un histogramme vertical vu que les libellés (titres de galerie) sont longs.
 */
export interface RankedGalleryItem {
  id: string;
  title: string;
  /** Valeur qui pilote la largeur de la barre (ex: octets, ou favoris + téléchargements). */
  value: number;
  /** Contenu affiché à droite de la ligne (texte ou icônes + nombres). */
  meta: React.ReactNode;
}

export function GalleryRankingList({
  items,
  hrefBase,
  emptyLabel,
  emptyHint,
  emptyIcon,
  barGradientClassName = "from-brand-600 to-brand-400",
}: {
  items: RankedGalleryItem[];
  hrefBase: string;
  emptyLabel?: string;
  /** Sous-texte rassurant affiché sous emptyLabel — ex: quand les données apparaîtront. */
  emptyHint?: string;
  emptyIcon?: React.ReactNode;
  barGradientClassName?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-gray-300">
        {emptyIcon && <span className="h-8 w-8">{emptyIcon}</span>}
        {emptyLabel && <p className="text-xs font-medium text-gray-400">{emptyLabel}</p>}
        {emptyHint && <p className="text-[11px] text-gray-300">{emptyHint}</p>}
      </div>
    );
  }

  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className="space-y-3.5">
      {items.map((item, i) => {
        const pct = item.value > 0 ? Math.max(4, Math.round((item.value / max) * 100)) : 0;
        return (
          <Link key={item.id} href={`${hrefBase}/${item.id}`} className="group block">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-medium text-gray-500 transition-colors group-hover:bg-brand-50 group-hover:text-brand-600">
                  {i + 1}
                </span>
                <span className="truncate font-medium text-gray-700 transition-colors group-hover:text-brand-600">
                  {item.title}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2.5 text-xs tabular-nums text-gray-400">{item.meta}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full bg-gradient-to-r transition-all group-hover:brightness-110 ${barGradientClassName}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
