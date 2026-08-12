"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { HeroMockup } from "@/components/marketing/HeroMockup";
import { FinalCtaVisual } from "@/components/marketing/FinalCtaVisual";
import {
  resolveTranslation,
  normalizeHeroTranslations,
  normalizeFeaturesTranslations,
  normalizeFeatureItems,
  normalizeCategoriesTranslations,
  normalizeCategoryItems,
  normalizeRichTextTranslations,
  normalizeCtaTranslations,
  type MarketingBlockDTO,
  type HeroBlockData,
  type HeroLayout,
  type FeaturesBlockData,
  type CategoriesBlockData,
  type RichTextBlockData,
  type CtaBlockData,
} from "@/lib/marketingBlocks";

/** Rend un bloc du site marketing selon son type — voir src/lib/marketingBlocks.ts pour la
 * forme de `data` attendue par type. Composant client (pas pour l'interactivité, mais pour
 * lire la langue active via useLanguage() et afficher la bonne traduction sans recharger la
 * page — tout le contenu multi-langue est déjà présent dans `data`, envoyé une seule fois
 * par le composant serveur parent). */
export function MarketingBlockRenderer({ block }: { block: MarketingBlockDTO }) {
  if (!block.active) return null;

  switch (block.type) {
    case "HERO":
      return <HeroBlock data={block.data as unknown as HeroBlockData} blockId={block.id} />;
    case "FEATURES":
      return <FeaturesBlock data={block.data as unknown as FeaturesBlockData} />;
    case "CATEGORIES":
      return <CategoriesBlock data={block.data as unknown as CategoriesBlockData} />;
    case "RICH_TEXT":
      return <RichTextBlock data={block.data as unknown as RichTextBlockData} blockId={block.id} />;
    case "CTA":
      return <CtaBlock data={block.data as unknown as CtaBlockData} />;
    default:
      return null;
  }
}

