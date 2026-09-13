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
export type GridSpacing = "regular" | "large" | "xlarge";
export type NavigationStyle = "icon" | "iconText";
/** Nombre de colonnes affichées sur la plus grande largeur d'écran (desktop). */
export type GridColumns = 2 | 3 | 4 | 5 | 6;

/**
 * Champs ajoutés lors du chantier de refonte du panneau Réglages (12/09/2026, référence
 * Picstudio) — voir GalleryManager.tsx, onglet Présentation. Volontairement ADDITIFS : les
 * champs existants ci-dessus (coverStyle, font, color, gridStyle...) restent inchangés et
 * continuent de piloter le rendu public (src/components/gallery/GalleryView.tsx) sans aucune
 * régression pour les galeries déjà configurées — ces nouveaux champs s'y superposent plutôt
 * que de les remplacer, avec repli sur le comportement historique tant qu'ils sont absents
 * (voir resolveGalleryDesign plus bas).
 */

/** "Mode de couverture" (nouveau, distinct du style/composition existant `coverStyle`). */
export type CoverMode = "hero" | "bandeau" | "none";
export type CoverTitleScale = "sm" | "md" | "lg";
export type CoverTitleCase = "uppercase" | "normal";
/**
 * "Style d'affichage" de la grille (Picstudio) — distinct de l'existant `gridStyle`
 * (vertical/horizontal, qui continue de piloter la mosaïque actuelle). "masonry"/"grid"
 * réutilisent le rendu existant (mosaïque / grille classique) ; "editorial"/"slideshow"/
 * "contactSheet" sont capturés et sauvegardés mais retombent sur le rendu "grid" côté page
 * publique tant qu'un rendu dédié n'est pas construit (voir tâche de suivi #513/#518).
 */
export type LayoutStyle = "masonry" | "grid" | "editorial" | "slideshow" | "contactSheet";
export type SectionsNavMode = "overview" | "sectionsFirst" | "sectionsOnly";
export type SlideshowTransition = "fade" | "kenburns" | "slide";
export type VideoDisplayMode = "standard" | "cinema" | "immersive";
/** Thème de fond "Ambiance" — indépendant de l'existant `color` (palette combinée fond+texte+
 * accent). "brandLight"/"brandDark" dérivent de Studio.brandColor (voir getBackgroundTheme). */
export type BackgroundThemeKey =
  | "light"
  | "ivory"
  | "sand"
  | "powdered"
  | "dark"
  | "anthracite"
  | "espresso"
  | "olive"
  | "brandLight"
  | "brandDark";
