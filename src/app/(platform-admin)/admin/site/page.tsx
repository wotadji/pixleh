"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PageSpinner } from "@/components/ui/Spinner";
import { ImageCropModal } from "@/components/admin/ImageCropModal";
import { LOCALES, LOCALE_LABELS, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import {
  MARKETING_BLOCK_LABELS,
  MARKETING_PAGE_LABELS,
  HERO_LAYOUTS,
  HERO_LAYOUT_LABELS,
  normalizeCategoryItems,
  normalizeFeatureItems,
  normalizeHeroTranslations,
  normalizeFeaturesTranslations,
  normalizeCategoriesTranslations,
  normalizeRichTextTranslations,
  normalizeCtaTranslations,
  resolveTranslation,
  type NormalizedCategoryItem,
  type NormalizedFeatureItem,
  type Translations,
  type MarketingBlockDTO,
  type MarketingBlockType,
  type MarketingPageKey,
  type HeroLayout,
} from "@/lib/marketingBlocks";

/** Superset des champs texte traduisibles, tous types de blocs confondus — chaque type ne
 * lit/écrit que le sous-ensemble qui le concerne (voir buildData). Simplifie le formulaire :
 * une seule structure de traduction à manipuler quel que soit le type de bloc édité. */
interface TranslationFields {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  secondaryCtaLabel?: string;
  body?: string;
}

/** crypto.randomUUID n'existe que dans un contexte sécurisé (HTTPS ou localhost) — sur un
 * environnement HTTP comme l'UAT tant qu'aucun certificat SSL n'est configuré, l'appel
 * planterait ("crypto.randomUUID is not a function"). On retombe sur un id "assez unique"
 * généré à la main dans ce cas. */
function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function newCategoryItem(): NormalizedCategoryItem {
  return { id: makeId(), translations: {} };
}

function newFeatureItem(): NormalizedFeatureItem {
  return { id: makeId(), translations: {} };
}

const PAGES: MarketingPageKey[] = ["HOME", "EXEMPLES", "TARIFS", "A_PROPOS"];
const BLOCK_TYPES: MarketingBlockType[] = ["HERO", "FEATURES", "CATEGORIES", "RICH_TEXT", "CTA"];

/** Clés de traduction des libellés de type de bloc / page — MARKETING_BLOCK_LABELS et
 * MARKETING_PAGE_LABELS (src/lib/marketingBlocks.ts) sont en français en dur, utilisés
 * ailleurs (aperçus non traduits) ; ici on les traduit via t() pour le chantier "tout
 * traduire" du panel admin (demande d'Adriel, 02/08/2026). */
const BLOCK_LABEL_KEYS: Record<MarketingBlockType, string> = {
  HERO: "admin.site.blockHero",
  FEATURES: "admin.site.blockFeatures",
  CATEGORIES: "admin.site.blockCategories",
  RICH_TEXT: "admin.site.blockRichText",
  CTA: "admin.site.blockCta",
};

const PAGE_LABEL_KEYS: Record<MarketingPageKey, string> = {
  HOME: "admin.site.pageHome",
  EXEMPLES: "admin.site.pageExemples",
  TARIFS: "admin.site.pageTarifs",
  A_PROPOS: "admin.site.pageAPropos",
};

interface BlockFormState {
  id?: string;
  type: MarketingBlockType;
  active: boolean;
  /** Langue actuellement affichée/éditée dans le formulaire — n'affecte que l'UI d'édition,
   * toutes les langues renseignées sont sauvegardées ensemble dans `translations`. */
  activeLocale: Locale;
  translations: Translations<TranslationFields>;
  ctaHref: string;
  secondaryCtaHref: string;
  mediaType: "mockup" | "photo" | "video" | "none";
  imageUrl: string;
  videoUrl: string;
  backgroundColor: string;
  /** Style de composition du Hero quand mediaType === "photo" — voir HERO_LAYOUTS. */
  heroLayout: HeroLayout;
  featureItems: NormalizedFeatureItem[];
  categoryItems: NormalizedCategoryItem[];
  imagePosition: "left" | "right" | "none";
  showVisual: boolean;
  /** Uniquement pertinent pour un bloc de la page Accueil : si coché, ce bloc est aussi
   * affiché à la suite du contenu d'Exemples, Tarifs et À propos (voir getPageBlocks). */
  sharedAcrossPages: boolean;
  /** Uniquement pertinent si sharedAcrossPages est coché : affiche ce bloc avant ("before")
   * ou après ("after", par défaut) le contenu propre des pages Exemples/Tarifs/À propos. */
  sharedPosition: "before" | "after";
}

function emptyForm(type: MarketingBlockType): BlockFormState {
  return {
    type,
    active: true,
    activeLocale: DEFAULT_LOCALE,
    translations: {},
    ctaHref: "",
    secondaryCtaHref: "",
    mediaType: "none",
    imageUrl: "",
    videoUrl: "",
    backgroundColor: "",
    heroLayout: "split",
    featureItems: type === "FEATURES" ? [newFeatureItem()] : [],
    categoryItems: type === "CATEGORIES" ? [newCategoryItem()] : [],
    imagePosition: "none",
    showVisual: true,
    sharedAcrossPages: false,
    sharedPosition: "after",
  };
}

function formFromBlock(block: MarketingBlockDTO): BlockFormState {
  const d = block.data as any;
  let translations: Translations<TranslationFields> = {};
  switch (block.type) {
    case "HERO":
      translations = normalizeHeroTranslations(d);
      break;
    case "FEATURES":
      translations = normalizeFeaturesTranslations(d);
      break;
    case "CATEGORIES":
      translations = normalizeCategoriesTranslations(d);
      break;
    case "RICH_TEXT":
      translations = normalizeRichTextTranslations(d);
      break;
    case "CTA":
      translations = normalizeCtaTranslations(d);
      break;
  }
  const featureItems = normalizeFeatureItems(d.items);
  const categoryItems = normalizeCategoryItems(d.items);
  return {
    id: block.id,
    type: block.type,
    active: block.active,
    activeLocale: DEFAULT_LOCALE,
    translations,
    ctaHref: d.ctaHref || "",
    secondaryCtaHref: d.secondaryCtaHref || "",
    mediaType: d.mediaType || "none",
    imageUrl: d.imageUrl || "",
    videoUrl: d.videoUrl || "",
    backgroundColor: d.backgroundColor || "",
    heroLayout: (HERO_LAYOUTS as readonly string[]).includes(d.heroLayout) ? d.heroLayout : "split",
    featureItems: block.type === "FEATURES" ? (featureItems.length ? featureItems : [newFeatureItem()]) : [newFeatureItem()],
    categoryItems: block.type === "CATEGORIES" ? (categoryItems.length ? categoryItems : [newCategoryItem()]) : [newCategoryItem()],
    imagePosition: d.imagePosition || "none",
    showVisual: d.showVisual !== false,
    sharedAcrossPages: d.sharedAcrossPages === true,
    sharedPosition: d.sharedPosition === "before" ? "before" : "after",
  };
}

function buildData(form: BlockFormState): Record<string, unknown> {
  const base = buildTypeData(form);
  return {
    ...base,
    sharedAcrossPages: form.sharedAcrossPages || undefined,
    sharedPosition: form.sharedAcrossPages ? form.sharedPosition : undefined,
  };
}

function buildTypeData(form: BlockFormState): Record<string, unknown> {
  switch (form.type) {
    case "HERO":
      return {
        translations: form.translations,
        ctaHref: form.ctaHref || undefined,
        secondaryCtaHref: form.secondaryCtaHref || undefined,
        mediaType: form.mediaType,
        imageUrl: form.imageUrl || undefined,
        videoUrl: form.videoUrl || undefined,
        backgroundColor: form.backgroundColor || undefined,
        heroLayout: form.mediaType === "photo" ? form.heroLayout : undefined,
      };
    case "FEATURES":
      return {
        translations: form.translations,
        items: form.featureItems.filter((f) => Object.values(f.translations).some((t) => t?.title?.trim())),
      };
    case "CATEGORIES":
      return {
        translations: form.translations,
        items: form.categoryItems.filter((c) => Object.values(c.translations).some((t) => t?.label?.trim())),
      };
    case "RICH_TEXT":
      return {
        translations: form.translations,
        imagePosition: form.imagePosition,
        imageUrl: form.imageUrl || undefined,
      };
    case "CTA":
      return {
        translations: form.translations,
        ctaHref: form.ctaHref || undefined,
        imageUrl: form.imageUrl || undefined,
        showVisual: form.showVisual,
      };
  }
}

function blockPreview(block: MarketingBlockDTO): string {
  const d = block.data as any;
  const translations = (d.translations || {}) as Translations<TranslationFields>;
  const fr = resolveTranslation(translations, DEFAULT_LOCALE);
  return fr?.title || fr?.eyebrow || d.title || d.eyebrow || "(sans titre)";
}

// Icônes sur les boutons Modifier/Supprimer de chaque bloc — demande d'Adriel, 12/08/2026
// ("et avec des icones"), suite à l'empilement mobile de ces deux boutons.
function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20h9" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16" strokeLinecap="round" />
      <path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" strokeLinejoin="round" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" strokeLinejoin="round" />
      <path d="M10 11v7M14 11v7" strokeLinecap="round" />
    </svg>
  );
}

