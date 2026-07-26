/**
 * Apparence personnalisable d'une galerie : cover, typographie, couleurs, grille.
 * Utilisé à la fois par l'éditeur (aperçu live dans GalleryManager) et par la page
 * publique de la galerie (/g/[slug]) afin que les deux rendus restent identiques.
 */

export type CoverStyle =
  | "center"
  | "left"
  | "right"
  | "frame"
  | "stripe"
  | "divider"
  | "outline"
  | "minimal"
  | "editorial";

export type FontKey = "sans" | "serif" | "modern" | "timeless" | "bold" | "subtle";

export type ColorKey =
  | "light"
  | "gold"
  | "rose"
  | "terracotta"
  | "sand"
  | "agave"
  | "sea"
  | "dark";

export type GridStyle = "vertical" | "horizontal";
export type ThumbnailSize = "regular" | "large";
export type GridSpacing = "regular" | "large";
export type NavigationStyle = "icon" | "iconText";
/** Nombre de colonnes affichées sur la plus grande largeur d'écran (desktop). */
export type GridColumns = 2 | 3 | 4 | 5 | 6;

export interface GalleryDesign {
  coverStyle: CoverStyle;
  font: FontKey;
  color: ColorKey;
  gridStyle: GridStyle;
  thumbnailSize: ThumbnailSize;
  gridSpacing: GridSpacing;
  navigationStyle: NavigationStyle;
  columnsPerRow: GridColumns;
  /**
   * Point focal de la photo de couverture (0 à 1, comme un `object-position` en %) —
   * permet de recentrer/repositionner la zone importante de la photo (comme pour la
   * photo de profil du studio), plutôt que de toujours recadrer strictement au centre.
   * Voir CoverFocalPointModal (dashboard) et GalleryCover (rendu public).
   */
  coverFocalX: number;
  coverFocalY: number;
}

// Par défaut on reproduit le rendu "classique" d'une galerie Pixieset : photo de
// couverture pleine largeur avec le titre en bas à gauche (police serif légère) et
// un bouton "VOIR LA GALERIE" en bas à droite, grille en mosaïque (masonry).
export const DEFAULT_GALLERY_DESIGN: GalleryDesign = {
  coverStyle: "left",
  font: "serif",
  color: "light",
  gridStyle: "vertical",
  thumbnailSize: "regular",
  gridSpacing: "regular",
  navigationStyle: "icon",
  columnsPerRow: 5,
  coverFocalX: 0.5,
  coverFocalY: 0.5,
};

export const GRID_COLUMNS_OPTIONS: GridColumns[] = [2, 3, 4, 5, 6];

/** Fusionne un design partiel/potentiellement null (venant de la base) avec les valeurs par défaut. */
export function resolveGalleryDesign(design: unknown): GalleryDesign {
  if (!design || typeof design !== "object") return { ...DEFAULT_GALLERY_DESIGN };
  return { ...DEFAULT_GALLERY_DESIGN, ...(design as Partial<GalleryDesign>) };
}

export const COVER_STYLES: { key: CoverStyle; labelKey: string }[] = [
  { key: "center", labelKey: "design.cover.center" },
  { key: "left", labelKey: "design.cover.left" },
  { key: "right", labelKey: "design.cover.right" },
  { key: "frame", labelKey: "design.cover.frame" },
  { key: "stripe", labelKey: "design.cover.stripe" },
  { key: "divider", labelKey: "design.cover.divider" },
  { key: "outline", labelKey: "design.cover.outline" },
  { key: "minimal", labelKey: "design.cover.minimal" },
  { key: "editorial", labelKey: "design.cover.editorial" },
];

export const FONTS: { key: FontKey; labelKey: string; stack: string; className: string }[] = [
  { key: "sans", labelKey: "design.font.sans", stack: "var(--font-inter), ui-sans-serif, sans-serif", className: "font-normal tracking-normal" },
  { key: "serif", labelKey: "design.font.serif", stack: "var(--font-playfair), Georgia, serif", className: "font-normal tracking-normal" },
  { key: "modern", labelKey: "design.font.modern", stack: "var(--font-inter), ui-sans-serif, sans-serif", className: "font-semibold uppercase tracking-wide" },
  { key: "timeless", labelKey: "design.font.timeless", stack: "var(--font-playfair), Georgia, serif", className: "font-light tracking-normal" },
  { key: "bold", labelKey: "design.font.bold", stack: "var(--font-inter), ui-sans-serif, sans-serif", className: "font-extrabold uppercase tracking-tight" },
  { key: "subtle", labelKey: "design.font.subtle", stack: "var(--font-inter), ui-sans-serif, sans-serif", className: "font-light uppercase tracking-[0.2em]" },
];

