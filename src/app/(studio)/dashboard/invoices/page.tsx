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

// Nombre de factures par page configurable — demande d'Adriel le 12/08/2026, même pattern
// que /dashboard/contracts et /dashboard/guests.
const PAGE_SIZE_OPTIONS = [8, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 8;

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
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<InvoiceDTO | null>(null);
  // Regroupement par contrat + modale de détail (montant à payer, facturé/payé, tableau des
  // factures payées) — demande d'Adriel le 12/08/2026 : "un bouton avec une icône zoom [...]
  // les informations sur la somme à payer (contrat), un tableau des factures payées [...]
  // regrouper les factures par contrat". La pagination habituelle n'a pas de sens combinée au
  // regroupement (les groupes sont par contrat, pas par nombre de lignes) : en mode groupé, on
  // affiche tout `filtered` sans découpage par page.
  const [groupByContract, setGroupByContract] = useState(false);
  const [contractDetailId, setContractDetailId] = useState<string | null>(null);

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
  }, [search, statusFilter, contractFilter, showArchived, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Groupes par contrat (mode "Regrouper par contrat") — construits à partir de `filtered`
  // (pas `paginated`) pour ne rien laisser de côté. Clé "NONE" pour les factures sans contrat
  // lié, toujours affichée en dernier. Tri des contrats par titre, comme le filtre.
  const grouped = useMemo(() => {
    if (!groupByContract) return null;
    const map = new Map<string, InvoiceDTO[]>();
    for (const inv of filtered) {
      const key = inv.contractId || "NONE";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "NONE") return 1;
      if (b === "NONE") return -1;
      return (contractSummaries[a]?.title || a).localeCompare(contractSummaries[b]?.title || b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupByContract, filtered, contractSummaries]);

  // Rendu d'une ligne facture — factorisé pour être réutilisé en vue liste (paginée) et en vue
  // groupée par contrat, sans dupliquer tout le balisage (boutons d'action, statut...).
  function renderInvoiceRow(inv: InvoiceDTO) {
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
                  <>
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
                    {/* Bouton zoom : ouvre la modale complète (montant à payer, facturé/payé,
                        tableau des factures payées du contrat) — demande d'Adriel, 12/08/2026,
                        en complément de la bulle ci-dessus qui reste un aperçu rapide au clic. */}
                    <button
                      type="button"
                      onClick={() => setContractDetailId(inv.contractId)}
                      title={t("invoices.contractDetails")}
                      aria-label={t("invoices.contractDetails")}
                      className="flex h-4 w-4 items-center justify-center rounded-full text-gray-400 transition hover:text-brand-600"
                    >
                      <IconZoom />
                    </button>
                  </>
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
        {/* ml-auto + pas de shrink-0 : même correctif que /dashboard/contracts
            (12/08/2026) — shrink-0 empêchait ce bloc de se réduire à la largeur de
            l'écran une fois seul sur sa ligne (flex-wrap du parent), donc son propre
            flex-wrap ne se déclenchait jamais et tous les boutons (Télécharger,
            Marquer payée, Renvoyer, Archiver...) restaient sur une seule ligne trop
            large, provoquant un défilement horizontal de toute la page. */}
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
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
  }

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

      {/* Sur mobile : chaque contrôle prend toute la largeur et s'empile (flex-col) au lieu
          de se tasser côte à côte — demande d'Adriel, 12/08/2026 ("que ça occupe toute la
          zone en largeur, surtout bien aligné"). À partir de sm, on repasse à la disposition
          en ligne avec des largeurs fixes comme avant. */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="w-full sm:w-56 sm:shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("invoices.searchPlaceholder")}
            className="input"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {contractOptions.length > 0 && (
            <div className="w-full sm:w-52 sm:shrink-0">
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
          {/* select natif remplacé par un rendu appearance-none + flèche custom (même icône que
              SearchableSelect) — demande d'Adriel, 12/08/2026 : la flèche du select natif du
              navigateur n'était pas alignée avec celle de SearchableSelect ("Tous les
              contrats") juste au-dessus, chaque navigateur la positionnant différemment. */}
          <div className="relative w-full sm:w-44 sm:shrink-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | "ALL")}
              className="input appearance-none pr-8"
            >
              <option value="ALL">{t("invoices.allStatuses")}</option>
              {(Object.keys(STATUS_LABELS) as InvoiceStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
        {/* Regrouper par contrat (gauche) + nombre par page (droite) sur une même ligne, y
            compris sur mobile — demande d'Adriel, 12/08/2026 ("mettre regrouper par contrat à
            gauche et page à droite"). Même hauteur/padding (py-2) que les autres selects pour
            que les flèches des menus déroulants restent alignées entre elles. Le sélecteur de
            page est sans objet en vue groupée (pas de découpage par page), donc masqué dans ce
            mode. */}
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:ml-auto">
          <button
            type="button"
            onClick={() => setGroupByContract((g) => !g)}
            disabled={contractOptions.length === 0}
            title={t("invoices.groupByContract")}
            className={`flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              groupByContract
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            <IconGroup />
            <span>{t("invoices.groupByContract")}</span>
          </button>
          {!groupByContract && (
            <label className="flex shrink-0 items-center gap-2 text-sm text-gray-600">
              {t("invoices.perPage")}
              <div className="relative">
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="input w-auto appearance-none pr-8"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <IconChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              </div>
            </label>
          )}
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
        {!groupByContract && paginated.map((inv) => renderInvoiceRow(inv))}
        {groupByContract &&
          grouped &&
          grouped.map(([key, group]) => (
            <div key={key}>
              {/* En-tête de groupe : titre du contrat (ou "Sans contrat"), bouton zoom vers la
                  modale de détail, nombre de factures dans le groupe. */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-gray-700">
                    {key === "NONE" ? t("invoices.ungroupedContract") : contractSummaries[key]?.title || key}
                  </p>
                  {key !== "NONE" && contractSummaries[key] && (
                    <button
                      type="button"
                      onClick={() => setContractDetailId(key)}
                      title={t("invoices.contractDetails")}
                      aria-label={t("invoices.contractDetails")}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:text-brand-600"
                    >
                      <IconZoom />
                    </button>
                  )}
                </div>
                <span className="shrink-0 text-xs text-gray-400">
                  {t("invoices.groupCount").replace("{count}", String(group.length))}
                </span>
              </div>
              <div className="divide-y divide-gray-100">{group.map((inv) => renderInvoiceRow(inv))}</div>
            </div>
          ))}
      </div>

      {!groupByContract && filtered.length > 0 && (
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
      <ContractDetailModal
        contractId={contractDetailId}
        summary={contractDetailId ? contractSummaries[contractDetailId] || null : null}
        invoices={invoices}
        locale={locale}
        onClose={() => setContractDetailId(null)}
      />
    </div>
  );
}

/**
 * Modale de détail d'un contrat (montant à payer, cumul facturé/payé, tableau des factures
 * payées) — demandé par Adriel, 12/08/2026 : "un bouton avec une icône zoom [...] les
 * informations sur la somme à payer (contrat), un tableau des factures payées". Ouverte via
 * IconZoom depuis une ligne facture liée à un contrat ou depuis l'en-tête d'un groupe (vue
 * "Regrouper par contrat"). Réutilise ContractSummary (déjà calculé pour ContractInfoBubble) —
 * pas de nouvel appel réseau.
 */
function ContractDetailModal({
  contractId,
  summary,
  invoices,
  locale,
  onClose,
}: {
  contractId: string | null;
  summary: ContractSummary | null;
  invoices: InvoiceDTO[];
  locale: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  if (!contractId || !summary) return null;

  const linkedInvoices = invoices.filter((i) => i.contractId === contractId);
  const currency = linkedInvoices[0]?.currency || "EUR";
  const paidInvoices = linkedInvoices
    .filter((i) => i.status === "PAID")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const remainingCents = summary.amountCents != null ? Math.max(0, summary.amountCents - summary.paidCents) : null;

  return (
    <Modal
      open={!!contractId}
      onClose={onClose}
      title={summary.title}
      footer={
        <button type="button" onClick={onClose} className="btn-secondary text-sm">
          {t("common.close")}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">{t("invoices.contractTotal")}</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">
              {summary.amountCents != null ? formatMoney(summary.amountCents, currency) : t("invoices.contractAmountUnset")}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">{t("invoices.contractBilled")}</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">{formatMoney(summary.billedCents, currency)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">{t("invoices.contractPaid")}</p>
            <p className="mt-0.5 text-sm font-semibold text-green-700">{formatMoney(summary.paidCents, currency)}</p>
          </div>
        </div>
        {remainingCents != null && remainingCents > 0 && (
          <p className="text-sm text-gray-600">
            {t("invoices.remainingDue")} : <strong className="text-gray-900">{formatMoney(remainingCents, currency)}</strong>
          </p>
        )}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t("invoices.paidInvoicesTable")}
          </p>
          {paidInvoices.length === 0 ? (
            <p className="text-sm text-gray-400">{t("invoices.noPaidInvoices")}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2">{t("invoices.colNumber")}</th>
                    <th className="px-3 py-2">{t("invoices.colDate")}</th>
                    <th className="px-3 py-2 text-right">{t("invoices.colAmount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paidInvoices.map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-2 font-medium text-gray-900">{i.number}</td>
                      <td className="px-3 py-2 text-gray-500">{formatDate(i.createdAt, locale)}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {formatMoney(i.totalCents, i.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
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

function IconZoom() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

function IconGroup() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 3 8l9 5 9-5-9-5Z" strokeLinejoin="round" />
      <path d="M3 12l9 5 9-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 16l9 5 9-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Même tracé que IconChevron de SearchableSelect — utilisée pour remplacer la flèche native des
   <select> restants de cette page afin qu'elle s'aligne visuellement avec SearchableSelect
   (demande d'Adriel, 12/08/2026). */
function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
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
