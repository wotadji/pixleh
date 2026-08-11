"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { INVOICE_TEMPLATE_IDS, DEFAULT_INVOICE_TEMPLATE, type InvoiceTemplateId } from "@/lib/invoiceTemplates";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

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
  // Nom libre du client, utilisé uniquement quand clientId est vide (31/07/2026, demande
  // d'Adriel : permettre une facture "à la volée" sans fiche CRM) — voir invoiceSchema côté
  // serveur (superRefine) pour la validation associée.
  guestClientName: string;
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
  studioVatExempt,
  studioVatRate,
  initial,
  submitLabel,
  submittingLabel,
  submitting,
  onSubmit,
}: {
  clients: ClientOption[];
  contracts: ContractOption[];
  studioBrandColor?: string | null;
  /** TVA du studio (StudioSettings.vatExempt/vatRate, voir Réglages > Facturation) —
   * 31/07/2026, demande d'Adriel : "je veux que la TVA dans paramètre soit configurée et que
   * dans la création d'un contrat ou d'une facture cela soit appliqué sans modification". Le
   * studio n'a plus la main pour l'activer/désactiver ou changer le taux depuis ce formulaire :
   * ces deux props ne pilotent qu'un récapitulatif en lecture seule, la valeur réelle appliquée
   * est toujours recalculée côté serveur (voir src/lib/studioVat.ts) au moment de
   * l'enregistrement, jamais envoyée par le client. */
  studioVatExempt: boolean;
  studioVatRate: number | null;
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

  // Sous-total HT dérivé des lignes ; la TVA appliquée n'est plus un choix du formulaire
  // (verrouillée sur Réglages > Facturation, voir studioVatExempt/studioVatRate ci-dessus et
  // src/lib/studioVat.ts côté serveur) — ce récapitulatif est purement informatif, le montant
  // réel enregistré est toujours recalculé côté serveur au moment de l'enregistrement.
  const applyVat = !studioVatExempt && studioVatRate != null;
  const subtotal = form.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const vatAmount = applyVat ? Math.round(subtotal * (studioVatRate! / 100)) : 0;
  const total = subtotal + vatAmount;

  // Filtre les contrats du client sélectionné en tête de liste (les autres restent
  // accessibles, un studio peut vouloir facturer un contrat sans avoir d'abord choisi le
  // client dans le formulaire) — évite de forcer un ordre de remplissage strict.
  const sortedContracts = [...contracts].sort((a, b) => {
    const aMatch = a.clientId === form.clientId ? 0 : 1;
    const bMatch = b.clientId === form.clientId ? 0 : 1;
    return aMatch - bMatch;
  });

  // Nettoie les champs interdépendants avant envoi : sans client CRM, pas de contrat lié
  // possible (voir invoiceSchema.superRefine côté serveur). Utilisé pour onSubmit — les pages
  // new/edit se chargent ensuite de traduire ces valeurs en corps de requête API (dont le
  // taux de TVA transmis uniquement si applyVat est coché, voir handleSubmit des pages).
  function buildPayload(cleaned: InvoiceLineItem[]): InvoiceFormValues {
    return {
      ...form,
      lineItems: cleaned,
      guestClientName: !form.clientId ? form.guestClientName.trim() : "",
      contractId: form.clientId ? form.contractId : "",
    };
  }

  // Corps de requête pour /api/invoices/preview-pdf — même conversion que les pages new/edit
  // (voir handleSubmit dans invoices/new/page.tsx et invoices/[id]/edit/page.tsx) : un taux de
  // TVA à 0 explicite afficherait à tort une ligne "TVA (0%)" dans l'aperçu, d'où le null ici
  // quand la case n'est pas cochée.
  function buildPreviewBody(cleaned: InvoiceLineItem[]) {
    return {
      ...form,
      lineItems: cleaned,
      guestClientName: !form.clientId ? form.guestClientName.trim() || null : null,
      contractId: form.clientId ? form.contractId || null : null,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = form.lineItems.filter((i) => i.description.trim());
    if (cleaned.length === 0) {
      alert(t("invoiceForm.lineRequired"));
      return;
    }
    if (!form.clientId && !form.guestClientName.trim()) {
      alert(t("invoiceForm.guestNameRequired"));
      return;
    }
    onSubmit(buildPayload(cleaned));
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
        body: JSON.stringify(buildPreviewBody(cleaned)),
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
            <SearchableSelect
              value={form.clientId}
              onChange={(clientId) => {
                // Sans client CRM, un contrat lié n'a plus de sens (voir superRefine côté
                // serveur) — on efface donc contractId dès qu'on repasse sur "Aucun client".
                setForm({ ...form, clientId, contractId: clientId ? form.contractId : "" });
              }}
              placeholder={t("common.noClientOption")}
              searchPlaceholder={t("common.searchPlaceholder")}
              emptyOptionLabel={t("common.noClientOption")}
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>

          {!form.clientId && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t("invoiceForm.guestNameLabel")}
              </label>
              <input
                type="text"
                required
                className="input"
                placeholder={t("invoiceForm.guestNamePlaceholder")}
                value={form.guestClientName}
                onChange={(e) => setForm({ ...form, guestClientName: e.target.value })}
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("invoiceForm.contractLabel")}</label>
            {form.clientId ? (
              <SearchableSelect
                value={form.contractId}
                onChange={(contractId) => setForm({ ...form, contractId })}
                placeholder={t("invoiceForm.noContractOption")}
                searchPlaceholder={t("common.searchPlaceholder")}
                emptyOptionLabel={t("invoiceForm.noContractOption")}
                options={sortedContracts.map((c) => ({ value: c.id, label: c.title }))}
              />
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <IconWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>{t("invoiceForm.contractRequiresClient")}</span>
              </div>
            )}
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
            <div className="hidden gap-2 bg-gray-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 sm:grid sm:grid-cols-[1fr_70px_100px_100px_32px]">
              <span>{t("invoiceForm.description")}</span>
              <span className="text-center">{t("invoiceForm.quantity")}</span>
              <span className="text-right">{t("invoiceForm.unitPrice")}</span>
              <span className="text-right">{t("invoiceForm.lineTotal")}</span>
              <span />
            </div>
            <div className="divide-y divide-gray-100">
              {form.lineItems.map((item, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 px-3 py-3 sm:grid sm:grid-cols-[1fr_70px_100px_100px_32px] sm:items-center sm:gap-2 sm:py-2"
                >
                  <div>
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400 sm:hidden">
                      {t("invoiceForm.description")}
                    </span>
                    <input
                      placeholder={t("invoiceForm.descriptionPlaceholder")}
                      className="input"
                      value={item.description}
                      onChange={(e) => updateItem(i, { description: e.target.value })}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400 sm:hidden">
                      {t("invoiceForm.quantity")}
                    </span>
                    <input
                      type="number"
                      min={1}
                      className="input text-center"
                      value={item.quantity}
                      onChange={(e) => updateItem(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400 sm:hidden">
                      {t("invoiceForm.unitPrice")}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      className="input text-right"
                      value={item.unitPriceCents / 100}
                      onChange={(e) => updateItem(i, { unitPriceCents: Math.round(Number(e.target.value) * 100) })}
                    />
                  </div>
                  <div className="flex items-center justify-between pt-4 sm:block sm:pb-0">
                    <span className="text-xs font-medium uppercase tracking-wide text-gray-400 sm:hidden">
                      {t("invoiceForm.lineTotal")}
                    </span>
                    <p className="text-right text-sm font-medium text-gray-700">
                      {formatMoney(item.quantity * item.unitPriceCents)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    disabled={form.lineItems.length <= 1}
                    className="flex h-7 w-7 items-center justify-center self-end rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30 sm:self-auto"
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

          <div className="mt-3 border-t border-gray-100 pt-3">
            <p className="flex items-start gap-1.5 text-xs text-gray-400">
              <IconInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {applyVat
                  ? t("invoiceForm.vatAutoAppliedNote").replace("{rate}", String(studioVatRate))
                  : t("invoiceForm.vatExemptNote")}{" "}
                <Link href="/dashboard/settings?tab=billing" className="text-brand-600 hover:underline">
                  {t("invoiceForm.vatSettingsLink")}
                </Link>
              </span>
            </p>

            <div className="mt-3 flex flex-col items-end gap-1">
              {applyVat && (
                <>
                  <p className="text-sm text-gray-600">
                    {t("invoiceForm.subtotalHt")} : {formatMoney(subtotal)} €
                  </p>
                  <p className="text-sm text-gray-600">
                    {t("invoiceForm.vatAmount")} ({studioVatRate}%) : {formatMoney(vatAmount)} €
                  </p>
                </>
              )}
              <p className="text-base font-semibold text-gray-900">
                {applyVat ? t("invoiceForm.totalTtc") : t("invoiceForm.total")} : {formatMoney(total)} €
              </p>
            </div>
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
          <p className="mt-1.5 text-xs text-gray-400">
            {t("invoiceForm.notesIbanHint")}{" "}
            <Link href="/dashboard/settings?tab=billing" className="text-brand-600 hover:underline">
              {t("invoiceForm.notesIbanHintLink")}
            </Link>
          </p>
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

function IconWarning({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 9v4" strokeLinecap="round" />
      <path d="M12 16.5h.01" strokeLinecap="round" />
      <path
        d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconInfo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" strokeLinecap="round" />
      <path d="M12 8h.01" strokeLinecap="round" />
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