export const COLOR_PALETTES: {
  key: ColorKey;
  labelKey: string;
  bg: string;
  text: string;
  accent: string;
}[] = [
  { key: "light", labelKey: "design.color.light", bg: "#ffffff", text: "#18181b", accent: "#6b7280" },
  { key: "gold", labelKey: "design.color.gold", bg: "#fdfaf5", text: "#3a2f1d", accent: "#b8935a" },
  { key: "rose", labelKey: "design.color.rose", bg: "#fdf6f5", text: "#3a2323", accent: "#c98f8a" },
  { key: "terracotta", labelKey: "design.color.terracotta", bg: "#fbf3ee", text: "#3a2a20", accent: "#c1694a" },
  { key: "sand", labelKey: "design.color.sand", bg: "#faf7f0", text: "#34302a", accent: "#8a8060" },
  { key: "agave", labelKey: "design.color.agave", bg: "#f5f8f5", text: "#232f23", accent: "#6b8a6b" },
  { key: "sea", labelKey: "design.color.sea", bg: "#f4f6f8", text: "#24282f", accent: "#6b7a8a" },
  { key: "dark", labelKey: "design.color.dark", bg: "#2b2b2b", text: "#f5f5f5", accent: "#9a9a9a" },
];

export function getFont(key: FontKey) {
  return FONTS.find((f) => f.key === key) || FONTS[0];
}
export function getPalette(key: ColorKey) {
  return COLOR_PALETTES.find((c) => c.key === key) || COLOR_PALETTES[0];
}

/** Style inline CSS à appliquer au conteneur racine de la galerie (couleurs + police). */
export function getDesignRootStyle(design: GalleryDesign): {
  backgroundColor: string;
  color: string;
  fontFamily: string;
} {
  const palette = getPalette(design.color);
  const font = getFont(design.font);
  return {
    backgroundColor: palette.bg,
    color: palette.text,
    fontFamily: font.stack,
  };
}

// Classes Tailwind écrites en toutes lettres (le JIT de Tailwind ne génère que les
// classes qu'il trouve littéralement dans le code source, une chaîne construite
// dynamiquement du style `grid-cols-${n}` ne fonctionnerait pas en production).
const GRID_COLS_CLASSES: Record<GridColumns, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6",
};

/** Nombre de colonnes choisi par le studio, avec un repli responsive sur petit écran. */
export function gridColsClass(columnsPerRow: GridColumns) {
  return GRID_COLS_CLASSES[columnsPerRow] || GRID_COLS_CLASSES[5];
}

export function gridGapClass(gridSpacing: GridSpacing) {
  return gridSpacing === "large" ? "gap-2 p-2" : "gap-px p-px";
}

/**
 * Grille "mosaïque" (masonry) utilisée sur la page publique de la galerie quand
 * `gridStyle === "vertical"` (le style par défaut) : chaque photo garde son ratio
 * naturel (portrait, paysage ou carré), sans jamais être recadrée — c'est la miniature
 * elle-même (voir buildThumbBuffer dans image.ts) qui n'est plus rognée en carré.
 *
 * Le layout est calculé en JS (répartition des photos colonne par colonne, dans l'ordre)
 * plutôt qu'avec la propriété CSS `columns` : `columns-N` remplit chaque colonne de haut
 * en bas AVANT de passer à la suivante, ce qui casse l'ordre de lecture gauche→droite
 * (la photo n°2 se retrouve sous la n°1 dans la même colonne, au lieu d'à côté) — une
 * répartition "round-robin" (photo i → colonne i % N) garde l'ordre naturel en haut de
 * grille, comme sur Pinterest/Pixieset.
 */
const MASONRY_BREAKPOINT_COLS: Record<GridColumns, { base: number; sm: number; md: number; lg: number }> = {
  2: { base: 1, sm: 2, md: 2, lg: 2 },
  3: { base: 2, sm: 2, md: 3, lg: 3 },
  4: { base: 2, sm: 3, md: 4, lg: 4 },
  5: { base: 2, sm: 3, md: 4, lg: 5 },
  6: { base: 2, sm: 3, md: 4, lg: 6 },
};

/**
 * Nombre de colonnes à utiliser pour la répartition round-robin, selon la largeur de
 * fenêtre actuelle (mêmes seuils que les breakpoints Tailwind sm/md/lg utilisés partout
 * ailleurs dans l'app : 640/768/1024px).
 */
export function masonryColumnCount(columnsPerRow: GridColumns, viewportWidth: number): number {
  const table = MASONRY_BREAKPOINT_COLS[columnsPerRow] || MASONRY_BREAKPOINT_COLS[5];
  if (viewportWidth >= 1024) return table.lg;
  if (viewportWidth >= 768) return table.md;
  if (viewportWidth >= 640) return table.sm;
  return table.base;
}

export function masonryGapClass(gridSpacing: GridSpacing) {
  return gridSpacing === "large" ? "gap-2 p-2" : "gap-px p-px";
}

export function masonryItemSpacingClass(gridSpacing: GridSpacing) {
  return gridSpacing === "large" ? "mb-2" : "mb-px";
}