export default function AdminSitePage() {
  const [activePage, setActivePage] = useState<MarketingPageKey>("HOME");
  const [blocks, setBlocks] = useState<MarketingBlockDTO[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pickingType, setPickingType] = useState(false);
  const [form, setForm] = useState<BlockFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();

  async function load(page: MarketingPageKey) {
    setBlocks(null);
    const res = await fetch(`/api/admin/marketing-blocks?page=${page}`);
    if (res.ok) {
      const data = await res.json();
      setBlocks(data.blocks);
    }
  }

  useEffect(() => {
    load(activePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  function openAddPicker() {
    setError(null);
    setPickingType(true);
    setForm(null);
    setModalOpen(true);
  }

  function chooseType(type: MarketingBlockType) {
    setPickingType(false);
    setForm(emptyForm(type));
  }

  function openEdit(block: MarketingBlockDTO) {
    setError(null);
    setPickingType(false);
    setForm(formFromBlock(block));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setPickingType(false);
    setForm(null);
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    const data = buildData(form);
    try {
      const res = await fetch(
        form.id ? `/api/admin/marketing-blocks/${form.id}` : "/api/admin/marketing-blocks",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            form.id
              ? { active: form.active, data }
              : { page: activePage, type: form.type, active: form.active, data }
          ),
        }
      );
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(resData?.error?.formErrors?.[0] || resData?.error || t("admin.site.errorSave"));
        setSaving(false);
        return;
      }
      // Pour un nouveau bloc, on repasse en mode édition (même modal) pour permettre
      // l'upload d'image/la définition de la vidéo, qui nécessitent un id existant.
      if (!form.id) {
        const activeLocale = form.activeLocale;
        setForm({ ...formFromBlock(resData.block), activeLocale });
      }
      await load(activePage);
    } catch {
      setError(t("admin.site.errorNetwork"));
    }
    setSaving(false);
  }

  async function remove(block: MarketingBlockDTO) {
    if (!confirm(t("admin.site.confirmDeleteBlock"))) return;
    const res = await fetch(`/api/admin/marketing-blocks/${block.id}`, { method: "DELETE" });
    if (res.ok) await load(activePage);
  }

  async function move(block: MarketingBlockDTO, direction: "up" | "down") {
    const res = await fetch(`/api/admin/marketing-blocks/${block.id}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    if (res.ok) await load(activePage);
  }

  /** Upload générique pour un bloc — `slot` distingue plusieurs images au sein d'un même
   * bloc ("main" pour l'image principale, "item-<id>" pour l'image d'une pastille de
   * catégorie). Retourne l'URL en cas de succès, sinon null (et pose `error`). */
  async function uploadBlockImage(file: File | Blob, slot: string): Promise<string | null> {
    if (!form?.id) return null;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file, "image.jpg");
    const res = await fetch(
      `/api/admin/marketing-blocks/${form.id}/image?slot=${encodeURIComponent(slot)}`,
      { method: "POST", body: fd }
    );
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setError(data?.error || t("admin.site.errorUploadImage"));
      return null;
    }
    return data.imageUrl as string;
  }

  async function uploadMainImage(file: File | Blob) {
    const url = await uploadBlockImage(file, "main");
    if (url && form) setForm({ ...form, imageUrl: url });
  }

  async function uploadCategoryItemImage(itemId: string, file: File | Blob) {
    const url = await uploadBlockImage(file, `item-${itemId}`);
    if (url && form) {
      const items = form.categoryItems.map((it) => (it.id === itemId ? { ...it, imageUrl: url } : it));
      setForm({ ...form, categoryItems: items });
    }
  }

  async function uploadFeatureItemImage(itemId: string, file: File | Blob) {
    const url = await uploadBlockImage(file, `feature-${itemId}`);
    if (url && form) {
      const items = form.featureItems.map((it) => (it.id === itemId ? { ...it, imageUrl: url } : it));
      setForm({ ...form, featureItems: items });
    }
  }

  if (!blocks) {
    return (
      <div>
        <PageTabs activePage={activePage} onChange={setActivePage} />
        <PageSpinner />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold">{t("admin.site.title")}</h1>
        <button type="button" className="btn-primary" onClick={openAddPicker}>
          {t("admin.site.addBlock")}
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-500">{t("admin.site.subtitle")}</p>

      <PageTabs activePage={activePage} onChange={setActivePage} />

      <div className="mt-6 space-y-3">
        {blocks.length === 0 && <p className="text-sm text-gray-500">{t("admin.site.emptyBlocks")}</p>}
        {blocks.map((block, i) => (
          <div
            key={block.id}
            className={`card flex items-center justify-between gap-4 ${!block.active ? "opacity-50" : ""}`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">
                  {t(BLOCK_LABEL_KEYS[block.type])}
                </span>
                {!block.active && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {t("admin.site.hiddenBadge")}
                  </span>
                )}
                {(block.data as any)?.sharedAcrossPages === true && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                    {t("admin.site.sharedBadgePrefix")} (
                    {(block.data as any)?.sharedPosition === "before"
                      ? t("admin.site.sharedBefore")
                      : t("admin.site.sharedAfter")}
                    )
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-medium text-gray-900">{blockPreview(block)}</p>
            </div>
            {/* Supprimer sous Modifier en mobile (au lieu de côte à côte, trop compressé avec
                les flèches de tri) — demande d'Adriel, 12/08/2026 : "mettre le boutton
                supprimé en dessous du bouton modifier". À partir de sm, retour à la ligne
                unique d'origine. */}
            <div className="flex shrink-0 items-start gap-1 sm:items-center">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => move(block, "up")}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                  aria-label={t("admin.site.moveUp")}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === blocks.length - 1}
                  onClick={() => move(block, "down")}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                  aria-label={t("admin.site.moveDown")}
                >
                  ↓
                </button>
              </div>
              <div className="ml-2 flex flex-col items-stretch gap-1 sm:flex-row sm:items-center">
                <button
                  type="button"
                  className="btn-secondary flex items-center justify-center gap-1.5 text-sm"
                  onClick={() => openEdit(block)}
                >
                  <IconEdit />
                  {t("admin.site.edit")}
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  onClick={() => remove(block)}
                >
                  <IconTrash />
                  {t("admin.site.delete")}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={pickingType ? t("admin.site.modalTypeTitle") : form?.id ? t("admin.site.modalEditTitle") : t("admin.site.modalNewTitle")}
        widthClassName="max-w-2xl"
        footer={
          pickingType ? undefined : (
            <>
              <button type="button" className="btn-secondary text-sm" onClick={closeModal}>
                {t("admin.site.close")}
              </button>
              <button type="button" className="btn-primary text-sm" disabled={saving} onClick={save}>
                {saving ? t("admin.site.saving") : t("admin.site.save")}
              </button>
            </>
          )
        }
      >
        {pickingType && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {BLOCK_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => chooseType(type)}
                className="rounded-lg border border-gray-200 px-4 py-3 text-left text-sm hover:border-brand-600 hover:bg-brand-50"
              >
                {t(BLOCK_LABEL_KEYS[type])}
              </button>
            ))}
          </div>
        )}

        {!pickingType && form && (
          <BlockForm
            form={form}
            setForm={setForm}
            uploading={uploading}
            onUploadImage={uploadMainImage}
            onUploadCategoryItemImage={uploadCategoryItemImage}
            onUploadFeatureItemImage={uploadFeatureItemImage}
            page={activePage}
          />
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Modal>
    </div>
  );
}

function PageTabs({
  activePage,
  onChange,
}: {
  activePage: MarketingPageKey;
  onChange: (p: MarketingPageKey) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="mt-6 flex gap-2 border-b border-gray-200">
      {PAGES.map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => onChange(page)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            activePage === page
              ? "border-brand-600 font-medium text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          {t(PAGE_LABEL_KEYS[page])}
        </button>
      ))}
    </div>
  );
}

/** Bandeau d'onglets de langue — sélectionne la langue en cours d'édition pour tous les
 * champs texte du bloc (titre, sous-titre, éléments de liste...). Un point plein indique
 * qu'une traduction existe déjà pour cette langue, un contour pointillé qu'elle est vide. */
function LocaleTabs({
  activeLocale,
  onChange,
  hasContent,
}: {
  activeLocale: Locale;
  onChange: (l: Locale) => void;
  hasContent: (l: Locale) => boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg bg-gray-50 p-1.5">
      {LOCALES.map((l) => {
        const filled = hasContent(l);
        const active = l === activeLocale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => onChange(l)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${filled ? "bg-brand-600" : "bg-gray-300"}`} />
            {LOCALE_LABELS[l]}
          </button>
        );
      })}
    </div>
  );
}

