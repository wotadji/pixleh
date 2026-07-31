"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { ContractInfoBubble } from "@/components/shared/ContractInfoBubble";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";

interface InvoiceDTO {
  id: string;
  number: string;
  status: InvoiceStatus;
  totalCents: number;
  amountPaidCents: number;
  currency: string;
  createdAt: string;
  dueDate: string | null;
  client: { name: string } | null;
  guestClientName: string | null;
  contractId: string | null;
  archived: boolean;
}

// Infos minimales sur les contrats liés — récupérées à part (31/07/2026, demande d'Adriel :
// bulle rappelant le montant total du contrat + le facturé/payé cumulé quand une facture en
// est issue), même agrégation que billingSummary sur /dashboard/contracts.
interface ContractSummary {
  title: string;
  amountCents: number | null;
  billedCents: number;
  paidCents: number;
}

function formatPercent(part: number, total: number | null): string | null {
  if (!total || total <= 0) return null;
  return `${Math.round((part / total) * 100)} %`;
}

const PAGE_SIZE = 8;

// Même logique de pastille colorée que ContractsPage/OrdersView (30/07/2026, refonte
// facturation demandée par Adriel : parité visuelle avec les contrats).
const STATUS_STYLES: Record<InvoiceStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-500",
  SENT: "bg-amber-50 text-amber-700",
  PAID: "bg-green-50 text-green-700",
  OVERDUE: "bg-red-50 text-red-600",
  CANCELLED: "bg-gray-100 text-gray-400",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

