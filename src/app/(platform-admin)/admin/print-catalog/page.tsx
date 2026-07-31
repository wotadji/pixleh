"use client";

import { useEffect, useState } from "react";
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
}

interface FormState {
  id?: string;
  name: string;
  description: string;
  price: string;
  sku: string;
  imageUrl: string;
  active: boolean;
  wholesaleCost: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  price: "0",
  sku: "",
  imageUrl: "",
  active: true,
  wholesaleCost: "",
};

function toCents(euros: string) {
  return Math.round(parseFloat(euros.replace(",", ".") || "0") * 100);
}

function fromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

function itemToForm(item: PrintCatalogItemDTO): FormState {
  return {
    id: item.id,
    name: item.name,
    description: item.description || "",
    price: fromCents(item.priceCents),
    sku: item.sku || "",
    imageUrl: item.imageUrl || "",
    active: item.active,
    wholesaleCost: item.wholesaleCostCents != null ? fromCents(item.wholesaleCostCents) : "",
  };
}

/**
 * Catalogue impression plateforme — service pixleh (fulfillment via Prodigi), pas les
 * studios : demande d'Adriel, 31/07/2026, "je veux que Boutique — Produits soit géré dans le
 * panel Administrateur [...] c'est un service de pixleh pas du studio". Le prix de vente
 * (priceCents) reste TOUJOURS fixé manuellement par Adriel ; le coût de revient Prodigi
 * (wholesaleCostCents) n'est qu'une indication pour l'aider à décider de sa marge, jamais
 * recalculé automatiquement dans priceCents.
 */
export default function AdminPrintCatalogPage() {
  const [items, setItems] = useState<PrintCatalogItemDTO[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prodigiWarning, setProdigiWarning] = useState<string | null>(null);

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
    setForm(EMPTY_FORM);
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
      const res = await fetch(form.id ? `/api/admin/print-catalog/${form.id}` : "/api/admin/print-catalog", {
        method: form.id ? "PATCH" : "POST",
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

  async function resync(item: PrintCatalogItemDTO) {
    setResyncing(true);
    const res = await fetch(`/api/admin/print-catalog/${item.id}/quote`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (data.prodigiSync && data.prodigiSync.synced === false) {
      setProdigiWarning(data.prodigiSync.error || "Synchronisation Prodigi indisponible.");
    } else {
      setProdigiWarning(null);
    }
    await loadItems();
    setResyncing(false);
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

  if (!items) return <PageSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between">
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

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Le SKU correspond au SKU Prodigi (ex: <code>GLOBAL-CAN-10x10</code>) — renseigne-le pour pouvoir
        resynchroniser le coût de revient réel. Le prix de vente reste toujours fixé ici à la main, avec
        ta marge par-dessus.
      </div>

      {prodigiWarning && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>Synchronisation Prodigi : {prodigiWarning} (PRODIGI_API_KEY à configurer dans .env).</span>
          <button onClick={() => setProdigiWarning(null)} className="shrink-0 text-amber-500 hover:text-amber-700">
            ✕
          </button>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-gray-500">Aucun produit pour le moment — crée le premier.</p>
        )}
        {items.map((item) => {
          const marginCents = item.wholesaleCostCents != null ? item.priceCents - item.wholesaleCostCents : null;
          return (
            <div
              key={item.id}
              className={`card flex items-center justify-between ${!item.active ? "opacity-50" : ""}`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{item.name}</p>
                  {!item.active && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Désactivé</span>
                  )}
                  {!item.sku && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                      Sans SKU Prodigi
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {fromCents(item.priceCents)}€ vendu
                  {item.wholesaleCostCents != null && (
                    <>
                      {" "}
                      · {fromCents(item.wholesaleCostCents)}€ coût Prodigi
                      {marginCents != null && ` · ${fromCents(marginCents)}€ de marge`}
                    </>
                  )}
                  {item.sku && ` · SKU ${item.sku}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {item.sku && (
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    disabled={resyncing}
                    onClick={() => resync(item)}
                  >
                    Resynchroniser
                  </button>
                )}
                <button type="button" className="btn-secondary text-sm" onClick={() => openEdit(item)}>
                  Modifier
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  onClick={() => remove(item)}
                >
                  Supprimer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? "Modifier le produit" : "Nouveau produit"}
        widthClassName="max-w-2xl"
        footer={
          <>
            <button type="button" className="btn-secondary text-sm" onClick={() => setModalOpen(false)}>
              Annuler
            </button>
            <button type="button" className="btn-primary text-sm" disabled={saving} onClick={save}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Nom</label>
            <input
              className="input"
              placeholder="Impression 10x15"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

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

          <div>
            <label className="mb-1 block text-sm font-medium">SKU Prodigi</label>
            <input
              className="input"
              placeholder="GLOBAL-CAN-10x10"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Image (URL)</label>
            <input
              className="input"
              placeholder="https://..."
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />
          </div>

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
    </div>
  );
}
