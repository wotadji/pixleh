"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PageSpinner } from "@/components/ui/Spinner";

interface PrintCatalogItemDTO {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  sku: string | null;
  imageUrl: string | null;
  active: boolean;
  wholesaleCostCents: number | null;
  /** Attributs sélectionnables du SKU (JSON string, ex: {"wrap":["Black","White"]}) — chargés
   * par le bouton "Resynchroniser" (voir getProdigiProductDetails). Affichés en badge
   * informatif : c'est ce qui active le sélecteur d'attribut côté client
   * (PrintSelectionPageView) pour ce produit. */
  prodigiAttributeOptions: string | null;
  /** Chantier "groupe de produits" (02/08/2026, demande d'Adriel : "peux tu ajouter la
   * possibilité de creer un groupe de produit et a l'intérieur ajouter les SKU adéquat ?") —
   * true = ce produit est un GROUPE (conteneur de tailles/SKU), pas vendable tel quel. */
  isProductGroup: boolean;
  /** Non-null uniquement sur une variante : id du groupe parent. */
  groupId: string | null;
}

/** Parse prodigiAttributeOptions en toute sécurité — utilisé aussi bien dans la liste que dans
 * la modale d'édition. Retourne {} si absent/invalide plutôt que de faire planter le rendu. */
function parseAttributeOptions(json: string | null): Record<string, string[]> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

interface FormState {
  /** Toujours défini, y compris pour un nouveau produit pas encore enregistré (voir makeId) —
   * demande d'Adriel (01/08/2026) : "pourquoi ne pas mettre l'upload sur la creation d'un
   * nouveau produit ?". Permet d'uploader l'image du produit avant le premier "Enregistrer",
   * la clé de stockage de l'image étant indexée par cet id (voir uploadImage). */
  id: string;
  /** false = produit pas encore créé en base (save() doit POSTer), true = déjà existant
   * (save() doit PATCHer) — distinct de `id` qui, lui, existe dans les deux cas. */
  persisted: boolean;
  name: string;
  description: string;
  price: string;
  sku: string;
  imageUrl: string;
  active: boolean;
  wholesaleCost: string;
  /** true = le formulaire crée/édite un GROUPE (conteneur), pas un produit vendable — masque
   * SKU/coût/resync dans la modale. Chantier "groupe de produits" (02/08/2026). */
  isProductGroup: boolean;
  /** Id du groupe parent si ce formulaire crée/édite une VARIANTE à l'intérieur d'un groupe
   * (ouvert via le bouton "+ Ajouter un SKU" d'un groupe) — null sinon. */
  groupId: string | null;
}

/** Génère un id côté client pour un nouveau produit (même patron que makeSlideId dans
 * /dashboard/settings pour les slides de carrousel) — nécessaire pour pouvoir uploader une
 * image AVANT le premier enregistrement du produit. */
