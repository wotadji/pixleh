"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PageSpinner } from "@/components/ui/Spinner";

interface ContractDTO {
  id: string;
  title: string;
  status: "DRAFT" | "SENT" | "SIGNED" | "DECLINED";
  createdAt: string;
  client: { name: string } | null;
  archived: boolean;
  amountCents: number | null;
}

interface InvoiceSummary {
  contractId: string | null;
  totalCents: number;
  amountPaidCents: number;
  status: string;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

const PAGE_SIZE = 8;

// Même logique de pastille colorée que OrdersView/ClientOrdersView — cohérence visuelle
// entre les listes du dashboard studio (30/07/2026, redesign demandé par Adriel).
const STATUS_STYLES: Record<ContractDTO["status"], string> = {
  DRAFT: "bg-gray-100 text-gray-500",
  SENT: "bg-amber-50 text-amber-700",
  SIGNED: "bg-green-50 text-green-700",
  DECLINED: "bg-red-50 text-red-600",
};

/** Initiales du client (ex: "Marie Dupont" → "MD") pour l'avatar rond — même helper que
 * OrdersView, pour un rendu identique entre Commandes et Contrats. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

export default function ContractsPage() {
  const { t, locale } = useLanguage();
  const STATUS_LABELS: Record<ContractDTO["status"], string> = {
    DRAFT: t("contractStatus.draft"),
    SENT: t("contractStatus.sent"),
    SIGNED: t("contractStatus.signed"),
    DECLINED: t("contractStatus.declined"),
  };

  const [contracts, setContracts] = useState<ContractDTO[]>([]);
  // Factures liées aux contrats (31/07/2026, demande d'Adriel : suivi facturé/payé par
  // contrat) — récupérées séparément de /api/invoices puis agrégées par contractId, plutôt
  // que d'alourdir GET /api/contracts avec une jointure. cancelled exclu du cumul facturé :
  // une facture annulée ne doit pas compter dans ce qui a été facturé pour le contrat.
  const [invoiceSummaries, setInvoiceSummaries] = useState<InvoiceSummary[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContractDTO["status"] | "ALL">("ALL");
  const [page, setPage] = useState(1);
  // Bascule "Contrats actifs" / "Archivés" (demandé par Adriel, 31/07/2026) : la liste
  // principale ne montre que les contrats non archivés par défaut, les archivés restent
  // consultables via ce bouton plutôt que supprimés.
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/contracts").then((r) => r.json()),
      fetch("/api/invoices").then((r) => r.json()),
    ])
      .then(([contractsData, invoicesData]) => {
        setContracts(contractsData.contracts || []);
        setInvoiceSummaries(
          (invoicesData.invoices || [])
            .filter((i: InvoiceSummary) => i.contractId)
            .map((i: InvoiceSummary) => ({
              contractId: i.contractId,
              totalCents: i.totalCents,
              amountPaidCents: i.amountPaidCents,
              status: i.status,
            }))
        );
      })
      .finally(() => setPageLoading(false));
  }, []);

  /** Cumul facturé/payé pour un contrat donné (voir invoiceSummaries ci-dessus) — les factures
   * CANCELLED sont exclues du cumul. */
  function billingSummary(contractId: string): { billedCents: number; paidCents: number } | null {
    const rows = invoiceSummaries.filter((s) => s.contractId === contractId && s.status !== "CANCELLED");
    if (rows.length === 0) return null;
    return {
      billedCents: rows.reduce((sum, r) => sum + r.totalCents, 0),
      paidCents: rows.reduce((sum, r) => sum + r.amountPaidCents, 0),
    };
  }