export default function InvoicesPage() {
  const { t, locale } = useLanguage();
  const STATUS_LABELS: Record<InvoiceStatus, string> = {
    DRAFT: t("invoiceStatus.draft"),
    SENT: t("invoiceStatus.sent"),
    PAID: t("invoiceStatus.paid"),
    OVERDUE: t("invoiceStatus.overdue"),
    CANCELLED: t("invoiceStatus.cancelled"),
  };

  const [invoices, setInvoices] = useState<InvoiceDTO[]>([]);
  const [contractSummaries, setContractSummaries] = useState<Record<string, ContractSummary>>({});
  const [pageLoading, setPageLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "ALL">("ALL");
  // Filtre par contrat (31/07/2026, demande d'Adriel : "regrouper les factures par contrat")
  // — "ALL" (défaut), "NONE" (factures sans contrat lié), ou l'id d'un contrat précis.
  const [contractFilter, setContractFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<InvoiceDTO | null>(null);

  function load() {
    Promise.all([
      fetch("/api/invoices").then((r) => r.json()),
      fetch("/api/contracts").then((r) => r.json()),
    ])
      .then(([invoicesData, contractsData]) => {
        const allInvoices: InvoiceDTO[] = invoicesData.invoices || [];
        setInvoices(allInvoices);

        // Agrégation facturé/payé par contrat (hors CANCELLED) — même logique que
        // billingSummary sur /dashboard/contracts, pour alimenter la bulle sur l'icône lien.
        const contracts: { id: string; title: string; amountCents: number | null }[] =
          contractsData.contracts || [];
        const summaries: Record<string, ContractSummary> = {};
        for (const c of contracts) {
          const linked = allInvoices.filter((i) => i.contractId === c.id && i.status !== "CANCELLED");
          summaries[c.id] = {
            title: c.title,
            amountCents: c.amountCents,
            billedCents: linked.reduce((sum, i) => sum + i.totalCents, 0),
            paidCents: linked.reduce((sum, i) => sum + i.amountPaidCents, 0),
          };
        }
        setContractSummaries(summaries);
      })
      .finally(() => setPageLoading(false));
  }

  useEffect(load, []);

  async function toggleArchived(invoice: InvoiceDTO, archived: boolean) {
    setArchiving(invoice.id);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (res.ok) {
        setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, archived } : i)));
      }
    } finally {
      setArchiving(null);
    }
  }

  async function resend(invoice: InvoiceDTO) {
    setSending(invoice.id);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminder: invoice.status === "SENT" || invoice.status === "OVERDUE" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) alert(data?.error || t("invoices.sendError"));
    } finally {
      setSending(null);
    }
  }

  const activeCount = useMemo(() => invoices.filter((i) => !i.archived).length, [invoices]);
  const archivedCount = useMemo(() => invoices.filter((i) => i.archived).length, [invoices]);

  // Contrats à proposer dans le filtre : uniquement ceux ayant au moins une facture, triés
  // par nom (évite de lister des contrats sans rapport avec les factures affichées ici).
  const contractOptions = useMemo(() => {
    const ids = new Set(invoices.map((i) => i.contractId).filter((id): id is string => !!id));
    return Array.from(ids)
      .map((id) => ({ id, title: contractSummaries[id]?.title || id }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [invoices, contractSummaries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((i) => {
      if (i.archived !== showArchived) return false;
      const matchesSearch =
        !q ||
        i.number.toLowerCase().includes(q) ||
        (i.client?.name || i.guestClientName || "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "ALL" || i.status === statusFilter;
      const matchesContract =
        contractFilter === "ALL" ||
        (contractFilter === "NONE" ? !i.contractId : i.contractId === contractFilter);
      return matchesSearch && matchesStatus && matchesContract;
    });
  }, [invoices, search, statusFilter, contractFilter, showArchived]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, contractFilter, showArchived]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (pageLoading) return <PageSpinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">{t("invoices.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("invoices.subtitle").replace("{count}", String(activeCount))}
          </p>
        </div>
        <Link href="/dashboard/invoices/new" className="btn-primary">
          {t("invoices.new")}
        </Link>
      </div>

      <div className="mt-5 flex gap-1 rounded-lg bg-gray-100 p-1 sm:w-fit">
        <button
          type="button"
          onClick={() => setShowArchived(false)}
          className={`flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition sm:flex-none ${
            !showArchived ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {t("invoices.activeTab")} ({activeCount})
        </button>
        <button
          type="button"
          onClick={() => setShowArchived(true)}
          className={`flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition sm:flex-none ${
            showArchived ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {t("invoices.archivedTab")} ({archivedCount})
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="w-56 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("invoices.searchPlaceholder")}
            className="input"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {contractOptions.length > 0 && (
            <div className="w-52 shrink-0">
              <SearchableSelect
                value={contractFilter}
                onChange={setContractFilter}
                placeholder={t("invoices.allContracts")}
                searchPlaceholder={t("common.searchPlaceholder")}
                options={[
                  { value: "ALL", label: t("invoices.allContracts") },
                  { value: "NONE", label: t("invoices.noContractFilter") },
                  ...contractOptions.map((c) => ({ value: c.id, label: c.title })),
                ]}
              />
            </div>
          )}
          <div className="w-44 shrink-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | "ALL")}
              className="input"
            >
              <option value="ALL">{t("invoices.allStatuses")}</option>
              {(Object.keys(STATUS_LABELS) as InvoiceStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-300">
              <IconInvoice />
            </div>
            <p className="text-sm text-gray-500">
              {showArchived
                ? archivedCount === 0
                  ? t("invoices.emptyArchived")
                  : t("invoices.emptyFiltered")
                : activeCount === 0
                  ? t("invoices.empty")
                  : t("invoices.emptyFiltered")}
            </p>
          </div>
        )}
        {paginated.map((inv) => {
          const isPartial = inv.amountPaidCents > 0 && inv.amountPaidCents < inv.totalCents;
          return (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    inv.client || inv.guestClientName ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {inv.client?.name || inv.guestClientName ? (
                    initials(inv.client?.name || inv.guestClientName!)
                  ) : (
                    <IconInvoice small />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium text-gray-900">
                    {inv.number}
                    {inv.contractId &&
                      (contractSummaries[inv.contractId] ? (
                        <ContractInfoBubble
                          triggerLabel={t("invoices.linkedToContract")}
                          title={contractSummaries[inv.contractId].title}
                          lines={[
                            {
                              label: t("invoices.contractTotal"),
                              value:
                                contractSummaries[inv.contractId].amountCents != null
                                  ? formatMoney(contractSummaries[inv.contractId].amountCents!, inv.currency)
                                  : t("invoices.contractAmountUnset"),
                            },
                            {
                              label: t("invoices.contractBilled"),
                              value: `${formatMoney(contractSummaries[inv.contractId].billedCents, inv.currency)}${
                                formatPercent(
                                  contractSummaries[inv.contractId].billedCents,
                                  contractSummaries[inv.contractId].amountCents
                                )
                                  ? ` (${formatPercent(
                                      contractSummaries[inv.contractId].billedCents,
                                      contractSummaries[inv.contractId].amountCents
                                    )})`
                                  : ""
                              }`,
                            },
                            {
                              label: t("invoices.contractPaid"),
                              value: `${formatMoney(contractSummaries[inv.contractId].paidCents, inv.currency)}${
                                formatPercent(
                                  contractSummaries[inv.contractId].paidCents,
                                  contractSummaries[inv.contractId].amountCents
                                )
                                  ? ` (${formatPercent(
                                      contractSummaries[inv.contractId].paidCents,
                                      contractSummaries[inv.contractId].amountCents
                                    )})`
                                  : ""
                              }`,
                            },
                          ]}
                        />
                      ) : (
                        <span title={t("invoices.linkedToContract")} className="text-gray-400">
                          <IconLink />
                        </span>
                      ))}
                  </p>
                  <p className="truncate text-sm text-gray-500">
                    {inv.client?.name || inv.guestClientName || t("common.noClient")} · {formatDate(inv.createdAt, locale)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <div className="text-right">
                  <p className="font-medium text-gray-900">{formatMoney(inv.totalCents, inv.currency)}</p>
                  {isPartial && (
                    <p className="text-xs text-amber-600">
                      {t("invoices.paidOf")
                        .replace("{paid}", formatMoney(inv.amountPaidCents, inv.currency))
                        .replace("{total}", formatMoney(inv.totalCents, inv.currency))}
                    </p>
                  )}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[inv.status]}`}>
                  {STATUS_LABELS[inv.status]}
                </span>
                {inv.status !== "PAID" && (
                  <Link
                    href={`/dashboard/invoices/${inv.id}/edit`}
                    className="rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                  >
                    {t("invoices.edit")}
                  </Link>
                )}
                <a
                  href={`/api/invoices/${inv.id}/pdf`}
                  className="flex items-center gap-1 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  <IconDownload />
                  {t("invoices.download")}
                </a>
                <Link
                  href={`/i/${inv.id}`}
                  target="_blank"
                  className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                >
                  {t("invoices.viewLink")}
                </Link>
                {inv.status !== "PAID" && inv.status !== "CANCELLED" && (
                  <button
                    type="button"
                    onClick={() => setMarkPaidTarget(inv)}
                    className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                  >
                    {t("invoices.markPaid")}
                  </button>
                )}
                {inv.client && inv.status !== "PAID" && (
                  <button
                    type="button"
                    disabled={sending === inv.id}
                    onClick={() => resend(inv)}
                    className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {sending === inv.id && <IconSpinner />}
                    {sending === inv.id ? t("invoices.sending") : t("invoices.resend")}
                  </button>
                )}
                {inv.archived ? (
                  <button
                    type="button"
                    disabled={archiving === inv.id}
                    onClick={() => toggleArchived(inv, false)}
                    className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {archiving === inv.id && <IconSpinner />}
                    {archiving === inv.id ? t("invoices.unarchiving") : t("invoices.unarchive")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={archiving === inv.id}
                    onClick={() => toggleArchived(inv, true)}
                    className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {archiving === inv.id ? <IconSpinner /> : <IconArchive />}
                    {archiving === inv.id ? t("invoices.archiving") : t("invoices.archive")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="text-gray-600 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40"
          >
            {t("invoices.prevPage")}
          </button>
          <span className="text-gray-500">
            {t("invoices.pageInfo").replace("{page}", String(currentPage)).replace("{total}", String(totalPages))}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="text-gray-600 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40"
          >
            {t("invoices.nextPage")}
          </button>
        </div>
      )}

      <MarkPaidModal invoice={markPaidTarget} onClose={() => setMarkPaidTarget(null)} onDone={load} />
    </div>
  );
}

/**
 * Enregistrement d'un paiement manuel (espèces, virement, chèque...) — demandé par Adriel,
 * 31/07/2026 : gérer aussi bien le paiement en ligne (Stripe, voir /i/[id]) que les
 * règlements hors-ligne classiques. Supporte le paiement partiel (acompte + solde) : le
 * montant saisi s'ajoute au montant déjà réglé (voir POST /api/invoices/[id]/mark-paid).
 */
function MarkPaidModal({
  invoice,
  onClose,
  onDone,
}: {
  invoice: InvoiceDTO | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (invoice) {
      const remaining = (invoice.totalCents - invoice.amountPaidCents) / 100;
      setAmount(remaining.toFixed(2));
      setMethod("");
    }
  }, [invoice]);

  if (!invoice) return null;
  const remainingCents = invoice.totalCents - invoice.amountPaidCents;

  async function handleConfirm() {
    if (!invoice) return;
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      alert(t("invoices.invalidAmount"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, method: method || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || t("common.error"));
        return;
      }
      onDone();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      title={t("invoices.markPaidTitle").replace("{number}", invoice.number)}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            {t("invoiceForm.cancel")}
          </button>
          <button type="button" onClick={handleConfirm} disabled={submitting} className="btn-primary text-sm">
            {submitting ? t("common.saving") : t("invoices.markPaidConfirm")}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          {t("invoices.remainingDue")} : <strong>{formatMoney(remainingCents, invoice.currency)}</strong>
        </p>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("invoices.amountPaid")}</label>
          <input
            type="number"
            step="0.01"
            min={0}
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">{t("invoices.paymentMethod")}</label>
          {/* Boutons rapides (31/07/2026, demande d'Adriel) : "Marquer payée" sert aussi bien
              à valider un virement bancaire (le studio vérifie son compte puis confirme ici)
              qu'un paiement en espèces ou par chèque — ces raccourcis rendent ces trois cas
              d'usage explicites plutôt que de dépendre uniquement de la saisie libre. */}
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {[t("invoices.methodCash"), t("invoices.methodCheck"), t("invoices.methodTransfer")].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setMethod(preset)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  method === preset
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            className="input"
            placeholder={t("invoices.paymentMethodPlaceholder")}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

function IconDownload() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19h16" strokeLinecap="round" />
    </svg>
  );
}

function IconSpinner() {
  return <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />;
}

function IconArchive() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16" strokeLinecap="round" />
      <path d="M5 7v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7" strokeLinejoin="round" />
      <rect x="3" y="4" width="18" height="3" rx="1" />
      <path d="M10 12h4" strokeLinecap="round" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 15l6-6" strokeLinecap="round" />
      <path d="M11 5.5l1-1a3.5 3.5 0 0 1 5 5l-1 1" strokeLinecap="round" />
      <path d="M13 18.5l-1 1a3.5 3.5 0 0 1-5-5l1-1" strokeLinecap="round" />
    </svg>
  );
}

function IconInvoice({ small }: { small?: boolean }) {
  const size = small ? 16 : 22;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h10a1 1 0 0 1 1 1v16l-2.5-1.5L13 20l-2.5-1.5L8 20l-2.5-1.5L3 20V6a1 1 0 0 1 1-1h1" strokeLinejoin="round" />
      <path d="M8 9h8M8 13h8M8 17h4" strokeLinecap="round" />
    </svg>
  );
}