function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `product-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const EMPTY_FORM_FIELDS = {
  name: "",
  description: "",
  price: "0",
  sku: "",
  imageUrl: "",
  active: true,
  wholesaleCost: "",
  isProductGroup: false,
  groupId: null as string | null,
};

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "NO_SKU";

function toCents(euros: string) {
  return Math.round(parseFloat(euros.replace(",", ".") || "0") * 100);
}

function fromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function itemToForm(item: PrintCatalogItemDTO): FormState {
  return {
    id: item.id,
    persisted: true,
    name: item.name,
    description: item.description || "",
    price: fromCents(item.priceCents),
    sku: item.sku || "",
    imageUrl: item.imageUrl || "",
    active: item.active,
    wholesaleCost: item.wholesaleCostCents != null ? fromCents(item.wholesaleCostCents) : "",
    isProductGroup: item.isProductGroup,
    groupId: item.groupId,
  };
}

/** Pastille de marge colorée : rouge si perte, ambre si marge faible (<20%), verte sinon —
 * donne un signal visuel immédiat sans avoir à faire le calcul mentalement. */
function marginTone(marginCents: number, priceCents: number): { bg: string; text: string } {
  if (marginCents < 0) return { bg: "bg-red-50", text: "text-red-700" };
  const pct = priceCents > 0 ? (marginCents / priceCents) * 100 : 0;
  if (pct < 20) return { bg: "bg-amber-50", text: "text-amber-700" };
  return { bg: "bg-green-50", text: "text-green-700" };
}

/**
 * Catalogue impression plateforme — service pixleh (fulfillment via Prodigi), pas les
 * studios : demande d'Adriel, 31/07/2026, "je veux que Boutique — Produits soit géré dans le
 * panel Administrateur [...] c'est un service de pixleh pas du studio". Le prix de vente
 * (priceCents) reste TOUJOURS fixé manuellement par Adriel ; le coût de revient Prodigi
 * (wholesaleCostCents) n'est qu'une indication pour l'aider à décider de sa marge, jamais
 * recalculé automatiquement dans priceCents.
 *
 * Redesign du 01/08/2026 (demande d'Adriel : "design pro et expert") : bandeau de stats,
 * recherche/filtre, pastille de marge colorée, activation en un clic, aperçu image + marge
 * en direct dans le formulaire — même vocabulaire visuel que /dashboard/invoices (pastilles
 * arrondies, avatar carré, liste divide-y) pour rester cohérent avec le reste de pixleh.
 */
export default function AdminPrintCatalogPage() {
  const [items, setItems] = useState<PrintCatalogItemDTO[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => ({ ...EMPTY_FORM_FIELDS, id: makeId(), persisted: false }));
  const [saving, setSaving] = useState(false);
  const [resyncing, setResyncing] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prodigiWarning, setProdigiWarning] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [uploadingImage, setUploadingImage] = useState(false);
  // Bascule liste/grille (demande d'Adriel, 02/08/2026 : "peux tu mettres un filtre d'affichage
  // en ligne et en grid") — même vocabulaire visuel que la page /print-selection côté client.
  const [view, setView] = useState<"list" | "grid">("list");

  async function loadItems() {
    const res = await fetch("/api/admin/print-catalog");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  function openCreate() {
    setForm({ ...EMPTY_FORM_FIELDS, id: makeId(), persisted: false });
    setError(null);
    setModalOpen(true);
  }

  /** "Nouveau groupe" — chantier "groupe de produits" (02/08/2026, demande d'Adriel) : ouvre
   * la même modale mais en mode groupe (SKU/coût/resync masqués, voir ProductModal). */
  function openCreateGroup() {
    setForm({ ...EMPTY_FORM_FIELDS, id: makeId(), persisted: false, isProductGroup: true });
    setError(null);
    setModalOpen(true);
  }

  /** "+ Ajouter un SKU" depuis un groupe — pré-remplit groupId pour que ce nouveau produit
   * devienne une variante de ce groupe dès l'enregistrement. */
  function openAddVariant(group: PrintCatalogItemDTO) {
    setForm({ ...EMPTY_FORM_FIELDS, id: makeId(), persisted: false, groupId: group.id });
    setError(null);
    setModalOpen(true);
  }

  function openEdit(item: PrintCatalogItemDTO) {
    setForm(itemToForm(item));
    setError(null);
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const payload = {
      // `id` n'est utile qu'à la création (voir printCatalogItemSchema) — permet de donner au
      // produit le MÊME id que celui déjà utilisé comme clé de stockage si une image a été
      // uploadée avant ce premier "Enregistrer" (voir makeId/uploadImage). Ignoré par la route
      // PATCH (l'id de l'URL prime), donc sans risque de l'envoyer aussi en édition.
      id: form.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      priceCents: toCents(form.price),
      currency: "eur",
      sku: form.sku.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      active: form.active,
      wholesaleCostCents: form.wholesaleCost.trim() ? toCents(form.wholesaleCost) : null,
      isProductGroup: form.isProductGroup,
      groupId: form.groupId,
    };

    try {
      const res = await fetch(form.persisted ? `/api/admin/print-catalog/${form.id}` : "/api/admin/print-catalog", {
        method: form.persisted ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.formErrors?.[0] || data?.error || "Erreur lors de l'enregistrement.");
        setSaving(false);
        return;
      }
      if (data.prodigiSync && data.prodigiSync.synced === false) {
        setProdigiWarning(data.prodigiSync.error || "Synchronisation Prodigi indisponible.");
      }
      setModalOpen(false);
      await loadItems();
    } catch {
      setError("Erreur réseau.");
    }
    setSaving(false);
  }

  /**
   * Upload de l'image du produit en cours d'édition — fonctionne aussi bien pour un produit
   * déjà enregistré que pour un nouveau produit pas encore créé (demande d'Adriel, 01/08/2026 :
   * "pourquoi ne pas mettre l'upload sur la creation d'un nouveau produit ?"), form.id étant
   * toujours défini (voir makeId). Si le produit existe déjà en base, l'API met aussi à jour
   * `imageUrl` immédiatement (voir route), donc on rafraîchit la liste en plus du formulaire
   * pour rester cohérent si la modale est fermée sans re-cliquer "Enregistrer" ; pour un
   * nouveau produit, seul le fichier est stocké côté serveur — c'est le prochain "Enregistrer"
   * (POST, avec ce même id) qui créera la ligne avec cette imageUrl.
   */
  async function uploadImage(file: File) {
    setUploadingImage(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/admin/print-catalog/${form.id}/image`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Échec de l'upload de l'image.");
        setUploadingImage(false);
        return;
      }
      setForm((f) => ({ ...f, imageUrl: data.imageUrl }));
      await loadItems();
    } catch {
      setError("Erreur réseau lors de l'upload.");
    }
    setUploadingImage(false);
  }

  /** Retire l'image du produit en cours d'édition — supprime aussi le fichier stocké côté
   * serveur si le produit existe déjà en base (rien à supprimer côté serveur pour un nouveau
   * produit pas encore enregistré : le fichier orphelin, s'il y en a un, sera simplement
   * remplacé/écrasé si un autre est uploadé sous le même id). */
  async function removeImage() {
    setUploadingImage(true);
    if (form.persisted) {
      try {
        await fetch(`/api/admin/print-catalog/${form.id}/image`, { method: "DELETE" });
        await loadItems();
      } catch {
        // best-effort : on vide quand même l'aperçu local ci-dessous
      }
    }
    setForm((f) => ({ ...f, imageUrl: "" }));
    setUploadingImage(false);
  }

  async function resync(item: PrintCatalogItemDTO) {
    setResyncing(item.id);
    const res = await fetch(`/api/admin/print-catalog/${item.id}/quote`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (data.prodigiSync && data.prodigiSync.synced === false) {
      setProdigiWarning(data.prodigiSync.error || "Synchronisation Prodigi indisponible.");
    } else {
      setProdigiWarning(null);
    }
    await loadItems();
    setResyncing(null);
  }

  async function toggleActive(item: PrintCatalogItemDTO) {
    setToggling(item.id);
    const res = await fetch(`/api/admin/print-catalog/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    if (res.ok) {
      setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, active: !i.active } : i)) ?? null);
    }
    setToggling(null);
  }

  async function remove(item: PrintCatalogItemDTO) {
    if (!confirm(`Supprimer "${item.name}" ? Cette action est irréversible.`)) return;
    const res = await fetch(`/api/admin/print-catalog/${item.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data?.error || "Suppression impossible.");
      return;
    }
    await loadItems();
  }

  const stats = useMemo(() => {
    if (!items) return null;
    // Un GROUPE (isProductGroup=true) n'est pas un produit vendable — c'est un conteneur (voir
    // schema.prisma). Les compter dans "Produits actifs" est trompeur (demande d'Adriel,
    // 02/08/2026 : "je pense que c'est 9/9 groupe de produit(s) [...] il faut creer un bloc pour
    // produit") : on distingue désormais les GROUPES des vrais PRODUITS vendables (autonomes +
    // variantes de groupe), avec une pastille dédiée pour chacun.
    const groups = items.filter((i) => i.isProductGroup);
    const products = items.filter((i) => !i.isProductGroup);
    const activeGroups = groups.filter((i) => i.active);
    const activeProducts = products.filter((i) => i.active);
    const withMargin = products.filter((i) => i.wholesaleCostCents != null);
    const avgMarginPct =
      withMargin.length > 0
        ? withMargin.reduce(
            (sum, i) => sum + ((i.priceCents - (i.wholesaleCostCents ?? 0)) / Math.max(i.priceCents, 1)) * 100,
            0
          ) / withMargin.length
        : null;
    // Moyenne calculée uniquement sur les vrais produits vendables : le priceCents d'un groupe
    // n'est qu'un placeholder (toujours 0, jamais affiché au client, voir isProductGroup) qui
    // fausserait la moyenne s'il était inclus.
    const avgPrice = products.length > 0 ? products.reduce((sum, i) => sum + i.priceCents, 0) / products.length : 0;
    const noSku = products.filter((i) => !i.sku).length;
    return {
      groupsTotal: groups.length,
      groupsActive: activeGroups.length,
      productsTotal: products.length,
      productsActive: activeProducts.length,
      avgPrice,
      avgMarginPct,
      noSku,
    };
  }, [items]);

  /** Chantier "groupe de produits" (02/08/2026, demande d'Adriel) — la liste est désormais
   * hiérarchique : chaque groupe (isProductGroup=true) affiche ses variantes (groupId=son id)
   * imbriquées dessous, jamais comme des lignes autonomes au niveau racine. */
  function matchesItem(i: PrintCatalogItemDTO, q: string) {
    return !q || i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q);
  }
  function matchesStatusFilter(i: PrintCatalogItemDTO) {
    return (
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && i.active) ||
      (statusFilter === "INACTIVE" && !i.active) ||
      (statusFilter === "NO_SKU" && !i.sku && !i.isProductGroup)
    );
  }

  const variantsByGroup = useMemo(() => {
    const map = new Map<string, PrintCatalogItemDTO[]>();
    for (const i of items ?? []) {
      if (!i.groupId) continue;
      const list = map.get(i.groupId) ?? [];
      list.push(i);
      map.set(i.groupId, list);
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => !i.groupId) // uniquement les lignes racine (autonomes ou groupes)
      .filter((i) => {
        if (!matchesStatusFilter(i)) return false;
        if (matchesItem(i, q)) return true;
        // Un groupe reste affiché si l'une de ses variantes correspond à la recherche (ex:
        // rechercher un SKU précis doit quand même montrer son groupe parent).
        return i.isProductGroup && (variantsByGroup.get(i.id) ?? []).some((v) => matchesItem(v, q));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, statusFilter, variantsByGroup]);

  if (!items || !stats) return <PageSpinner />;

  return (
    <div>
      {/* En-tête — redesign "pro" (demande d'Adriel, 01/08/2026 : "tu es expert en ux, ui et
          expert en web design, je veux que tu me proposes un design pro de cette page"). Les deux
          actions de création portent désormais une icône + (au lieu du "+" typographique brut)
          pour un rendu plus soigné, et un pictogramme dossier/imprimante en filigrane rappelle
          visuellement la distinction groupe/produit dès l'en-tête. */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <IconPrinter />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-semibold text-gray-900">Catalogue impression</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Produits d&apos;impression physique (tirages, toiles...) proposés dans toutes les galeries.
              Fulfillment via Prodigi — le paiement va directement à pixleh, les studios n&apos;en gèrent
              plus le prix.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* "Nouveau groupe" — chantier "groupe de produits" (02/08/2026, demande d'Adriel :
              "peux tu ajouter la possibilité de creer un groupe de produit et a l'intérieur
              ajouter les SKU adéquat ?") : un groupe sert à proposer plusieurs tailles/SKU
              Prodigi (ex: 12x16 et 20x30, deux SKU distincts chez Prodigi) sous un même produit
              côté client, qui choisit sa taille au moment de l'achat. */}
          <button type="button" className="btn-secondary inline-flex items-center gap-1.5" onClick={openCreateGroup}>
            <IconFolder small /> Nouveau groupe
          </button>
          <button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={openCreate}>
            <IconPlus /> Nouveau produit
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Groupes actifs"
          value={`${stats.groupsActive} / ${stats.groupsTotal}`}
          icon={<IconFolder small />}
          accent="indigo"
        />
        <StatCard
          label="Produits actifs"
          value={`${stats.productsActive} / ${stats.productsTotal}`}
          icon={<IconPrinter small />}
          accent="brand"
        />
        <StatCard
          label="Prix de vente moyen"
          value={formatMoney(stats.avgPrice)}
          icon={<IconTag small />}
          accent="gray"
        />
        <StatCard
          label="Marge moyenne"
          value={stats.avgMarginPct != null ? `${Math.round(stats.avgMarginPct)} %` : "—"}
          icon={<IconPercent small />}
          tone={stats.avgMarginPct == null ? undefined : stats.avgMarginPct < 20 ? "amber" : "green"}
          accent={stats.avgMarginPct == null ? "gray" : stats.avgMarginPct < 20 ? "amber" : "green"}
        />
        <StatCard
          label="Sans SKU Prodigi"
          value={String(stats.noSku)}
          icon={<IconAlert small />}
          tone={stats.noSku > 0 ? "amber" : undefined}
          accent={stats.noSku > 0 ? "amber" : "gray"}
        />
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <span className="mt-0.5 shrink-0 text-gray-400">
          <IconInfo />
        </span>
        <span>
          Le SKU correspond au SKU Prodigi (ex: <code>GLOBAL-CAN-10x10</code>) — renseigne-le pour pouvoir
          resynchroniser le coût de revient réel. Le prix de vente reste toujours fixé ici à la main, avec
          ta marge par-dessus.
        </span>
      </div>

      {prodigiWarning && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="break-words">Synchronisation Prodigi : {prodigiWarning}</span>
          <button onClick={() => setProdigiWarning(null)} className="shrink-0 text-amber-500 hover:text-amber-700">
            ✕
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56 shrink-0">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">
              <IconSearch />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (nom, SKU)"
              className="input pl-8"
            />
          </div>
          <div className="w-48 shrink-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="input"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="ACTIVE">Actifs</option>
              <option value="INACTIVE">Désactivés</option>
              <option value="NO_SKU">Sans SKU Prodigi</option>
            </select>
          </div>
        </div>
        {/* Bascule liste/grille (demande d'Adriel, 02/08/2026 : "peux tu mettres un filtre
            d'affichage en ligne et en grid") — la vue grille regroupe chaque produit (et, pour
            un groupe, ses variantes) dans une carte indépendante, pratique pour comparer
            visuellement plusieurs produits ; la vue liste reste le format compact d'origine. */}
        <div className="ml-auto flex items-center gap-0.5 rounded-md border border-gray-200 p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            aria-label="Vue liste"
            title="Vue liste"
            className={`flex h-7 w-7 items-center justify-center rounded ${
              view === "list" ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <IconListView />
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-label="Vue grille"
            title="Vue grille"
            className={`flex h-7 w-7 items-center justify-center rounded ${
              view === "grid" ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <IconGridView />
          </button>
        </div>
      </div>

      <div
        className={
          view === "grid"
            ? "mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            : "mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white"
        }
      >
        {filtered.length === 0 && (
          <div
            className={`flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 p-12 text-center ${
              view === "grid" ? "md:col-span-2 xl:col-span-3" : ""
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-300">
              <IconPrinter />
            </div>
            <p className="text-sm text-gray-500">
              {items.length === 0
                ? "Aucun produit pour le moment — crée le premier."
                : "Aucun produit ne correspond à ta recherche."}
            </p>
          </div>
        )}
        {filtered.map((item) =>
          view === "grid" ? (
            <GridCard
              key={item.id}
              item={item}
              variants={variantsByGroup.get(item.id) ?? []}
              groupDisplayPriceCents={
                item.isProductGroup
                  ? (() => {
                      const variants = (variantsByGroup.get(item.id) ?? []).filter((v) => v.active);
                      return variants.length > 0 ? Math.min(...variants.map((v) => v.priceCents)) : null;
                    })()
                  : undefined
              }
              resyncing={resyncing}
              toggling={toggling}
              onToggleActive={toggleActive}
              onResync={resync}
              onEdit={openEdit}
              onRemove={remove}
              onAddVariant={openAddVariant}
            />
          ) : (
            <div key={item.id}>
              <CatalogRow
                item={item}
                groupDisplayPriceCents={
                  item.isProductGroup
                    ? (() => {
                        const variants = (variantsByGroup.get(item.id) ?? []).filter((v) => v.active);
                        return variants.length > 0 ? Math.min(...variants.map((v) => v.priceCents)) : null;
                      })()
                    : undefined
                }
                resyncing={resyncing}
                toggling={toggling}
                onToggleActive={toggleActive}
                onResync={resync}
                onEdit={openEdit}
                onRemove={remove}
              />
              {item.isProductGroup && (
                <div className="divide-y divide-gray-100 border-t border-gray-100 bg-gray-50/60 pl-6">
                  {(variantsByGroup.get(item.id) ?? []).length === 0 && (
                    <p className="p-4 text-sm text-gray-400">Aucun SKU dans ce groupe pour le moment.</p>
                  )}
                  {(variantsByGroup.get(item.id) ?? []).map((variant) => (
                    <CatalogRow
                      key={variant.id}
                      item={variant}
                      isVariant
                      resyncing={resyncing}
                      toggling={toggling}
                      onToggleActive={toggleActive}
                      onResync={resync}
                      onEdit={openEdit}
                      onRemove={remove}
                    />
                  ))}
                  <div className="p-3">
                    <button
                      type="button"
                      className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm ring-1 ring-brand-200 hover:bg-brand-50"
                      onClick={() => openAddVariant(item)}
                    >
                      + Ajouter un SKU dans ce groupe
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>

      <ProductModal
        open={modalOpen}
        form={form}
        setForm={setForm}
        saving={saving}
        error={error}
        onClose={() => setModalOpen(false)}
        onSave={save}
        onUploadImage={uploadImage}
        onRemoveImage={removeImage}
        uploadingImage={uploadingImage}
        groups={items.filter((i) => i.isProductGroup)}
      />
    </div>
  );
}

const ACCENT_STYLES: Record<string, { bar: string; iconBg: string; iconText: string }> = {
  brand: { bar: "bg-brand-500", iconBg: "bg-brand-50", iconText: "text-brand-600" },
  indigo: { bar: "bg-indigo-500", iconBg: "bg-indigo-50", iconText: "text-indigo-600" },
  green: { bar: "bg-green-500", iconBg: "bg-green-50", iconText: "text-green-600" },
  amber: { bar: "bg-amber-500", iconBg: "bg-amber-50", iconText: "text-amber-600" },
  gray: { bar: "bg-gray-300", iconBg: "bg-gray-50", iconText: "text-gray-500" },
};

/** Carte de stat — redesign "pro" (01/08/2026, demande d'Adriel) : liseré de couleur + icône
 * dédiée par indicateur, pour un repérage visuel plus rapide qu'un simple bloc chiffre/texte. */
function StatCard({
  label,
  value,
  tone,
  icon,
  accent = "gray",
}: {
  label: string;
  value: string;
  tone?: "amber" | "green";
  icon?: ReactNode;
  accent?: keyof typeof ACCENT_STYLES;
}) {
  const a = ACCENT_STYLES[accent];
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 pl-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${a.bar}`} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        {icon && (
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${a.iconBg} ${a.iconText}`}>
            {icon}
          </span>
        )}
      </div>
      <p
        className={`mt-1.5 text-xl font-semibold ${
          tone === "amber" ? "text-amber-600" : tone === "green" ? "text-green-600" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Carte produit/groupe pour la vue grille (demande d'Adriel, 01/08/2026 : "tu es expert en ux,
 * ui et expert en web design, je veux que tu me proposes un design pro de cette page") —
 * remplace l'ancienne CatalogRow simplement encadrée par un vrai gabarit "fiche produit" :
 * grande image en tête (ou pictogramme si absente), badges en overlay, prix/marge bien visibles,
 * actions condensées en icônes dans un pied de carte. Pour un GROUPE, les variantes sont listées
 * de façon compacte directement dans la carte plutôt que dans un bloc séparé.
 */
function GridCard({
  item,
  variants,
  groupDisplayPriceCents,
  resyncing,
  toggling,
  onToggleActive,
  onResync,
  onEdit,
  onRemove,
  onAddVariant,
}: {
  item: PrintCatalogItemDTO;
  variants: PrintCatalogItemDTO[];
  groupDisplayPriceCents?: number | null;
  resyncing: string | null;
  toggling: string | null;
  onToggleActive: (item: PrintCatalogItemDTO) => void;
  onResync: (item: PrintCatalogItemDTO) => void;
  onEdit: (item: PrintCatalogItemDTO) => void;
  onRemove: (item: PrintCatalogItemDTO) => void;
  onAddVariant: (group: PrintCatalogItemDTO) => void;
}) {
  const marginCents = item.wholesaleCostCents != null ? item.priceCents - item.wholesaleCostCents : null;
  const tone = marginCents != null ? marginTone(marginCents, item.priceCents) : null;
  const attributeOptions = parseAttributeOptions(item.prodigiAttributeOptions);

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-gray-50">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-brand-200">
            <span className="scale-[2.4]">{item.isProductGroup ? <IconFolder /> : <IconPrinter />}</span>
          </div>
        )}
        {!item.active && <div className="absolute inset-0 bg-white/55" />}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {item.isProductGroup && (
            <span className="rounded-full bg-indigo-600/90 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              Groupe
            </span>
          )}
          {!item.active && (
            <span className="rounded-full bg-gray-800/85 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              Désactivé
            </span>
          )}
          {!item.sku && !item.isProductGroup && (
            <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              Sans SKU
            </span>
          )}
          {Object.keys(attributeOptions).length > 0 && (
            <span className="rounded-full bg-brand-600/90 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              {Object.keys(attributeOptions).length} attribut{Object.keys(attributeOptions).length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="truncate font-medium text-gray-900">{item.name}</p>
        <p className="mt-0.5 truncate text-xs text-gray-500">
          {item.sku ? (
            <code className="text-gray-600">{item.sku}</code>
          ) : item.isProductGroup ? (
            "Conteneur de tailles/SKU"
          ) : (
            item.description || "—"
          )}
        </p>

        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <p className="font-semibold text-gray-900">
              {item.isProductGroup
                ? groupDisplayPriceCents != null
                  ? `dès ${formatMoney(groupDisplayPriceCents)}`
                  : "—"
                : formatMoney(item.priceCents)}
            </p>
            {marginCents != null && tone ? (
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone.bg} ${tone.text}`}>
                {marginCents >= 0 ? "+" : ""}
                {formatMoney(marginCents)}
              </span>
            ) : (
              <p className="mt-1 text-xs text-gray-400">
                {item.isProductGroup ? "prix le plus bas" : "coût inconnu"}
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={item.active}
            disabled={toggling === item.id}
            onClick={() => onToggleActive(item)}
            title={item.active ? "Désactiver" : "Activer"}
            className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${
              item.active ? "bg-green-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                item.active ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {item.isProductGroup && (
        <div className="border-t border-gray-100 bg-gray-50/70 px-4 py-3">
          {variants.length === 0 ? (
            <p className="text-xs text-gray-400">Aucun SKU dans ce groupe pour le moment.</p>
          ) : (
            <ul className="space-y-1.5">
              {variants.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-gray-600">{v.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="font-medium text-gray-800">{formatMoney(v.priceCents)}</span>
                    <button
                      type="button"
                      title="Modifier"
                      onClick={() => onEdit(v)}
                      className="text-gray-300 hover:text-gray-600"
                    >
                      <IconEdit />
                    </button>
                    <button
                      type="button"
                      title="Supprimer"
                      onClick={() => onRemove(v)}
                      className="text-gray-300 hover:text-red-600"
                    >
                      <IconTrash />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="mt-2.5 w-full rounded-full bg-white px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm ring-1 ring-brand-200 hover:bg-brand-50"
            onClick={() => onAddVariant(item)}
          >
            + Ajouter un SKU
          </button>
        </div>
      )}

      <div className="flex items-center justify-end gap-1 border-t border-gray-100 px-2 py-1.5">
        {item.sku && (
          <button
            type="button"
            disabled={resyncing === item.id}
            onClick={() => onResync(item)}
            title="Resynchroniser"
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
          >
            {resyncing === item.id ? <IconSpinner /> : <IconRefresh />}
          </button>
        )}
        <button
          type="button"
          title="Modifier"
          onClick={() => onEdit(item)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-700"
        >
          <IconEdit />
        </button>
        <button
          type="button"
          title="Supprimer"
          onClick={() => onRemove(item)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
        >
          <IconTrash />
        </button>
      </div>
    </div>
  );
}

/**
 * Une ligne du catalogue — factorisée pour être réutilisée aussi bien au niveau racine
 * (produits autonomes et groupes) que pour les variantes imbriquées sous un groupe (chantier
 * "groupe de produits", 02/08/2026, demande d'Adriel). `isVariant` ajuste juste le style
 * (légèrement en retrait, fond neutre) — le comportement des boutons reste identique.
 */
function CatalogRow({
  item,
  isVariant,
  /** Prix affiché pour un GROUPE (min. de ses variantes actives) — calculé côté parent qui
   * connaît variantsByGroup ; le priceCents brut du groupe en base n'est qu'un placeholder
   * jamais montré au client (voir isProductGroup). */
  groupDisplayPriceCents,
  resyncing,
  toggling,
  onToggleActive,
  onResync,
  onEdit,
  onRemove,
}: {
  item: PrintCatalogItemDTO;
  isVariant?: boolean;
  groupDisplayPriceCents?: number | null;
  resyncing: string | null;
  toggling: string | null;
  onToggleActive: (item: PrintCatalogItemDTO) => void;
  onResync: (item: PrintCatalogItemDTO) => void;
  onEdit: (item: PrintCatalogItemDTO) => void;
  onRemove: (item: PrintCatalogItemDTO) => void;
}) {
  const marginCents = item.wholesaleCostCents != null ? item.priceCents - item.wholesaleCostCents : null;
  const tone = marginCents != null ? marginTone(marginCents, item.priceCents) : null;
  const attributeOptions = parseAttributeOptions(item.prodigiAttributeOptions);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 p-4 ${!item.active ? "bg-gray-50/60" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            className="h-11 w-11 shrink-0 rounded-lg border border-gray-200 object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            {item.isProductGroup ? <IconFolder small /> : <IconPrinter small />}
          </div>
        )}
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 truncate font-medium text-gray-900">
            {isVariant && <span className="text-gray-300">↳</span>}
            {item.name}
            {item.isProductGroup && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                Groupe
              </span>
            )}
            {!item.active && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                Désactivé
              </span>
            )}
            {!item.sku && !item.isProductGroup && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Sans SKU Prodigi
              </span>
            )}
            {/* Badge attributs sélectionnables (demande d'Adriel, 02/08/2026 : "je veux
                construire une vraie UI de sélection d'attribut au moment de l'achat")
                — visible dès que "Resynchroniser" a chargé au moins un attribut (ex:
                couleur de cadre) : c'est ce qui active le sélecteur côté client. */}
            {Object.keys(attributeOptions).length > 0 && (
              <span
                className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
                title={Object.entries(attributeOptions)
                  .map(([name, values]) => `${name}: ${values.join(", ")}`)
                  .join(" · ")}
              >
                {Object.keys(attributeOptions).length} attribut
                {Object.keys(attributeOptions).length > 1 ? "s" : ""}
              </span>
            )}
          </p>
          <p className="truncate text-sm text-gray-500">
            {item.sku ? (
              <code className="text-gray-600">{item.sku}</code>
            ) : item.isProductGroup ? (
              "Conteneur de tailles/SKU — le client choisit à l'achat"
            ) : (
              item.description || "—"
            )}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <div className="text-right">
          <p className="font-medium text-gray-900">
            {item.isProductGroup
              ? groupDisplayPriceCents != null
                ? `dès ${formatMoney(groupDisplayPriceCents)}`
                : "—"
              : formatMoney(item.priceCents)}
          </p>
          <p className="text-xs text-gray-400">
            {item.isProductGroup
              ? "prix le plus bas de ses variantes"
              : item.wholesaleCostCents != null
                ? `coût ${formatMoney(item.wholesaleCostCents)}`
                : "coût inconnu"}
          </p>
        </div>

        {marginCents != null && tone && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone.bg} ${tone.text}`}>
            {marginCents >= 0 ? "+" : ""}
            {formatMoney(marginCents)}
          </span>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={item.active}
          disabled={toggling === item.id}
          onClick={() => onToggleActive(item)}
          title={item.active ? "Désactiver (masquer des galeries)" : "Activer (afficher dans les galeries)"}
          className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${
            item.active ? "bg-green-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
              item.active ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>

        {item.sku && (
          <button
            type="button"
            disabled={resyncing === item.id}
            onClick={() => onResync(item)}
            className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {resyncing === item.id ? <IconSpinner /> : <IconRefresh />}
            {resyncing === item.id ? "Synchronisation..." : "Resynchroniser"}
          </button>
        )}
        <button
          type="button"
          className="rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
          onClick={() => onEdit(item)}
        >
          Modifier
        </button>
        <button
          type="button"
          className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
          onClick={() => onRemove(item)}
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}

function ProductModal({
  open,
  form,
  setForm,
  saving,
  error,
  onClose,
  onSave,
  onUploadImage,
  onRemoveImage,
  uploadingImage,
  groups,
}: {
  open: boolean;
  form: FormState;
  setForm: (f: FormState) => void;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  onUploadImage: (file: File) => void;
  onRemoveImage: () => void;
  uploadingImage: boolean;
  /** Groupes existants (isProductGroup=true) proposables pour rattacher ce produit comme
   * variante — chantier "groupe de produits" (02/08/2026, demande d'Adriel : "dans l'ajout d'un
   * produit depuis le navbar [...] je veux que tu ajoutes un champs choisir un groupe de
   * produit"). */
  groups: PrintCatalogItemDTO[];
}) {
  const priceCents = toCents(form.price);
  const costCents = form.wholesaleCost.trim() ? toCents(form.wholesaleCost) : null;
  const marginCents = costCents != null ? priceCents - costCents : null;
  const marginPct = marginCents != null && priceCents > 0 ? Math.round((marginCents / priceCents) * 100) : null;

  const modalTitle = form.isProductGroup
    ? form.persisted
      ? "Modifier le groupe"
      : "Nouveau groupe"
    : form.groupId
      ? form.persisted
        ? "Modifier le SKU"
        : "Nouveau SKU dans le groupe"
      : form.persisted
        ? "Modifier le produit"
        : "Nouveau produit";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      widthClassName="max-w-2xl"
      footer={
        <>
          <button type="button" className="btn-secondary text-sm" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn-primary text-sm" disabled={saving} onClick={onSave}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Bandeau contextuel — chantier "groupe de produits" (02/08/2026, demande d'Adriel) :
            rappelle dans quel mode la modale est ouverte, pour éviter toute confusion entre
            créer un groupe, ajouter un SKU dans un groupe, ou créer un produit autonome. */}
        {form.isProductGroup && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
            Ce produit est un <strong>groupe</strong> : pas de SKU/prix propre, c&apos;est un conteneur.
            Ajoute ensuite ses tailles/SKU depuis la liste (bouton &laquo;&nbsp;+ Ajouter un SKU&nbsp;&raquo;).
          </div>
        )}
        {form.groupId && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            Ce SKU appartient à un groupe — il ne sera jamais proposé seul, uniquement via le choix de
            taille sous son groupe.
          </div>
        )}

        <div className="flex items-center gap-3">
          {form.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.imageUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg border border-gray-200 object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              {form.isProductGroup ? <IconFolder /> : <IconPrinter />}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-sm font-medium">Nom</label>
            <input
              className="input"
              placeholder={form.isProductGroup ? "Toile photo" : "Impression 10x15"}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <input
            className="input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        {!form.isProductGroup && (
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Prix de vente (€)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Coût de revient Prodigi (€)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  placeholder="auto si SKU renseigné"
                  value={form.wholesaleCost}
                  onChange={(e) => setForm({ ...form, wholesaleCost: e.target.value })}
                />
              </div>
            </div>
            {/* Marge calculée en direct pendant la saisie — évite d'avoir à enregistrer pour
                découvrir qu'un prix fixé à la va-vite laisse une marge nulle voire négative. */}
            <p className="mt-2 text-sm">
              Marge :{" "}
              {marginCents != null ? (
                <span
                  className={`font-medium ${
                    marginCents < 0
                      ? "text-red-600"
                      : marginPct != null && marginPct < 20
                        ? "text-amber-600"
                        : "text-green-600"
                  }`}
                >
                  {marginCents >= 0 ? "+" : ""}
                  {formatMoney(marginCents)} {marginPct != null && `(${marginPct} %)`}
                </span>
              ) : (
                <span className="text-gray-400">renseigne un coût de revient pour la voir</span>
              )}
            </p>
          </div>
        )}

        {!form.isProductGroup && (
          <div>
            <label className="mb-1 block text-sm font-medium">SKU Prodigi</label>
            <input
              className="input"
              placeholder="GLOBAL-CAN-10x10"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
            />
          </div>
        )}

        {/* Rattachement à un groupe (demande d'Adriel, 02/08/2026 : "dans l'ajout d'un produit
            depuis le navbar [...] je veux que tu ajoutes un champs choisir un groupe de
            produit") — un groupe ne peut pas être rattaché à un autre groupe (masqué si
            form.isProductGroup), et n'a de sens que s'il existe déjà au moins un groupe créé. */}
        {!form.isProductGroup && groups.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium">Groupe de produit</label>
            <select
              className="input"
              value={form.groupId ?? ""}
              onChange={(e) => setForm({ ...form, groupId: e.target.value || null })}
            >
              <option value="">Aucun — produit autonome</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-500">
              Rattache ce produit à un groupe existant pour le proposer comme une taille/variante
              au moment de l&apos;achat, plutôt que comme un produit indépendant dans le sélecteur.
            </p>
          </div>
        )}

        {/* Zone de dépôt (demande d'Adriel, 01/08/2026 : "je veux une meilleur presentation plus
            pro la zone choissir un fichier") — remplace l'input file brut par un vrai
            dropzone : glisser-déposer ou clic, aperçu carré avec overlay "Remplacer" au survol,
            bouton retirer, état de chargement. Fonctionne dès l'ouverture de la modale "Nouveau
            produit", sans attendre un premier enregistrement (demande d'Adriel, même jour :
            "pourquoi ne pas mettre l'upload sur la creation d'un nouveau produit ?") : form.id
            est toujours généré à l'avance côté client (voir makeId). */}
        <ImageDropzone
          imageUrl={form.imageUrl}
          uploading={uploadingImage}
          onUpload={onUploadImage}
          onRemove={onRemoveImage}
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Actif (visible dans les galeries)
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

/**
 * Zone de dépôt pour l'image d'un produit (demande d'Adriel, 01/08/2026 : "je veux une
 * meilleur presentation plus pro la zone choissir un fichier") — remplace le `<input
 * type="file">` brut par un vrai dropzone : cliquable ET glisser-déposer, aperçu carré en
 * place de l'input une fois une image présente, overlay "Remplacer" au survol, bouton retirer
 * dédié (croix en haut à droite), état de chargement avec spinner par-dessus l'aperçu.
 */
function ImageDropzone({
  imageUrl,
  uploading,
  onUpload,
  onRemove,
}: {
  imageUrl: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function pick(file: File | undefined | null) {
    if (file) onUpload(file);
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium">Image</label>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !uploading) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!uploading) pick(e.dataTransfer.files?.[0]);
        }}
        className={`group relative flex h-32 w-32 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${
          dragOver
            ? "border-brand-500 bg-brand-50"
            : imageUrl
              ? "border-transparent"
              : "border-gray-300 bg-gray-50 hover:border-brand-400 hover:bg-brand-50/50"
        }`}
      >
        {imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 opacity-0 transition-all group-hover:bg-black/55 group-hover:opacity-100">
              <IconUpload className="text-white" />
              <span className="text-xs font-medium text-white">Remplacer</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!uploading) onRemove();
              }}
              aria-label="Retirer l'image"
              title="Retirer l'image"
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
            >
              <IconClose />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-3 text-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <IconUpload />
            </span>
            <span className="text-xs font-medium leading-tight text-gray-600">
              Glisser une image
              <br />
              ou cliquer
            </span>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-white/85">
            <IconSpinner />
            <span className="text-xs font-medium text-gray-600">Envoi...</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={uploading}
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <p className="mt-1.5 text-xs text-gray-500">JPG, PNG ou WEBP — recadrée automatiquement en carré.</p>
    </div>
  );
}

function IconPrinter({ small }: { small?: boolean }) {
  const size = small ? 18 : 22;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 9V3h12v6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 13h12v8H6z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 16h8" strokeLinecap="round" />
    </svg>
  );
}

/** Icône dossier — représente un GROUPE de produits (conteneur de tailles/SKU), distinct de
 * l'imprimante utilisée pour un produit vendable. Chantier "groupe de produits" (02/08/2026). */
function IconFolder({ small }: { small?: boolean }) {
  const size = small ? 18 : 22;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUpload({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M18 3v4h-4M6 21v-4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSpinner() {
  return <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />;
}

/** Icônes de la bascule liste/grille (demande d'Adriel, 02/08/2026 : "peux tu mettres un filtre
 * d'affichage en ligne et en grid") — mêmes tracés que sur /print-selection côté client. */
function IconListView() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
      <circle cx="3.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconGridView() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

/** Icônes ajoutées pour le redesign "pro" de la page catalogue (01/08/2026, demande d'Adriel :
 * "tu es expert en ux, ui et expert en web design, je veux que tu me proposes un design pro de
 * cette page") — boutons de création avec icône, stats avec pictogramme dédié, actions
 * condensées en icônes dans les cartes de la vue grille. */
function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function IconTag({ small }: { small?: boolean }) {
  const size = small ? 14 : 16;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L4 3.24 4 8.83a2 2 0 0 0 .59 1.41l9.59 9.58a2 2 0 0 0 2.82 0l3.59-3.59a2 2 0 0 0 0-2.82Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconPercent({ small }: { small?: boolean }) {
  const size = small ? 14 : 16;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 5 5 19" strokeLinecap="round" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

function IconAlert({ small }: { small?: boolean }) {
  const size = small ? 14 : 16;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 2 20h20L12 3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 10v4" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" strokeLinecap="round" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 20h9" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M3 6h18" strokeLinecap="round" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  );
}
