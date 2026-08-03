"use client";

/**
 * Petit graphique en barres "maison" (pas de dépendance de charting) pour les mini-tableaux
 * de bord de la Vue d'ensemble (chiffre d'affaires YTD, activité d'upload). Redesign IBCS
 * (03/08/2026, demande d'Adriel) : une seule couleur sémantique unie par métrique (plus de
 * dégradé "criard"), valeur étiquetée directement au-dessus de chaque barre plutôt que
 * lisible seulement au survol (title natif conservé en complément, pas en remplacement), et
 * les mois sans données rendus en gris clair plutôt qu'en simple opacité réduite de la
 * couleur de la série — pour bien distinguer "vraie valeur nulle" de "pas encore de mois".
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
  emptyHint,
  emptyIcon,
  barColorClassName = "bg-brand-600",
  gradientClassName,
}: {
  data: BarChartDatum[];
  formatValue?: (value: number) => string;
  emptyLabel?: string;
  /** Sous-texte rassurant affiché sous emptyLabel — ex: "à quel moment les données apparaîtront". */
  emptyHint?: string;
  emptyIcon?: React.ReactNode;
  /** Couleur unie de la série (fond, ex: "bg-brand-600"). */
  barColorClassName?: string;
  /** @deprecated conservé pour compat ascendante — un dégradé fourni ici est ignoré au profit
   * d'une couleur unie (IBCS : pas de dégradé décoratif sans signification). */
  gradientClassName?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const hasAny = data.some((d) => d.value > 0);

  if (!hasAny) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 px-4 text-center text-gray-300"
        style={{ height: CHART_HEIGHT + 28 }}
      >
        {emptyIcon && <span className="h-8 w-8">{emptyIcon}</span>}
        {emptyLabel && <p className="text-xs font-medium text-gray-400">{emptyLabel}</p>}
        {emptyHint && <p className="text-[11px] text-gray-300">{emptyHint}</p>}
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
          const px = d.value > 0 ? Math.max(4, Math.round((d.value / max) * (CHART_HEIGHT - 18))) : 0;
          return (
            <div
              key={`${d.label}-${i}`}
              className="relative z-10 flex flex-1 flex-col items-center justify-end"
              style={{ height: CHART_HEIGHT }}
            >
              {/* Étiquetage direct de la valeur — lisible sans survol (principe IBCS). */}
              {d.value > 0 && (
                <span
                  className="mb-1 whitespace-nowrap text-[10px] font-medium text-gray-500"
                  style={{ marginBottom: 4 }}
                >
                  {formatValue ? formatValue(d.value) : d.value.toLocaleString()}
                </span>
              )}
              <div
                className={`w-full rounded-t-md transition-all hover:brightness-110 ${
                  d.value > 0 ? barColorClassName : "bg-gray-150"
                }`}
                style={{ height: px || 3, backgroundColor: d.value === 0 ? "#e5e7eb" : undefined }}
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