/** "custom" = utiliser accentCustomHex ci-dessous plutôt qu'une des teintes curatées. */
export type AccentThemeKey =
  | "blue"
  | "custom"
  | "black"
  | "brown"
  | "rust"
  | "amber"
  | "burgundy"
  | "olive";

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

  // ---- Nouveaux champs "Présentation" (12/09/2026, voir commentaire plus haut) ----
  coverMode: CoverMode;
  showCoverTitle: boolean;
  coverTitleScale: CoverTitleScale;
  coverTitleCase: CoverTitleCase;
  /** URL Vimeo/YouTube/MP4 direct affichée en fond de couverture à la place de la photo. */
  coverVideoUrl: string | null;
  layoutStyle: LayoutStyle;
  sectionsNavMode: SectionsNavMode;
  slideshowTransition: SlideshowTransition;
  videoDisplayMode: VideoDisplayMode;
  backgroundTheme: BackgroundThemeKey;
  /** Non nul dans deux cas : (1) migration douce d'une galerie créée avant ce chantier (voir
   * resolveGalleryDesign, dérivé de l'ancienne palette `color`) — alors prioritaire sur
   * `backgroundTheme` pour ne rien changer au rendu déjà publié ; (2) réservé pour un futur
   * sélecteur de teinte libre côté fond, non exposé dans l'UI de cette première passe. */
  backgroundCustomHex: string | null;
  /** Couleur de texte associée à backgroundCustomHex (calculée une fois à la migration, pas
   * recalculée à chaque rendu) — null tant que backgroundCustomHex est null. */
  backgroundCustomTextHex: string | null;
  accentTheme: AccentThemeKey;
  /** Hex utilisé quand accentTheme === "custom". */
  accentCustomHex: string | null;
  /** URL directe (MP3/OGG) — pas d'iframe YouTube (autoplay bloqué par les navigateurs). */
  musicUrl: string | null;
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

  // Repli neutre : reproduit exactement le rendu historique (cover pleine largeur toujours
  // visible, grille mosaïque, thème clair, aucune vidéo/musique) pour les galeries créées
  // avant ce chantier — voir resolveGalleryDesign.
  coverMode: "hero",
  showCoverTitle: true,
  coverTitleScale: "md",
  // "normal" (pas "uppercase") : ce champ n'était jusqu'ici jamais réellement appliqué au
  // rendu (voir GalleryCover/DesignLivePreview, corrigé le 13/09/2026) — mettre "uppercase"
  // par défaut aurait changé la casse du titre de TOUTES les galeries déjà publiées dès la
  // mise en prod de ce correctif, sans que le studio n'ait rien demandé.
  coverTitleCase: "normal",
  coverVideoUrl: null,
  layoutStyle: "masonry",
  sectionsNavMode: "overview",
  slideshowTransition: "fade",
  videoDisplayMode: "standard",
  backgroundTheme: "light",
  backgroundCustomHex: null,
  backgroundCustomTextHex: null,
  accentTheme: "blue",
  accentCustomHex: null,
  musicUrl: null,
};

export const GRID_COLUMNS_OPTIONS: GridColumns[] = [2, 3, 4, 5, 6];

