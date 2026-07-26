/**
 * Types partagés entre le rendu public (MarketingBlockRenderer) et le formulaire d'édition
 * (/admin/site) — la forme exacte de `MarketingBlock.data` selon `type`. Voir le modèle
 * Prisma MarketingBlock pour le contexte général.
 *
 * ===================== Contenu traduisible (multi-langue) =====================
 * Chaque bloc peut être affiché dans les 6 langues de la plateforme (voir
 * src/lib/i18n/locales.ts). Le texte de chaque bloc est donc stocké sous une clé
 * `translations` : `Partial<Record<Locale, TQqqq>>`, une entrée par langue renseignée. Les
 * champs non textuels (image, vidéo, lien, couleur de fond...) restent au niveau racine de
 * `data`, car ils ne changent pas selon la langue.
 *
 * Compatibilité : les blocs créés avant l'introduction du multi-langue stockaient leurs
 * champs texte à plat, directement dans `data` (ex: `data.title`), sans `translations`.
 * Toutes les fonctions `normalize*` de ce fichier détectent cette ancienne forme et la
 * traitent comme la traduction française — aucune migration de données n'est nécessaire,
 * le contenu existant reste visible tel quel en attendant qu'Adriel ajoute les autres
 * langues depuis /admin/site.
 */

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

export type MarketingBlockType = "HERO" | "FEATURES" | "CATEGORIES" | "RICH_TEXT" | "CTA";
export type MarketingPageKey = "HOME" | "EXEMPLES" | "TARIFS" | "A_PROPOS";

export interface MarketingBlockDTO {
  id: string;
  page: MarketingPageKey;
  type: MarketingBlockType;
  position: number;
  active: boolean;
  data: Record<string, unknown>;
}

export type Translations<T> = Partial<Record<Locale, T>>;

/** Résout la traduction à afficher pour une langue donnée : la langue demandée, sinon le
 * français (langue de référence du site), sinon la première traduction disponible. */
export function resolveTranslation<T>(translations: Translations<T> | undefined, locale: Locale): T | undefined {
  if (!translations) return undefined;
  return translations[locale] ?? translations[DEFAULT_LOCALE] ?? Object.values(translations)[0];
}

/** Construit une `translations` map à partir de `data` : si `data.translations` existe déjà
 * (nouveau format), on la renvoie telle quelle ; sinon on reconstitue une traduction "fr"
 * unique à partir des champs à plat de l'ancien format. */
function normalizeTranslations<T extends object>(
  data: Record<string, unknown>,
  keys: (keyof T)[]
): Translations<T> {
  const existing = data.translations as Translations<T> | undefined;
  if (existing && typeof existing === "object") return existing;
  const fr = {} as T;
  let hasAny = false;
  for (const key of keys) {
    const value = data[key as string];
    if (value !== undefined) {
      (fr as Record<string, unknown>)[key as string] = value;
      hasAny = true;
    }
  }
  return hasAny ? ({ [DEFAULT_LOCALE]: fr } as Translations<T>) : {};
}

// ----------------------------------------------------------------------------------- HERO

export interface HeroTranslation {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  secondaryCtaLabel?: string;
}

/** Les 5 styles de mise en page disponibles quand `mediaType === "photo"` — toutes
 * réutilisent la même image uploadée (`imageUrl`), seule la composition change :
 * - "split" : texte à gauche, photo dans une carte à droite (mise en page d'origine).
 * - "fullBleed" : photo plein écran en fond, dégradé sombre, texte blanc superposé
 *   (composition à la Pixieset — fond photo immersif).
 * - "tiltedCard" : identique à "split" mais la carte photo flotte légèrement inclinée
 *   (réutilise l'animation .hero-float déjà utilisée par le mockup).
 * - "centeredOverlay" : texte centré, photo en fond avec un voile clair (frosted glass) —
 *   look éditorial/doux, la photo reste visible mais atténuée.
 * - "bannerBelow" : texte + CTA centrés en haut, puis un large bandeau photo plein largeur
 *   juste en dessous (pas de superposition), effet vitrine.
 */
export const HERO_LAYOUTS = ["split", "fullBleed", "tiltedCard", "centeredOverlay", "bannerBelow"] as const;
export type HeroLayout = (typeof HERO_LAYOUTS)[number];

