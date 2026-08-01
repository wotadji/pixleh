"use client";

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
    const active = items.filter((i) => i.active);
    const withMargin = items.filter((i) => i.wholesaleCostCents != null);
    const avgMarginPct =
      withMargin.length > 0
        ? withMargin.reduce(
            (sum, i) => sum + ((i.priceCents - (i.wholesaleCostCents ?? 0)) / Math.max(i.priceCents, 1)) * 100,
            0
          ) / withMargin.length
        : null;
    const avgPrice = items.length > 0 ? items.reduce((sum, i) => sum + i.priceCents, 0) / items.length : 0;
    const noSku = items.filter((i) => !i.sku).length;
    return {
      total: items.length,
      active: active.length,
      avgPrice,
      avgMarginPct,
      noSku,
    };
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const matchesSearch = !q || i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && i.active) ||
        (statusFilter === "INACTIVE" && !i.active) ||
        (statusFilter === "NO_SKU" && !i.sku);
      return matchesSearch && matchesStatus;
    });
  }, [items, search, statusFilter]);

  if (!items || !stats) return <PageSpinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Catalogue impression</h1>
          <p className="mt-1 text-sm text-gray-500">
            Produits d&apos;impression physique (tirages, toiles...) proposés dans toutes les galeries.
            Fulfillment via Prodigi — le paiement va directement à pixleh, les studios n&apos;en gèrent
            plus le prix.
          </p>
        </div>
        <button type="button" className="btn-primary shrink-0" onClick={openCreate}>
          + Nouveau produit
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Produits actifs" value={`${stats.active} / ${stats.total}`} />
        <StatCard label="Prix de vente moyen" value={formatMoney(stats.avgPrice)} />
        <StatCard
          label="Marge moyenne"
          value={stats.avgMarginPct != null ? `${Math.round(stats.avgMarginPct)} %` : "—"}
          tone={
            stats.avgMarginPct == null ? undefined : stats.avgMarginPct < 20 ? "amber" : "green"
          }
        />
        <StatCard
          label="Sans SKU Prodigi"
          value={String(stats.noSku)}
          tone={stats.noSku > 0 ? "amber" : undefined}
        />
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Le SKU correspond au SKU Prodigi (ex: <code>GLOBAL-CAN-10x10</code>) — renseigne-le pour pouvoir
        resynchroniser le coût de revient réel. Le prix de vente reste toujours fixé ici à la main, avec
        ta marge par-dessus.
      </div>

      {prodigiWarning && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="break-words">Synchronisation Prodigi : {prodigiWarning}</span>
          <button onClick={() => setProdigiWarning(null)} className="shrink-0 text-amber-500 hover:text-amber-700">
            ✕
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="w-56 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (nom, SKU)"
            className="input"
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

      <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
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
        {filtered.map((item) => {
          const marginCents = item.wholesaleCostCents != null ? item.priceCents - item.wholesaleCostCents : null;
          const tone = marginCents != null ? marginTone(marginCents, item.priceCents) : null;
          return (
            <div
              key={item.id}
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
                    <IconPrinter small />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 truncate font-medium text-gray-900">
                    {item.name}
                    {!item.active && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        Désactivé
                      </span>
                    )}
                    {!item.sku && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Sans SKU Prodigi
                      </span>
                    )}
                    {/* Badge attributs sélectionnables (demande d'Adriel, 02/08/2026 : "je veux
                        construire une vraie UI de sélection d'attribut au moment de l'achat")
                        — visible dès que "Resynchroniser" a chargé au moins un attribut (ex:
                        couleur de cadre) : c'est ce qui active le sélecteur côté client. */}
                    {Object.keys(parseAttributeOptions(item.prodigiAttributeOptions)).length > 0 && (
                      <span
                        className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
                        title={Object.entries(parseAttributeOptions(item.prodigiAttributeOptions))
                          .map(([name, values]) => `${name}: ${values.join(", ")}`)
                          .join(" · ")}
                      >
                        {Object.keys(parseAttributeOptions(item.prodigiAttributeOptions)).length} attribut
                        {Object.keys(parseAttributeOptions(item.prodigiAttributeOptions)).length > 1 ? "s" : ""}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-gray-500">
                    {item.sku ? <code className="text-gray-600">{item.sku}</code> : item.description || "—"}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <div className="text-right">
                  <p className="font-medium text-gray-900">{formatMoney(item.priceCents)}</p>
                  <p className="text-xs text-gray-400">
                    {item.wholesaleCostCents != null ? `coût ${formatMoney(item.wholesaleCostCents)}` : "coût inconnu"}
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
                  onClick={() => toggleActive(item)}
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
                    onClick={() => resync(item)}
                    className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {resyncing === item.id ? <IconSpinner /> : <IconRefresh />}
                    {resyncing === item.id ? "Synchronisation..." : "Resynchroniser"}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                  onClick={() => openEdit(item)}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                  onClick={() => remove(item)}
                >
                  Supprimer
                </button>
              </div>
            </div>
          );
        })}
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
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber" | "green";
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold ${
          tone === "amber" ? "text-amber-600" : tone === "green" ? "text-green-600" : "text-gray-900"
        }`}
      >
        {value}
      </p>
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
}) {
  const priceCents = toCents(form.price);
  const costCents = form.wholesaleCost.trim() ? toCents(form.wholesaleCost) : null;
  const marginCents = costCents != null ? priceCents - costCents : null;
  const marginPct = marginCents != null && priceCents > 0 ? Math.round((marginCents / priceCents) * 100) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={form.persisted ? "Modifier le produit" : "Nouveau produit"}
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
              <IconPrinter />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-sm font-medium">Nom</label>
            <input
              className="input"
              placeholder="Impression 10x15"
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

        <div>
          <label className="mb-1 block text-sm font-medium">SKU Prodigi</label>
          <input
            className="input"
            placeholder="GLOBAL-CAN-10x10"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
          />
        </div>

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
