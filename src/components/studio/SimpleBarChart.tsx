"use client";

/**
 * Petit graphique en barres "maison" (pas de dépendance de charting) pour les mini-tableaux
 * de bord de la Vue d'ensemble (chiffre d'affaires YTD, activité d'upload) — volontairement
 * minimaliste : une barre par mois, hauteur en pixels proportionnelle au maximum de la
 * série, étiquette au survol via `title` natif plutôt qu'un tooltip custom. Lignes de
 * repère horizontales + dégradé sur les barres pour un rendu plus soigné qu'un simple bloc
 * plat.
 */

const CHART_HEIGHT = 128;
const GRID_LINES = 3;

export interface BarChartDatum {
  label: string;
  value: number;
}

export function SimpleBarChart({
  data,
  formatValue,
  emptyLabel,
  emptyIcon,
  gradientClassName = "from-brand-600 to-brand-400",
}: {
  data: BarChartDatum[];
  formatValue?: (value: number) => string;
  emptyLabel?: string;
  emptyIcon?: React.ReactNode;
  gradientClassName?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const hasAny = data.some((d) => d.value > 0);

  if (!hasAny) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 text-gray-300"
        style={{ height: CHART_HEIGHT + 28 }}
      >
        {emptyIcon && <span className="h-8 w-8">{emptyIcon}</span>}
        {emptyLabel && <p className="text-xs text-gray-400">{emptyLabel}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="relative flex items-end gap-1.5 sm:gap-2" style={{ height: CHART_HEIGHT }}>
        {/* Lignes de repère horizontales, purement décoratives (pas d'échelle chiffrée —
            volontaire, ce sont des mini-graphiques d'aperçu, pas des rapports détaillés). */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {Array.from({ length: GRID_LINES + 1 }).map((_, i) => (
            <div key={i} className="border-t border-gray-100" />
          ))}
        </div>
        {data.map((d, i) => {
          const px = d.value > 0 ? Math.max(4, Math.round((d.value / max) * CHART_HEIGHT)) : 0;
          return (
            <div
              key={`${d.label}-${i}`}
              className="relative z-10 flex flex-1 flex-col items-center justify-end"
              style={{ height: CHART_HEIGHT }}
            >
              <div
                className={`w-full rounded-t-md bg-gradient-to-t transition-all hover:brightness-110 ${gradientClassName} ${
                  d.value === 0 ? "opacity-10" : ""
                }`}
                style={{ height: px || 2 }}
                title={formatValue ? formatValue(d.value) : String(d.value)}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 sm:gap-2">
        {data.map((d, i) => (
          <span key={`${d.label}-${i}-label`} className="flex-1 text-center text-[10px] text-gray-400">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