export const HERO_LAYOUT_LABELS: Record<HeroLayout, string> = {
  split: "Côte à côte (texte / photo en carte)",
  fullBleed: "Plein écran (photo en fond, texte superposé)",
  tiltedCard: "Carte flottante inclinée",
  centeredOverlay: "Texte centré, photo en fond voilé",
  bannerBelow: "Bandeau photo plein largeur sous le texte",
};

export interface HeroBlockData {
  translations: Translations<HeroTranslation>;
  ctaHref?: string;
  secondaryCtaHref?: string;
  /** "mockup" = notre visuel CSS (par défaut, aucun média requis). "none" = pas de visuel
   * du tout, texte seul centré sur une colonne — pratique pour un simple en-tête de page
   * (Exemples, Tarifs) plutôt qu'un grand hero avec image. */
  mediaType: "mockup" | "photo" | "video" | "none";
  imageUrl?: string;
  videoUrl?: string;
  /** Couleur de fond (hex), appliquée sur toute la largeur de l'écran (pas seulement la
   * zone de contenu centrée) — laisser vide pour un fond transparent/par défaut. */
  backgroundColor?: string;
  /** Style de composition quand mediaType === "photo" — voir HERO_LAYOUTS. Absent/undefined
   * = "split" (comportement historique, avant l'ajout de ce choix). */
  heroLayout?: HeroLayout;
}

export function normalizeHeroTranslations(data: Record<string, unknown>): Translations<HeroTranslation> {
  return normalizeTranslations<HeroTranslation>(data, ["eyebrow", "title", "subtitle", "ctaLabel", "secondaryCtaLabel"]);
}

/** Vrai si le tout premier bloc affiché sur la page est un Hero en style "Plein écran"
 * (photo pleine largeur en fond, texte blanc superposé) — dans ce cas MarketingHeader doit
 * se superposer en transparence sur la photo (comme sur pixieset.com) plutôt que d'occuper
 * une bande blanche séparée au-dessus. Voir MarketingHeader `transparent` + les 4 pages
 * marketing qui appellent cette fonction juste après avoir chargé leurs blocs. */
export function firstBlockIsFullBleedHero(blocks: MarketingBlockDTO[]): boolean {
  const first = blocks[0];
  if (!first || first.type !== "HERO" || !first.active) return false;
  const d = first.data as { mediaType?: string; heroLayout?: string };
  return d.mediaType === "photo" && d.heroLayout === "fullBleed";
}

// ------------------------------------------------------------------------------- FEATURES

export interface FeatureItemTranslation {
  title: string;
  desc: string;
}

export interface FeatureItem {
  /** Identifiant stable généré côté client (crypto.randomUUID) — sert d'emplacement de
   * stockage pour l'image de la carte (indépendant de sa position dans la liste, pour ne
   * pas mélanger les images si on supprime/réordonne des fonctionnalités). Absent sur les
   * anciennes données créées avant l'ajout de l'image — toujours normaliser via
   * normalizeFeatureItems() avant affichage/édition. */
  id?: string;
  imageUrl?: string;
  translations?: Translations<FeatureItemTranslation>;
  /** Anciens champs à plat (avant multi-langue) — repris comme traduction "fr" par
   * normalizeFeatureItems(), ne pas lire directement. */
  title?: string;
  desc?: string;
}

export interface NormalizedFeatureItem {
  id: string;
  imageUrl?: string;
  translations: Translations<FeatureItemTranslation>;
}

export interface FeaturesBlockData {
  translations: Translations<{ eyebrow?: string; title: string; subtitle?: string }>;
  items: FeatureItem[];
}

/** Normalise `FeaturesBlockData.items` : garantit un `id` stable et une `translations` map
 * (reconstituée depuis les anciens champs `title`/`desc` à plat si besoin). */
export function normalizeFeatureItems(items: FeatureItem[] | undefined): NormalizedFeatureItem[] {
  return (items || []).map((item, i) => ({
    id: item.id || `legacy-${i}`,
    imageUrl: item.imageUrl,
    translations:
      item.translations && Object.keys(item.translations).length
        ? item.translations
        : item.title
        ? { [DEFAULT_LOCALE]: { title: item.title, desc: item.desc || "" } }
        : {},
  }));
}