function HeroBlock({ data, blockId }: { data: HeroBlockData; blockId: string }) {
  const { locale } = useLanguage();
  const tr = resolveTranslation(normalizeHeroTranslations(data as unknown as Record<string, unknown>), locale);
  if (!tr) return null;

  // La couleur de fond doit couvrir toute la largeur de l'écran, pas seulement la colonne
  // de contenu centrée — d'où cette section externe pleine largeur (bg) + conteneur
  // interne limité (max-w) pour la mise en page du texte/visuel.
  const bgStyle = data.backgroundColor ? { backgroundColor: data.backgroundColor } : undefined;

  if (data.mediaType === "none") {
    return (
      <section style={bgStyle}>
        <div className="mx-auto max-w-3xl px-6 pb-8 pt-16 text-center">
          {tr.eyebrow && (
            <p className="text-sm font-medium uppercase tracking-widest text-brand-600">{tr.eyebrow}</p>
          )}
          <h1 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">{tr.title}</h1>
          {tr.subtitle && <p className="mt-4 text-gray-600">{tr.subtitle}</p>}
          {(tr.ctaLabel && data.ctaHref) || (tr.secondaryCtaLabel && data.secondaryCtaHref) ? (
            <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
              {tr.ctaLabel && data.ctaHref && (
                <Link href={data.ctaHref} className="btn-primary px-6 py-3 text-base">
                  {tr.ctaLabel}
                </Link>
              )}
              {tr.secondaryCtaLabel && data.secondaryCtaHref && (
                <Link href={data.secondaryCtaHref} className="btn-secondary px-6 py-3 text-base">
                  {tr.secondaryCtaLabel}
                </Link>
              )}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  const hasPhoto = data.mediaType === "photo" && !!data.imageUrl;
  const layout: HeroLayout = hasPhoto ? data.heroLayout || "split" : "split";

  // Plein écran : la photo couvre toute la section en fond, un dégradé sombre assure la
  // lisibilité du texte blanc superposé (composition inspirée de sites du secteur, sans
  // reprendre leurs textes/visuels réels — voir la photo uploadée par Adriel).
  if (hasPhoto && layout === "fullBleed") {
    return (
      <section className="relative isolate overflow-hidden" style={bgStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.imageUrl} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/80 via-black/50 to-black/10" />
        <div className="mx-auto flex min-h-[860px] max-w-6xl items-center px-6 py-24">
          {/* max-w-3xl (plus large que les autres styles) + taille de titre fixe (pas de
              palier sm:text-5xl) : les deux mis bout à bout laissent assez de place pour
              qu'un titre de longueur normale tienne sur 2 lignes sans être coupé. */}
          <div className="max-w-3xl text-left text-white">
            {tr.eyebrow && (
              <p className="text-sm font-medium uppercase tracking-widest text-white/80">{tr.eyebrow}</p>
            )}
            <h1 className="mt-4 font-serif text-4xl font-bold">{tr.title}</h1>
            {tr.subtitle && <p className="mt-6 max-w-xl text-lg text-white/85">{tr.subtitle}</p>}
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              {tr.ctaLabel && data.ctaHref && (
                <Link href={data.ctaHref} className="btn-primary px-6 py-3 text-base">
                  {tr.ctaLabel}
                </Link>
              )}
              {tr.secondaryCtaLabel && data.secondaryCtaHref && (
                <Link
                  href={data.secondaryCtaHref}
                  className="inline-flex items-center justify-center rounded-full border border-white/70 px-6 py-3 text-center text-base font-medium text-white transition hover:bg-white/10"
                >
                  {tr.secondaryCtaLabel}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Texte centré, photo en fond voilé (effet "verre dépoli") — look éditorial et doux, la
  // photo reste devinable derrière le texte sans nuire à la lisibilité.
  if (hasPhoto && layout === "centeredOverlay") {
    return (
      <section className="relative isolate overflow-hidden" style={bgStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.imageUrl} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-white/80 backdrop-blur-sm" />
        <div className="mx-auto max-w-3xl px-6 py-28 text-center">
          {tr.eyebrow && (
            <p className="text-sm font-medium uppercase tracking-widest text-brand-600">{tr.eyebrow}</p>
          )}
          <h1 className="mt-4 font-serif text-4xl font-bold sm:text-5xl">{tr.title}</h1>
          {tr.subtitle && <p className="mx-auto mt-6 max-w-xl text-lg text-gray-700">{tr.subtitle}</p>}
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            {tr.ctaLabel && data.ctaHref && (
              <Link href={data.ctaHref} className="btn-primary px-6 py-3 text-base">
                {tr.ctaLabel}
              </Link>
            )}
            {tr.secondaryCtaLabel && data.secondaryCtaHref && (
              <Link href={data.secondaryCtaHref} className="btn-secondary px-6 py-3 text-base">
                {tr.secondaryCtaLabel}
              </Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Texte + CTA centrés en haut, puis un large bandeau photo plein largeur en dessous (pas
  // de superposition) — effet vitrine, met la photo en valeur sans contrainte de lisibilité.
  if (hasPhoto && layout === "bannerBelow") {
    return (
      <section style={bgStyle}>
        <div className="mx-auto max-w-3xl px-6 pb-10 pt-20 text-center">
          {tr.eyebrow && (
            <p className="text-sm font-medium uppercase tracking-widest text-brand-600">{tr.eyebrow}</p>
          )}
          <h1 className="mt-4 font-serif text-4xl font-bold sm:text-5xl">{tr.title}</h1>
          {tr.subtitle && <p className="mx-auto mt-6 max-w-xl text-lg text-gray-600">{tr.subtitle}</p>}
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            {tr.ctaLabel && data.ctaHref && (
              <Link href={data.ctaHref} className="btn-primary px-6 py-3 text-base">
                {tr.ctaLabel}
              </Link>
            )}
            {tr.secondaryCtaLabel && data.secondaryCtaHref && (
              <Link href={data.secondaryCtaHref} className="btn-secondary px-6 py-3 text-base">
                {tr.secondaryCtaLabel}
              </Link>
            )}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.imageUrl} alt="" className="aspect-[21/9] w-full object-cover sm:aspect-[3/1]" />
      </section>
    );
  }

  // "split" (historique) et "tiltedCard" partagent la même grille 2 colonnes — seule la
  // carte photo change (flottement + légère inclinaison, réutilise .hero-float).
  return (
    <section style={bgStyle}>
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-24 lg:grid-cols-2">
        <div className="text-center lg:text-left">
          {tr.eyebrow && (
            <p className="text-sm font-medium uppercase tracking-widest text-brand-600">{tr.eyebrow}</p>
          )}
          <h1 className="mt-4 font-serif text-4xl font-bold sm:text-5xl">{tr.title}</h1>
          {tr.subtitle && (
            <p className="mx-auto mt-6 max-w-xl text-lg text-gray-600 lg:mx-0">{tr.subtitle}</p>
          )}
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
            {tr.ctaLabel && data.ctaHref && (
              <Link href={data.ctaHref} className="btn-primary px-6 py-3 text-base">
                {tr.ctaLabel}
              </Link>
            )}
            {tr.secondaryCtaLabel && data.secondaryCtaHref && (
              <Link href={data.secondaryCtaHref} className="btn-secondary px-6 py-3 text-base">
                {tr.secondaryCtaLabel}
              </Link>
            )}
          </div>
        </div>
        {hasPhoto ? (
          <div className={layout === "tiltedCard" ? "hero-float" : undefined}>
            <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
            </div>
          </div>
        ) : data.mediaType === "video" && data.videoUrl ? (
          <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-2xl">
            <video
              src={data.videoUrl}
              autoPlay
              loop
              muted
              playsInline
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
        ) : (
          <HeroMockup key={blockId} />
        )}
      </div>
    </section>
  );
}

function FeaturesBlock({ data }: { data: FeaturesBlockData }) {
  const { locale } = useLanguage();
  const tr = resolveTranslation(normalizeFeaturesTranslations(data as unknown as Record<string, unknown>), locale);
  const items = normalizeFeatureItems(data.items);
  if (!tr) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 pb-24 pt-16">
      <div className="mx-auto max-w-2xl text-center">
        {tr.eyebrow && (
          <p className="text-sm font-medium uppercase tracking-widest text-brand-600">{tr.eyebrow}</p>
        )}
        <h2 className="mt-3 font-serif text-3xl font-bold">{tr.title}</h2>
        {tr.subtitle && <p className="mt-4 text-gray-600">{tr.subtitle}</p>}
      </div>
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((f) => {
          const itemTr = resolveTranslation(f.translations, locale);
          if (!itemTr) return null;
          return (
            <div key={f.id} className="card overflow-hidden">
              {f.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.imageUrl}
                  alt=""
                  className="-mx-6 -mt-6 mb-4 aspect-[4/3] w-[calc(100%+3rem)] object-cover"
                />
              )}
              <h3 className="font-semibold">{itemTr.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{itemTr.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CategoriesBlock({ data }: { data: CategoriesBlockData }) {
  const { locale } = useLanguage();
  const tr = resolveTranslation(normalizeCategoriesTranslations(data as unknown as Record<string, unknown>), locale);
  const items = normalizeCategoryItems(data.items);
  if (!tr) return null;

  return (
    <section className="border-t border-gray-100 bg-gray-50 px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        {tr.eyebrow && (
          <p className="text-sm font-medium uppercase tracking-widest text-brand-600">{tr.eyebrow}</p>
        )}
        <h2 className="mt-3 font-serif text-3xl font-bold">{tr.title}</h2>
        {tr.subtitle && <p className="mt-4 text-gray-600">{tr.subtitle}</p>}
      </div>
      <div className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-3">
        {items.map((cat) => {
          const itemTr = resolveTranslation(cat.translations, locale);
          if (!itemTr) return null;
          return (
            <span
              key={cat.id}
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-2 pl-2 pr-4 text-sm text-gray-700"
            >
              {cat.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cat.imageUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : null}
              {itemTr.label}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function RichTextBlock({ data, blockId }: { data: RichTextBlockData; blockId: string }) {
  const { locale } = useLanguage();
  const tr = resolveTranslation(normalizeRichTextTranslations(data as unknown as Record<string, unknown>), locale);
  if (!tr) return null;
  const paragraphs = (tr.body || "").split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const hasImage = data.imagePosition && data.imagePosition !== "none" && data.imageUrl;

  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      {tr.eyebrow && (
        <p className="text-sm font-medium uppercase tracking-widest text-brand-600">{tr.eyebrow}</p>
      )}
      {tr.title && <h2 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">{tr.title}</h2>}
      {/* La photo flotte à gauche/droite (float) plutôt qu'une colonne de grille figée : le
          texte s'enroule autour tant que l'image est présente, puis continue en pleine
          largeur une fois l'image dépassée — au lieu de rester coincé dans une demi-colonne
          vide en bas. `overflow-hidden` sert de clearfix (contient le float dans la section,
          même si l'image est plus haute que le texte). */}
      <div className="mt-8 overflow-hidden">
        {hasImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.imageUrl}
            alt=""
            className={`mb-6 aspect-[4/5] w-full max-w-xs rounded-2xl object-cover sm:w-2/5 ${
              data.imagePosition === "right" ? "sm:float-right sm:ml-8" : "sm:float-left sm:mr-8"
            }`}
            key={blockId}
          />
        )}
        <div className="space-y-6 text-gray-700">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBlock({ data }: { data: CtaBlockData }) {
  const { locale } = useLanguage();
  const tr = resolveTranslation(normalizeCtaTranslations(data as unknown as Record<string, unknown>), locale);
  if (!tr) return null;

  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-24 lg:grid-cols-2">
      <div className="text-center lg:order-2 lg:text-left">
        <h2 className="font-serif text-3xl font-bold">{tr.title}</h2>
        {tr.subtitle && <p className="mt-3 text-gray-600">{tr.subtitle}</p>}
        {tr.ctaLabel && data.ctaHref && (
          <div className="mt-8">
            <Link href={data.ctaHref} className="btn-primary px-6 py-3 text-base">
              {tr.ctaLabel}
            </Link>
          </div>
        )}
      </div>
      {data.imageUrl ? (
        <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-2xl lg:order-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
        </div>
      ) : data.showVisual !== false ? (
        <div className="lg:order-1">
          <FinalCtaVisual />
        </div>
      ) : null}
    </section>
  );
}
