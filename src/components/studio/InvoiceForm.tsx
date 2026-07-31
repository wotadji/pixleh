"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { INVOICE_TEMPLATE_IDS, DEFAULT_INVOICE_TEMPLATE, type InvoiceTemplateId } from "@/lib/invoiceTemplates";

interface ClientOption {
  id: string;
  name: string;
}

interface ContractOption {
  id: string;
  title: string;
  clientId: string | null;
  amountCents: number | null;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface InvoiceFormValues {
  clientId: string;
  contractId: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  notes: string;
  template: InvoiceTemplateId;
}

/** Aperçu miniature (CSS pur) de chaque template — même composant que ContractForm.tsx
 * (TemplatePreview), dupliqué ici plutôt que partagé : les deux formulaires vivent dans des
 * fichiers différents et ce composant est trop petit pour justifier un fichier partagé de plus
 * (30/07/2026, refonte facturation demandée par Adriel : même système de templates que les
 * contrats). */
function TemplatePreview({ id, accent }: { id: InvoiceTemplateId; accent: string }) {
  if (id === "minimal") {
    return (
      <div className="flex h-12 w-16 shrink-0 flex-col justify-center gap-1 rounded-md bg-gray-50 p-1.5">
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-sm bg-gray-300" />
          <div className="h-0.5 w-6 rounded-sm bg-gray-300" />
        </div>
        <div className="h-1 w-2/3 rounded-sm bg-gray-700" />
        <div className="h-px w-full bg-gray-200" />
      </div>
    );
  }
  if (id === "elegant") {
    return (
      <div className="flex h-12 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-gray-300 bg-gray-50 p-1">
        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        <div className="h-1 w-1/2 rounded-sm bg-gray-700" />
      </div>
    );
  }
  return (
    <div className="flex h-12 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-md bg-gray-50 p-1.5">
      <div className="flex items-center gap-1 self-start">
        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        <div className="h-0.5 w-6 rounded-sm bg-gray-300" />
      </div>
      <div className="h-1 w-2/3 rounded-sm bg-gray-700" />
      <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: accent }} />
    </div>
  );
}

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formulaire de facture partagé entre la création (invoices/new) et la modification
 * (invoices/[id]/edit) — même structure que ContractForm.tsx (carte principale + sidebar
 * design/aperçu PDF), demandé par Adriel le 31/07/2026 : "amener la facturation au même
 * niveau de rigueur que les contrats". Deux façons de créer une facture, comme demandé :
 * "à la demande" (contractId vide) ou rattachée à un contrat (contractId pré-rempli via
 * ?contractId= sur la page /new, voir le bouton "Facturer" sur /dashboard/contracts).
 */