  async function toggleArchived(contract: ContractDTO, archived: boolean) {
    setArchiving(contract.id);
    try {
      const res = await fetch(`/api/contracts/${contract.id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (res.ok) {
        setContracts((prev) => prev.map((c) => (c.id === contract.id ? { ...c, archived } : c)));
      }
    } finally {
      setArchiving(null);
    }
  }

  const activeCount = useMemo(() => contracts.filter((c) => !c.archived).length, [contracts]);
  const archivedCount = useMemo(() => contracts.filter((c) => c.archived).length, [contracts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (c.archived !== showArchived) return false;
      const matchesSearch =
        !q || c.title.toLowerCase().includes(q) || (c.client?.name || "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contracts, search, statusFilter, showArchived]);

  // Revenir en page 1 dès que la recherche, le filtre ou l'onglet actif/archivés change
  // (même logique que OrdersView/ClientGalleriesView), sinon on peut se retrouver sur une
  // page qui n'existe plus dans le résultat filtré.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, showArchived]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (pageLoading) return <PageSpinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">{t("contracts.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("contracts.subtitle").replace("{count}", String(activeCount))}
          </p>
        </div>
        <Link href="/dashboard/contracts/new" className="btn-primary">
          {t("contracts.new")}
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
          {t("contracts.activeTab")} ({activeCount})
        </button>
        <button
          type="button"
          onClick={() => setShowArchived(true)}
          className={`flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition sm:flex-none ${
            showArchived ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {t("contracts.archivedTab")} ({archivedCount})
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="w-56 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("contracts.searchPlaceholder")}
            className="input"
          />
        </div>
        <div className="w-44 shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ContractDTO["status"] | "ALL")}
            className="input"
          >
            <option value="ALL">{t("contracts.allStatuses")}</option>
            {(Object.keys(STATUS_LABELS) as ContractDTO["status"][]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-300">
              <IconDoc />
            </div>
            <p className="text-sm text-gray-500">
              {showArchived
                ? archivedCount === 0
                  ? t("contracts.emptyArchived")
                  : t("contracts.emptyFiltered")
                : activeCount === 0
                  ? t("contracts.empty")
                  : t("contracts.emptyFiltered")}
            </p>
          </div>
        )}
        {paginated.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  c.client ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-400"
                }`}
              >
                {c.client ? initials(c.client.name) : <IconDoc small />}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">{c.title}</p>
                <p className="truncate text-sm text-gray-500">
                  {c.client?.name || t("common.noClient")} · {formatDate(c.createdAt, locale)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {c.amountCents !== null &&
                (() => {
                  const billing = billingSummary(c.id);
                  return (
                    <div className="text-right">
                      <p className="font-medium text-gray-900">{formatMoney(c.amountCents!)}</p>
                      {billing && (
                        <p className="text-xs text-gray-400">
                          {t("contracts.billedOf")
                            .replace("{billed}", formatMoney(billing.billedCents))
                            .replace("{paid}", formatMoney(billing.paidCents))}
                        </p>
                      )}
                    </div>
                  );
                })()}
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                {STATUS_LABELS[c.status]}
              </span>
              {c.status !== "SIGNED" && (
                <Link
                  href={`/dashboard/contracts/${c.id}/edit`}
                  className="rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  {t("contracts.edit")}
                </Link>
              )}
              {c.status === "SIGNED" && (
                <>
                  <a
                    href={`/api/contracts/${c.id}/pdf`}
                    className="flex items-center gap-1 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                  >
                    <IconDownload />
                    {t("contracts.download")}
                  </a>
                  <Link
                    href={`/dashboard/invoices/new?contractId=${c.id}`}
                    className="flex items-center gap-1 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                  >
                    <IconInvoiceSmall />
                    {t("contracts.invoice")}
                  </Link>
                </>
              )}
              <Link
                href={`/c/${c.id}`}
                target="_blank"
                className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
              >
                {t("contracts.viewLink")}
              </Link>
              {c.archived ? (
                <button
                  type="button"
                  disabled={archiving === c.id}
                  onClick={() => toggleArchived(c, false)}
                  className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  {archiving === c.id && <IconSpinner />}
                  {archiving === c.id ? t("contracts.unarchiving") : t("contracts.unarchive")}
                </button>
              ) : (
                c.status === "SIGNED" && (
                  <button
                    type="button"
                    disabled={archiving === c.id}
                    onClick={() => toggleArchived(c, true)}
                    className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {archiving === c.id ? <IconSpinner /> : <IconArchive />}
                    {archiving === c.id ? t("contracts.archiving") : t("contracts.archive")}
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="text-gray-600 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40"
          >
            {t("contracts.prevPage")}
          </button>
          <span className="text-gray-500">
            {t("contracts.pageInfo").replace("{page}", String(currentPage)).replace("{total}", String(totalPages))}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="text-gray-600 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40"
          >
            {t("contracts.nextPage")}
          </button>
        </div>
      )}
    </div>
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

/** Petit loader inline affiché dans le bouton Archiver/Désarchiver pendant la requête —
 * demandé par Adriel, 31/07/2026 : le bouton se contentait de griser sans donner de retour
 * visuel clair pendant l'appel réseau. */
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

/** Icône du bouton "Facturer" (lien vers /dashboard/invoices/new?contractId=..., 31/07/2026
 * demandé par Adriel : créer une facture directement liée au contrat depuis sa fiche). */
function IconInvoiceSmall() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h10a1 1 0 0 1 1 1v16l-2.5-1.5L13 20l-2.5-1.5L8 20l-2.5-1.5L3 20V6a1 1 0 0 1 1-1h1" strokeLinejoin="round" />
      <path d="M8 9h8M8 13h8M8 17h4" strokeLinecap="round" />
    </svg>
  );
}

function IconDoc({ small }: { small?: boolean }) {
  const size = small ? 16 : 22;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinejoin="round" />
      <path d="M9 13h6M9 17h6" strokeLinecap="round" />
    </svg>
  );
}