function BlockForm({
  form,
  setForm,
  uploading,
  onUploadImage,
  onUploadCategoryItemImage,
  onUploadFeatureItemImage,
  page,
}: {
  form: BlockFormState;
  setForm: (f: BlockFormState) => void;
  uploading: boolean;
  onUploadImage: (file: File | Blob) => void;
  onUploadCategoryItemImage: (itemId: string, file: File | Blob) => void;
  onUploadFeatureItemImage: (itemId: string, file: File | Blob) => void;
  page: MarketingPageKey;
}) {
  const locale = form.activeLocale;
  const tr = form.translations[locale] || {};
  const { t } = useLanguage();

  function setTr(patch: Partial<TranslationFields>) {
    setForm({ ...form, translations: { ...form.translations, [locale]: { ...tr, ...patch } } });
  }

  function trHasContent(l: Locale, keys: (keyof TranslationFields)[]): boolean {
    const t = form.translations[l];
    return !!t && keys.some((k) => (t[k] || "").trim().length > 0);
  }

  function setFeatureItemTr(itemId: string, patch: Partial<{ title: string; desc: string }>) {
    const items = form.featureItems.map((it) => {
      if (it.id !== itemId) return it;
      const current = it.translations[locale] || { title: "", desc: "" };
      return { ...it, translations: { ...it.translations, [locale]: { ...current, ...patch } } };
    });
    setForm({ ...form, featureItems: items });
  }

  function setCategoryItemTr(itemId: string, label: string) {
    const items = form.categoryItems.map((it) => {
      if (it.id !== itemId) return it;
      return { ...it, translations: { ...it.translations, [locale]: { label } } };
    });
    setForm({ ...form, categoryItems: items });
  }

  const translatableKeysByType: Record<MarketingBlockType, (keyof TranslationFields)[]> = {
    HERO: ["eyebrow", "title", "subtitle", "ctaLabel", "secondaryCtaLabel"],
    FEATURES: ["eyebrow", "title", "subtitle"],
    CATEGORIES: ["eyebrow", "title", "subtitle"],
    RICH_TEXT: ["eyebrow", "title", "body"],
    CTA: ["title", "subtitle", "ctaLabel"],
  };

  return (
    <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
      <LocaleTabs
        activeLocale={locale}
        onChange={(l) => setForm({ ...form, activeLocale: l })}
        hasContent={(l) => trHasContent(l, translatableKeysByType[form.type])}
      />

      {form.type === "HERO" && (
        <>
          <Field label={t("admin.site.fieldEyebrow")}>
            <input className="input" value={tr.eyebrow || ""} onChange={(e) => setTr({ eyebrow: e.target.value })} />
          </Field>
          <Field label={t("admin.site.fieldTitle")}>
            <input className="input" value={tr.title || ""} onChange={(e) => setTr({ title: e.target.value })} />
          </Field>
          <Field label={t("admin.site.fieldSubtitle")}>
            <textarea className="input" rows={2} value={tr.subtitle || ""} onChange={(e) => setTr({ subtitle: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("admin.site.fieldPrimaryBtnText")}>
              <input className="input" value={tr.ctaLabel || ""} onChange={(e) => setTr({ ctaLabel: e.target.value })} />
            </Field>
            <Field label={t("admin.site.fieldPrimaryBtnLink")}>
              <input className="input" placeholder="/register" value={form.ctaHref} onChange={(e) => setForm({ ...form, ctaHref: e.target.value })} />
            </Field>
            <Field label={t("admin.site.fieldSecondaryBtnText")}>
              <input className="input" value={tr.secondaryCtaLabel || ""} onChange={(e) => setTr({ secondaryCtaLabel: e.target.value })} />
            </Field>
            <Field label={t("admin.site.fieldSecondaryBtnLink")}>
              <input
                className="input"
                placeholder="/exemples"
                value={form.secondaryCtaHref}
                onChange={(e) => setForm({ ...form, secondaryCtaHref: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t("admin.site.fieldBgColor")}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-14 rounded border border-gray-200"
                value={form.backgroundColor || "#ffffff"}
                onChange={(e) => setForm({ ...form, backgroundColor: e.target.value })}
              />
              <input
                className="input"
                placeholder={t("admin.site.bgColorNone")}
                value={form.backgroundColor}
                onChange={(e) => setForm({ ...form, backgroundColor: e.target.value })}
              />
              {form.backgroundColor && (
                <button type="button" className="btn-secondary shrink-0 text-xs" onClick={() => setForm({ ...form, backgroundColor: "" })}>
                  {t("admin.site.remove")}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">{t("admin.site.bgColorHint")}</p>
          </Field>
          <Field label={t("admin.site.fieldVisual")}>
            <select
              className="input"
              value={form.mediaType}
              onChange={(e) => setForm({ ...form, mediaType: e.target.value as BlockFormState["mediaType"] })}
            >
              <option value="none">{t("admin.site.visualNone")}</option>
              <option value="mockup">{t("admin.site.visualMockup")}</option>
              <option value="photo">{t("admin.site.visualPhoto")}</option>
              <option value="video">{t("admin.site.visualVideo")}</option>
            </select>
          </Field>
          {form.mediaType === "photo" && (
            <>
              <ImageUploadField
                blockId={form.id}
                imageUrl={form.imageUrl}
                uploading={uploading}
                onUpload={onUploadImage}
                aspectRatio={4 / 3}
                cropTitle={t("admin.site.cropHeroTitle")}
                recommendation={t("admin.site.heroRecommendation")}
              />
              <Field label={t("admin.site.fieldLayoutStyle")}>
                <select
                  className="input"
                  value={form.heroLayout}
                  onChange={(e) => setForm({ ...form, heroLayout: e.target.value as HeroLayout })}
                >
                  {HERO_LAYOUTS.map((l) => (
                    <option key={l} value={l}>
                      {HERO_LAYOUT_LABELS[l]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">{t("admin.site.layoutStyleHint")}</p>
              </Field>
            </>
          )}
          {form.mediaType === "video" && (
            <Field label={t("admin.site.fieldVideoUrl")}>
              <input
                className="input"
                placeholder="https://..."
                value={form.videoUrl}
                onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500">{t("admin.site.videoUrlHint")}</p>
            </Field>
          )}
        </>
      )}

      {form.type === "FEATURES" && (
        <>
          <Field label={t("admin.site.fieldEyebrow")}>
            <input className="input" value={tr.eyebrow || ""} onChange={(e) => setTr({ eyebrow: e.target.value })} />
          </Field>
          <Field label={t("admin.site.fieldTitle")}>
            <input className="input" value={tr.title || ""} onChange={(e) => setTr({ title: e.target.value })} />
          </Field>
          <Field label={t("admin.site.fieldSubtitle")}>
            <textarea className="input" rows={2} value={tr.subtitle || ""} onChange={(e) => setTr({ subtitle: e.target.value })} />
          </Field>
          <div>
            <p className="mb-1 text-sm font-medium">{t("admin.site.featuresListLabel")}</p>
            <div className="space-y-3">
              {form.featureItems.map((item) => {
                const itemTr = item.translations[locale] || { title: "", desc: "" };
                return (
                  <div key={item.id} className="flex gap-3 rounded-lg border border-gray-200 p-2">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400">
                        {t("admin.site.noneImage")}
                      </div>
                    )}
                    <div className="flex-1 space-y-1">
                      <input
                        className="input"
                        placeholder={t("admin.site.placeholderTitle")}
                        value={itemTr.title}
                        onChange={(e) => setFeatureItemTr(item.id, { title: e.target.value })}
                      />
                      <textarea
                        className="input"
                        placeholder={t("admin.site.placeholderDesc")}
                        rows={2}
                        value={itemTr.desc}
                        onChange={(e) => setFeatureItemTr(item.id, { desc: e.target.value })}
                      />
                      <CategoryImageUploader
                        blockId={form.id}
                        uploading={uploading}
                        onUpload={(file) => onUploadFeatureItemImage(item.id, file)}
                        aspectRatio={4 / 3}
                        cropTitle={t("admin.site.cropFeatureTitle")}
                      />
                    </div>
                    <button
                      type="button"
                      className="self-start shrink-0 rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      onClick={() => setForm({ ...form, featureItems: form.featureItems.filter((it) => it.id !== item.id) })}
                    >
                      {t("admin.site.remove")}
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="btn-secondary mt-2 text-sm"
              onClick={() => setForm({ ...form, featureItems: [...form.featureItems, newFeatureItem()] })}
            >
              {t("admin.site.addFeature")}
            </button>
            <p className="mt-1 text-xs text-gray-500">{t("admin.site.featureImageHint")}</p>
          </div>
        </>
      )}

      {form.type === "CATEGORIES" && (
        <>
          <Field label={t("admin.site.fieldEyebrow")}>
            <input className="input" value={tr.eyebrow || ""} onChange={(e) => setTr({ eyebrow: e.target.value })} />
          </Field>
          <Field label={t("admin.site.fieldTitle")}>
            <input className="input" value={tr.title || ""} onChange={(e) => setTr({ title: e.target.value })} />
          </Field>
          <Field label={t("admin.site.fieldSubtitle")}>
            <textarea className="input" rows={2} value={tr.subtitle || ""} onChange={(e) => setTr({ subtitle: e.target.value })} />
          </Field>
          <div>
            <p className="mb-1 text-sm font-medium">{t("admin.site.pastillesLabel")}</p>
            <div className="space-y-3">
              {form.categoryItems.map((cat) => {
                const label = cat.translations[locale]?.label || "";
                return (
                  <div key={cat.id} className="flex gap-3 rounded-lg border border-gray-200 p-2">
                    {cat.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cat.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-400">
                        {t("admin.site.noneImage")}
                      </div>
                    )}
                    <div className="flex-1 space-y-1">
                      <input
                        className="input"
                        placeholder={t("admin.site.placeholderCategoryName")}
                        value={label}
                        onChange={(e) => setCategoryItemTr(cat.id, e.target.value)}
                      />
                      <CategoryImageUploader
                        blockId={form.id}
                        uploading={uploading}
                        onUpload={(file) => onUploadCategoryItemImage(cat.id, file)}
                      />
                    </div>
                    <button
                      type="button"
                      className="self-start shrink-0 rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      onClick={() => setForm({ ...form, categoryItems: form.categoryItems.filter((it) => it.id !== cat.id) })}
                    >
                      {t("admin.site.remove")}
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="btn-secondary mt-2 text-sm"
              onClick={() => setForm({ ...form, categoryItems: [...form.categoryItems, newCategoryItem()] })}
            >
              {t("admin.site.addPastille")}
            </button>
          </div>
        </>
      )}

      {form.type === "RICH_TEXT" && (
        <>
          <Field label={t("admin.site.fieldEyebrow")}>
            <input className="input" value={tr.eyebrow || ""} onChange={(e) => setTr({ eyebrow: e.target.value })} />
          </Field>
          <Field label={t("admin.site.fieldTitle")}>
            <input className="input" value={tr.title || ""} onChange={(e) => setTr({ title: e.target.value })} />
          </Field>
          <Field label={t("admin.site.fieldBodyText")}>
            <textarea className="input" rows={8} value={tr.body || ""} onChange={(e) => setTr({ body: e.target.value })} />
          </Field>
          <Field label={t("admin.site.fieldImagePosition")}>
            <select
              className="input"
              value={form.imagePosition}
              onChange={(e) => setForm({ ...form, imagePosition: e.target.value as BlockFormState["imagePosition"] })}
            >
              <option value="none">{t("admin.site.imgPosNone")}</option>
              <option value="left">{t("admin.site.imgPosLeft")}</option>
              <option value="right">{t("admin.site.imgPosRight")}</option>
            </select>
          </Field>
          {form.imagePosition !== "none" && (
            <ImageUploadField
              blockId={form.id}
              imageUrl={form.imageUrl}
              uploading={uploading}
              onUpload={onUploadImage}
              aspectRatio={4 / 5}
              cropTitle={t("admin.site.cropRichTextTitle")}
              recommendation={t("admin.site.richTextRecommendation")}
            />
          )}
        </>
      )}

      {form.type === "CTA" && (
        <>
          <Field label={t("admin.site.fieldTitle")}>
            <input className="input" value={tr.title || ""} onChange={(e) => setTr({ title: e.target.value })} />
          </Field>
          <Field label={t("admin.site.fieldSubtitle")}>
            <textarea className="input" rows={2} value={tr.subtitle || ""} onChange={(e) => setTr({ subtitle: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("admin.site.ctaButtonText")}>
              <input className="input" value={tr.ctaLabel || ""} onChange={(e) => setTr({ ctaLabel: e.target.value })} />
            </Field>
            <Field label={t("admin.site.ctaButtonLink")}>
              <input className="input" placeholder="/register" value={form.ctaHref} onChange={(e) => setForm({ ...form, ctaHref: e.target.value })} />
            </Field>
          </div>
          <ImageUploadField
            blockId={form.id}
            imageUrl={form.imageUrl}
            uploading={uploading}
            onUpload={onUploadImage}
            aspectRatio={4 / 3}
            cropTitle={t("admin.site.cropCtaTitle")}
            recommendation={t("admin.site.ctaRecommendation")}
          />
          {!form.imageUrl && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.showVisual} onChange={(e) => setForm({ ...form, showVisual: e.target.checked })} />
              {t("admin.site.showDefaultVisual")}
            </label>
          )}
        </>
      )}

      <label className="flex items-center gap-2 border-t border-gray-100 pt-4 text-sm">
        <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
        {t("admin.site.activePrefix")} {t(PAGE_LABEL_KEYS[page])}
        {t("admin.site.activeSuffix")}
      </label>

      {page === "HOME" && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.sharedAcrossPages}
              onChange={(e) => setForm({ ...form, sharedAcrossPages: e.target.checked })}
            />
            {t("admin.site.sharedAcrossPagesLabel")}
          </label>
          {form.sharedAcrossPages && (
            <label className="ml-6 flex items-center gap-2 text-sm text-gray-600">
              {t("admin.site.sharedPositionLabel")}
              <select
                className="input w-auto"
                value={form.sharedPosition}
                onChange={(e) => setForm({ ...form, sharedPosition: e.target.value as "before" | "after" })}
              >
                <option value="before">{t("admin.site.positionBefore")}</option>
                <option value="after">{t("admin.site.positionAfter")}</option>
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function ImageUploadField({
  blockId,
  imageUrl,
  uploading,
  onUpload,
  recommendation,
  aspectRatio,
  cropTitle,
}: {
  blockId?: string;
  imageUrl: string;
  uploading: boolean;
  onUpload: (file: File | Blob) => void;
  recommendation: string;
  /** Ratio largeur/hauteur imposé à l'étape de recadrage, pour coller à l'emplacement réel
   * de l'image sur la page (ex: 4/3 pour le hero, 4/5 pour l'image du bloc texte). */
  aspectRatio: number;
  cropTitle?: string;
}) {
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const { t } = useLanguage();

  if (!blockId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {t("admin.site.saveBlockFirst")}
      </div>
    );
  }
  return (
    <Field label={t("admin.site.fieldImage")}>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="mb-2 h-32 w-full rounded-lg object-cover" />
      )}
      <input
        key={inputKey}
        type="file"
        accept="image/*"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setCropFile(file);
        }}
      />
      <p className="mt-1 text-xs text-gray-500">
        {imageUrl ? t("admin.site.uploadReplaceHint") : ""}
        {uploading ? t("admin.site.uploading") : ""}
      </p>
      <p className="mt-1 text-xs text-gray-500">{recommendation}</p>

      {cropFile && (
        <ImageCropModal
          file={cropFile}
          aspectRatio={aspectRatio}
          title={cropTitle}
          onCancel={() => {
            setCropFile(null);
            setInputKey((k) => k + 1);
          }}
          onConfirm={(blob) => {
            onUpload(blob);
            setCropFile(null);
            setInputKey((k) => k + 1);
          }}
        />
      )}
    </Field>
  );
}

/** Variante compacte d'ImageUploadField pour l'image d'un élément dans une liste (pastille
 * de catégorie, carte de fonctionnalité) — pas de grand aperçu ni de libellé de champ (déjà
 * géré par le layout de la ligne parente). */
function CategoryImageUploader({
  blockId,
  uploading,
  onUpload,
  aspectRatio = 1,
  cropTitle,
}: {
  blockId?: string;
  uploading: boolean;
  onUpload: (file: File | Blob) => void;
  aspectRatio?: number;
  cropTitle?: string;
}) {
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const { t } = useLanguage();

  if (!blockId) {
    return <p className="text-xs text-amber-700">{t("admin.site.saveBlockFirstShort")}</p>;
  }

  return (
    <div>
      <input
        key={inputKey}
        type="file"
        accept="image/*"
        disabled={uploading}
        className="text-xs"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setCropFile(file);
        }}
      />
      {cropFile && (
        <ImageCropModal
          file={cropFile}
          aspectRatio={aspectRatio}
          title={cropTitle || t("admin.site.cropDefaultTitle")}
          onCancel={() => {
            setCropFile(null);
            setInputKey((k) => k + 1);
          }}
          onConfirm={(blob) => {
            onUpload(blob);
            setCropFile(null);
            setInputKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