export function normalizeFeaturesTranslations(
  data: Record<string, unknown>
): Translations<{ eyebrow?: string; title: string; subtitle?: string }> {
  return normalizeTranslations(data, ["eyebrow", "title", "subtitle"]);
}

// ----------------------------------------------------------------------------- CATEGORIES

export interface CategoryItem {
  /** Identifiant stable généré côté client (crypto.randomUUID) — sert d'emplacement de
   * stockage pour l'image de la pastille (indépendant de sa position dans la liste, pour
   * ne pas mélanger les images si on supprime/réordonne des pastilles). */
  id: string;
  imageUrl?: string;
  translations?: Translations<{ label: string }>;
  /** Ancien champ à plat (avant multi-langue), ou chaîne brute historique — repris comme
   * traduction "fr" par normalizeCategoryItems(), ne pas lire directement. */
  label?: string;
}

export interface NormalizedCategoryItem {
  id: string;
  imageUrl?: string;
  translations: Translations<{ label: string }>;
}

export interface CategoriesBlockData {
  translations: Translations<{ eyebrow?: string; title: string; subtitle?: string }>;
  /** Anciennes données : simples chaînes (pastilles texte seul, avant même l'image et le
   * multi-langue). Toujours normaliser via normalizeCategoryItems() avant affichage/édition,
   * ne pas lire `items` directement. */
  items: (string | CategoryItem)[];
}

/** Normalise `CategoriesBlockData.items` (chaînes historiques, objets à plat, OU objets
 * multi-langue) vers la forme uniforme, pour l'affichage public comme pour le formulaire
 * admin. */
export function normalizeCategoryItems(items: (string | CategoryItem)[] | undefined): NormalizedCategoryItem[] {
  return (items || []).map((item, i) => {
    if (typeof item === "string") {
      return { id: `legacy-${i}`, translations: { [DEFAULT_LOCALE]: { label: item } } };
    }
    const translations =
      item.translations && Object.keys(item.translations).length
        ? item.translations
        : item.label
        ? { [DEFAULT_LOCALE]: { label: item.label } }
        : {};
    return { id: item.id || `legacy-${i}`, imageUrl: item.imageUrl, translations };
  });
}

export function normalizeCategoriesTranslations(
  data: Record<string, unknown>
): Translations<{ eyebrow?: string; title: string; subtitle?: string }> {
  return normalizeTranslations(data, ["eyebrow", "title", "subtitle"]);
}

// ----------------------------------------------------------------------------- RICH_TEXT

export interface RichTextTranslation {
  eyebrow?: string;
  title?: string;
  /** Paragraphes séparés par une ligne vide. */
  body: string;
}

export interface RichTextBlockData {
  translations: Translations<RichTextTranslation>;
  imageUrl?: string;
  imagePosition?: "left" | "right" | "none";
}

export function normalizeRichTextTranslations(data: Record<string, unknown>): Translations<RichTextTranslation> {
  return normalizeTranslations<RichTextTranslation>(data, ["eyebrow", "title", "body"]);
}

// ----------------------------------------------------------------------------------- CTA

export interface CtaTranslation {
  title: string;
  subtitle?: string;
  ctaLabel?: string;
}

export interface CtaBlockData {
  translations: Translations<CtaTranslation>;
  ctaHref?: string;
  /** Si renseignée, une vraie photo uploadée remplace le visuel CSS (facture/boutique). */
  imageUrl?: string;
  /** N'a d'effet que si `imageUrl` est vide : affiche (ou non) le visuel CSS par défaut. */
  showVisual?: boolean;
}

export function normalizeCtaTranslations(data: Record<string, unknown>): Translations<CtaTranslation> {
  return normalizeTranslations<CtaTranslation>(data, ["title", "subtitle", "ctaLabel"]);
}

// --------------------------------------------------------------------------------- LABELS

export const MARKETING_BLOCK_LABELS: Record<MarketingBlockType, string> = {
  HERO: "En-tête (hero)",
  FEATURES: "Grille de fonctionnalités",
  CATEGORIES: "Liste de catégories (pastilles)",
  RICH_TEXT: "Texte libre",
  CTA: "Appel à l'action",
};

export const MARKETING_PAGE_LABELS: Record<MarketingPageKey, string> = {
  HOME: "Accueil",
  EXEMPLES: "Exemples",
  TARIFS: "Tarifs",
  A_PROPOS: "À propos",
};