export function InvoiceForm({
  clients,
  contracts,
  studioBrandColor,
  initial,
  submitLabel,
  submittingLabel,
  submitting,
  onSubmit,
}: {
  clients: ClientOption[];
  contracts: ContractOption[];
  studioBrandColor?: string | null;
  initial: InvoiceFormValues;
  submitLabel: string;
  submittingLabel: string;
  submitting: boolean;
  onSubmit: (values: InvoiceFormValues) => void;
}) {
  const { t } = useLanguage();
  const accent = studioBrandColor || "#7c3aed";
  const [form, setForm] = useState<InvoiceFormValues>({
    ...initial,
    template: initial.template || DEFAULT_INVOICE_TEMPLATE,
  });
  const [previewLoading, setPreviewLoading] = useState(false);

  function updateItem(i: number, patch: Partial<InvoiceLineItem>) {
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.map((item, idx) => (idx === i ? { ...item, ...patch } : item)),
    }));
  }

  function removeItem(i: number) {
    setForm((f) => ({ ...f, lineItems: f.lineItems.filter((_, idx) => idx !== i) }));
  }

  function addItem() {
    setForm((f) => ({ ...f, lineItems: [...f.lineItems, { description: "", quantity: 1, unitPriceCents: 0 }] }));
  }

  const total = form.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);

  // Filtre les contrats du client sélectionné en tête de liste (les autres restent
  // accessibles, un studio peut vouloir facturer un contrat sans avoir d'abord choisi le
  // client dans le formulaire) — évite de forcer un ordre de remplissage strict.
  const sortedContracts = [...contracts].sort((a, b) => {
    const aMatch = a.clientId === form.clientId ? 0 : 1;
    const bMatch = b.clientId === form.clientId ? 0 : 1;
    return aMatch - bMatch;
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = form.lineItems.filter((i) => i.description.trim());
    if (cleaned.length === 0) {
      alert(t("invoiceForm.lineRequired"));
      return;
    }
    onSubmit({ ...form, lineItems: cleaned });
  }

  /** Aperçu PDF de la facture en cours de rédaction, sans rien enregistrer — même patron que
   * ContractForm.handlePreview (voir POST /api/invoices/preview-pdf). */
  async function handlePreview() {
    const cleaned = form.lineItems.filter((i) => i.description.trim());
    if (cleaned.length === 0) {
      alert(t("invoiceForm.lineRequired"));
      return;
    }
    const previewTab = window.open("", "_blank");
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/invoices/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, lineItems: cleaned }),
      });
      if (!res.ok) {
        previewTab?.close();
        alert(t("common.error"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (previewTab) previewTab.location.href = url;
      else window.open(url, "_blank");
    } catch {
      previewTab?.close();
      alert(t("common.error"));
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("invoiceForm.clientLabel")}</label>
            <select
              className="input"
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
            >
              <option value="">{t("common.noClientOption")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("invoiceForm.contractLabel")}</label>
            <select
              className="input"
              value={form.contractId}
              onChange={(e) => setForm({ ...form, contractId: e.target.value })}
            >
              <option value="">{t("invoiceForm.noContractOption")}</option>
              {sortedContracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("invoiceForm.dueDate")}</label>
            <input
              type="date"
              className="input"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("invoiceForm.lineItemsLabel")}</label>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="grid grid-cols-[1fr_70px_100px_100px_32px] gap-2 bg-gray-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              <span>{t("invoiceForm.description")}</span>
              <span className="text-center">{t("invoiceForm.quantity")}</span>
              <span className="text-right">{t("invoiceForm.unitPrice")}</span>
              <span className="text-right">{t("invoiceForm.lineTotal")}</span>
              <span />
            </div>
            <div className="divide-y divide-gray-100">
              {form.lineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_100px_100px_32px] items-center gap-2 px-3 py-2">
                  <input
                    placeholder={t("invoiceForm.descriptionPlaceholder")}
                    className="input"
                    value={item.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                  />
                  <input
                    type="number"
                    min={1}
                    className="input text-center"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    className="input text-right"
                    value={item.unitPriceCents / 100}
                    onChange={(e) => updateItem(i, { unitPriceCents: Math.round(Number(e.target.value) * 100) })}
                  />
                  <p className="text-right text-sm font-medium text-gray-700">
                    {formatMoney(item.quantity * item.unitPriceCents)}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    disabled={form.lineItems.length <= 1}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
                    aria-label={t("invoiceForm.removeLine")}
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <button type="button" onClick={addItem} className="btn-secondary mt-2 text-sm">
            + {t("invoiceForm.addLine")}
          </button>

          <div className="mt-3 flex justify-end border-t border-gray-100 pt-3">
            <p className="text-base font-semibold text-gray-900">
              {t("invoiceForm.total")} : {formatMoney(total)} €
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("invoiceForm.notesLabel")}</label>
          <textarea
            className="input min-h-[90px]"
            placeholder={t("invoiceForm.notesPlaceholder")}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <Link href="/dashboard/invoices" className="text-sm text-gray-600 hover:text-gray-900">
            {t("invoiceForm.cancel")}
          </Link>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? submittingLabel : submitLabel}
          </button>
        </div>
      </div>

      <div className="h-fit space-y-6">
        <aside className="rounded-xl border border-gray-200 bg-gray-50 p-6">
          <h2 className="text-sm font-semibold text-gray-900">{t("invoiceForm.templateLabel")}</h2>
          <div className="mt-3 space-y-2">
            {INVOICE_TEMPLATE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setForm({ ...form, template: id })}
                className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition ${
                  form.template === id
                    ? "border-brand-500 bg-white ring-2 ring-brand-100"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <TemplatePreview id={id} accent={accent} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900">{t(`invoiceTemplate.${id}.name`)}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-gray-500">
                    {t(`invoiceTemplate.${id}.description`)}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewLoading}
            className="btn-secondary mt-4 w-full text-sm"
          >
            {previewLoading ? t("invoiceForm.previewLoading") : t("invoiceForm.previewButton")}
          </button>
        </aside>

        <aside className="rounded-xl border border-gray-200 bg-gray-50 p-6">
          <h2 className="text-sm font-semibold text-gray-900">{t("invoiceForm.howItWorksTitle")}</h2>
          <ol className="mt-4 space-y-4">
            {[t("invoiceForm.step1"), t("invoiceForm.step2"), t("invoiceForm.step3")].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-gray-600">{step}</p>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </form>
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