/** Fusionne un design partiel/potentiellement null (venant de la base) avec les valeurs par défaut. */
export function resolveGalleryDesign(design: unknown): GalleryDesign {
  if (!design || typeof design !== "object") return { ...DEFAULT_GALLERY_DESIGN };
  const raw = design as Partial<GalleryDesign>;
  const merged: GalleryDesign = { ...DEFAULT_GALLERY_DESIGN, ...raw };

  // Migration douce "Ambiance" (chantier du 12/09/2026) : une galerie créée AVANT ce chantier
  // n'a jamais eu `backgroundTheme`/`accentTheme` dans son JSON stocké — sans ce repli, elle
  // retomberait sur les défauts "light"/"blue" ci-dessus, ce qui romprait le rendu déjà publié
  // de toute galerie utilisant une autre palette `color` (ex: "dark"). On dérive donc les
  // nouveaux champs de l'ancienne palette la première fois qu'on la lit, plutôt que de
  // dépendre d'un défaut générique — uniquement quand ces clés sont absentes du JSON BRUT
  // (`raw`), jamais depuis `merged` qui les a déjà remplies par les valeurs par défaut.
  if (raw.backgroundTheme === undefined && raw.backgroundCustomHex === undefined) {
    const legacyPalette = getPalette(raw.color ?? DEFAULT_GALLERY_DESIGN.color);
    merged.backgroundCustomHex = legacyPalette.bg;
    merged.backgroundCustomTextHex = legacyPalette.text;
  }
  if (raw.accentTheme === undefined && raw.accentCustomHex === undefined) {
    const legacyPalette = getPalette(raw.color ?? DEFAULT_GALLERY_DESIGN.color);
    merged.accentTheme = "custom";
    merged.accentCustomHex = legacyPalette.accent;
  }
  return merged;
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

// ---- Nouveaux réglages "Présentation" (12/09/2026, voir commentaire en tête de fichier) ----

export const COVER_MODES: { key: CoverMode; labelKey: string }[] = [
  { key: "hero", labelKey: "design.coverMode.hero" },
  { key: "bandeau", labelKey: "design.coverMode.bandeau" },
  { key: "none", labelKey: "design.coverMode.none" },
];

export const LAYOUT_STYLES: { key: LayoutStyle; labelKey: string }[] = [
  { key: "masonry", labelKey: "design.layout.masonry" },
  { key: "grid", labelKey: "design.layout.grid" },
  { key: "editorial", labelKey: "design.layout.editorial" },
  { key: "slideshow", labelKey: "design.layout.slideshow" },
  { key: "contactSheet", labelKey: "design.layout.contactSheet" },
];

export const SECTIONS_NAV_MODES: { key: SectionsNavMode; labelKey: string; descKey: string }[] = [
  { key: "overview", labelKey: "design.sectionsNav.overview", descKey: "design.sectionsNav.overviewDesc" },
  {
    key: "sectionsFirst",
    labelKey: "design.sectionsNav.sectionsFirst",
    descKey: "design.sectionsNav.sectionsFirstDesc",
  },
  {
    key: "sectionsOnly",
    labelKey: "design.sectionsNav.sectionsOnly",
    descKey: "design.sectionsNav.sectionsOnlyDesc",
  },
];

export const SLIDESHOW_TRANSITIONS: { key: SlideshowTransition; labelKey: string }[] = [
  { key: "fade", labelKey: "design.transition.fade" },
  { key: "kenburns", labelKey: "design.transition.kenburns" },
  { key: "slide", labelKey: "design.transition.slide" },
];

export const VIDEO_DISPLAY_MODES: { key: VideoDisplayMode; labelKey: string }[] = [
  { key: "standard", labelKey: "design.videoDisplay.standard" },
  { key: "cinema", labelKey: "design.videoDisplay.cinema" },
  { key: "immersive", labelKey: "design.videoDisplay.immersive" },
];

/** "Ambiance > Le fond" — indépendant de COLOR_PALETTES (voir migration dans
 * resolveGalleryDesign). brandLight/brandDark n'ont pas de bg/text fixes : ils sont dérivés de
 * Studio.brandColor au moment du rendu, voir getBackgroundTheme. */
export const BACKGROUND_THEMES: {
  key: BackgroundThemeKey;
  labelKey: string;
  group: "light" | "dark" | "brand";
  bg: string;
  text: string;
}[] = [
  { key: "light", labelKey: "design.background.light", group: "light", bg: "#ffffff", text: "#18181b" },
  { key: "ivory", labelKey: "design.background.ivory", group: "light", bg: "#faf6ee", text: "#2b2620" },
  { key: "sand", labelKey: "design.background.sand", group: "light", bg: "#f2e9d8", text: "#332c1e" },
  { key: "powdered", labelKey: "design.background.powdered", group: "light", bg: "#f7e9e6", text: "#3a2b28" },
  { key: "dark", labelKey: "design.background.dark", group: "dark", bg: "#18181b", text: "#f5f5f5" },
  { key: "anthracite", labelKey: "design.background.anthracite", group: "dark", bg: "#26262b", text: "#f0f0f0" },
  { key: "espresso", labelKey: "design.background.espresso", group: "dark", bg: "#2a1e18", text: "#f2ece7" },
  { key: "olive", labelKey: "design.background.olive", group: "dark", bg: "#22261c", text: "#eef0e6" },
  // bg/text ci-dessous ne servent que de repli si jamais appelés sans studioBrandColorHex —
  // voir getBackgroundTheme, qui les recalcule normalement à partir de la couleur de marque.
  { key: "brandLight", labelKey: "design.background.brandLight", group: "brand", bg: "#eef2ff", text: "#1e1b4b" },
  { key: "brandDark", labelKey: "design.background.brandDark", group: "brand", bg: "#1e1b4b", text: "#eef2ff" },
];

/** "Ambiance > L'accent" — teintes curatées ; "custom" utilise `accentCustomHex` à la place. */
export const ACCENT_COLORS: { key: AccentThemeKey; labelKey: string; hex: string }[] = [
  { key: "blue", labelKey: "design.accent.blue", hex: "#4f6bf6" },
  { key: "custom", labelKey: "design.accent.custom", hex: "#9ca3af" },
  { key: "black", labelKey: "design.accent.black", hex: "#18181b" },
  { key: "brown", labelKey: "design.accent.brown", hex: "#92400e" },
  { key: "rust", labelKey: "design.accent.rust", hex: "#c2410c" },
  { key: "amber", labelKey: "design.accent.amber", hex: "#d97706" },
  { key: "burgundy", labelKey: "design.accent.burgundy", hex: "#9f1239" },
  { key: "olive", labelKey: "design.accent.olive", hex: "#65742e" },
];

function clampChannel(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Mélange `hex` avec du blanc (`ratio` > 0) ou du noir (`ratio` < 0), `ratio` dans [-1, 1] —
 * utilisé uniquement pour dériver brandLight/brandDark de Studio.brandColor (pas de dépendance
 * externe pour un calcul aussi simple). */
function tintShade(hex: string, ratio: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return hex;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const mix = ratio >= 0 ? 255 : 0;
  const amount = Math.abs(ratio);
  const nr = clampChannel(r + (mix - r) * amount);
  const ng = clampChannel(g + (mix - g) * amount);
  const nb = clampChannel(b + (mix - b) * amount);
  return `#${[nr, ng, nb].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Résout un thème de fond en {bg, text} — `studioBrandColorHex` (Studio.brandColor) permet de
 * dériver brandLight/brandDark de la couleur de marque active (voir description de
 * BackgroundThemeKey) ; sans elle, repli sur les valeurs neutres de BACKGROUND_THEMES.
 */
export function getBackgroundTheme(key: BackgroundThemeKey, studioBrandColorHex?: string | null) {
  const entry = BACKGROUND_THEMES.find((b) => b.key === key) || BACKGROUND_THEMES[0];
  if (studioBrandColorHex && key === "brandLight") {
    return { ...entry, bg: tintShade(studioBrandColorHex, 0.9), text: "#18181b" };
  }
  if (studioBrandColorHex && key === "brandDark") {
    return { ...entry, bg: tintShade(studioBrandColorHex, -0.7), text: "#f5f5f5" };
  }
  return entry;
}

export function getAccentColor(key: AccentThemeKey) {
  return ACCENT_COLORS.find((a) => a.key === key) || ACCENT_COLORS[0];
}

/** Couleur d'accent effective (boutons, sélection, liens) — résout "custom" via
 * `accentCustomHex`, avec repli sur le bleu par défaut si jamais absent. */
export function resolveAccentHex(design: GalleryDesign): string {
  if (design.accentTheme === "custom") return design.accentCustomHex || ACCENT_COLORS[0].hex;
  return getAccentColor(design.accentTheme).hex;
}

/** Style inline CSS à appliquer au conteneur racine de la galerie (couleurs + police).
 * `studioBrandColorHex` : voir getBackgroundTheme (thèmes "À votre marque"). */
export function getDesignRootStyle(
  design: GalleryDesign,
  studioBrandColorHex?: string | null
): {
  backgroundColor: string;
  color: string;
  fontFamily: string;
} {
  const font = getFont(design.font);
  if (design.backgroundCustomHex) {
    return {
      backgroundColor: design.backgroundCustomHex,
      color: design.backgroundCustomTextHex || "#18181b",
      fontFamily: font.stack,
    };
  }
  const theme = getBackgroundTheme(design.backgroundTheme, studioBrandColorHex);
  return {
    backgroundColor: theme.bg,
    color: theme.text,
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
  if (gridSpacing === "xlarge") return "gap-5 p-5";
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
  if (gridSpacing === "xlarge") return "gap-5 p-5";
  return gridSpacing === "large" ? "gap-2 p-2" : "gap-px p-px";
}

export function masonryItemSpacingClass(gridSpacing: GridSpacing) {
  if (gridSpacing === "xlarge") return "mb-5";
  return gridSpacing === "large" ? "mb-2" : "mb-px";
}
