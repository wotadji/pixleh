import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PixlehLogo } from "@/components/marketing/PixlehLogo";
import { PayInvoiceButton } from "@/components/site/PayInvoiceButton";
import { InvoicePaymentConfirm } from "@/components/site/InvoicePaymentConfirm";
import { ContractInfoBubble } from "@/components/shared/ContractInfoBubble";

export const dynamic = "force-dynamic";

// Paiement en ligne temporairement désactivé (31/07/2026, demande d'Adriel) : tant que Stripe
// Connect n'est pas développé (voir tâche différée jusqu'au lancement de la v1), l'argent d'un
// paiement Stripe Checkout atterrit sur le compte pixleh, pas sur celui du studio — il ne faut
// donc pas proposer de payer en ligne pour l'instant. Le studio renseigne son IBAN une fois
// dans Réglages > Facturation, repris automatiquement ici et dans l'email pour un règlement par
// virement, validé manuellement via "Marquer payée". Remettre à `true` une fois Stripe Connect
// en place pour réafficher le bouton PayInvoiceButton ci-dessous.
const ONLINE_PAYMENT_ENABLED = false;

interface LineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-500",
  SENT: "bg-amber-50 text-amber-700",
  PAID: "bg-green-50 text-green-700",
  OVERDUE: "bg-red-50 text-red-600",
  CANCELLED: "bg-gray-100 text-gray-400",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  SENT: "En attente de paiement",
  PAID: "Payée",
  OVERDUE: "En retard",
  CANCELLED: "Annulée",
};

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

function formatPercent(part: number, total: number | null): string | null {
  if (!total || total <= 0) return null;
  return `${Math.round((part / total) * 100)} %`;
}

/**
 * Page publique de paiement d'une facture — refonte du 31/07/2026 (demande d'Adriel : amener
 * la facturation au même niveau de rigueur/professionnalisme que la page de signature de
 * contrat /c/[id], voir ce fichier pour la mise en page de référence : lettrine minimale,
 * carte de contenu, bandeau vert une fois réglée, bouton de téléchargement PDF). Lit Prisma
 * directement (Server Component) plutôt que de passer par /api/invoices/[id], qui est
 * désormais authentifié — même logique que /c/[id].
 */
export default async function InvoicePage({ params }: { params: { id: string } }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { studio: true, client: true },
  });
  if (!invoice) notFound();

  // notes/amountPaidCents/guestClientName/vatRate/contractId n'existent pas encore dans le
  // Prisma Client généré du sandbox (voir schema.prisma) — lus à part via $queryRaw, même
  // workaround que /c/[id].
  const [row] = await prisma.$queryRaw<
    {
      notes: string | null;
      amountPaidCents: number;
      guestClientName: string | null;
      vatRate: number | null;
      contractId: string | null;
    }[]
  >`
    SELECT notes, "amountPaidCents", "guestClientName", "vatRate", "contractId"
    FROM "Invoice" WHERE id = ${invoice.id}
  `;
  const notes = row?.notes || null;
  const amountPaidCents = row?.amountPaidCents ?? 0;
  const balanceDue = invoice.totalCents - amountPaidCents;
  const guestClientName = row?.guestClientName || null;
  const vatRate = row?.vatRate ?? null;
  const contractId = row?.contractId || null;

  // Infos du contrat lié — demandé par Adriel, 31/07/2026 : une bulle qui rappelle au client
  // qui paie le montant total convenu par contrat et où se situe cette facture dedans (déjà
  // facturé / déjà payé / solde), même agrégation que /dashboard/contracts (billingSummary).
  let contractBubble: { title: string; amountCents: number | null; billedCents: number; paidCents: number } | null =
    null;
  if (contractId) {
    const [contractRow] = await prisma.$queryRaw<
      { title: string; amountCents: number | null }[]
    >`SELECT title, "amountCents" FROM "Contract" WHERE id = ${contractId}`;
    if (contractRow) {
      const linkedInvoices = await prisma.$queryRaw<
        { totalCents: number; amountPaidCents: number; status: string }[]
      >`SELECT "totalCents", "amountPaidCents", status FROM "Invoice" WHERE "contractId" = ${contractId}`;
      const nonCancelled = linkedInvoices.filter((i) => i.status !== "CANCELLED");
      contractBubble = {
        title: contractRow.title,
        amountCents: contractRow.amountCents,
        billedCents: nonCancelled.reduce((sum, i) => sum + i.totalCents, 0),
        paidCents: nonCancelled.reduce((sum, i) => sum + i.amountPaidCents, 0),
      };
    }
  }

  // IBAN/BIC/nom de banque du studio (StudioSettings) — réutilisés automatiquement ici et dans
  // l'email (31/07/2026, demande d'Adriel : ne plus retaper l'IBAN dans les Notes de chaque
  // facture, voir buildBankDetailsBlock dans src/lib/notifications.ts pour la même logique côté
  // email). N'existe pas encore dans le Prisma Client généré du sandbox — lu via $queryRaw.
  const [bankRow] = await prisma.$queryRaw<
    { iban: string | null; bic: string | null; bankName: string | null }[]
  >`SELECT iban, bic, "bankName" FROM "StudioSettings" WHERE "studioId" = ${invoice.studioId}`;
  const bankDetails = bankRow?.iban ? bankRow : null;

  const lineItems = invoice.lineItems as unknown as LineItem[];
  // Sous-total HT dérivé des lignes, TVA affichée = différence avec le total stocké (voir
  // renderInvoicePdf dans src/lib/pdf.tsx pour la même logique) — reste toujours exact par
  // rapport au montant réellement facturé, même en cas d'arrondi.
  const subtotalCents = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const vatAmountCents = invoice.totalCents - subtotalCents;

  const emittedLine = `Émise le ${invoice.createdAt.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}${
    invoice.dueDate
      ? ` · Échéance le ${invoice.dueDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
      : ""
  }`;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="mx-auto max-w-2xl">
          <Link href="/">
            <PixlehLogo size={22} />
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-2xl">
          <InvoicePaymentConfirm invoiceId={invoice.id} />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {invoice.studio.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={invoice.studio.logoUrl}
                  alt={invoice.studio.name}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: invoice.studio.brandColor || "#7c3aed" }}
                >
                  {invoice.studio.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <p className="text-sm text-gray-500">{invoice.studio.name}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[invoice.status]}`}>
              {STATUS_LABELS[invoice.status]}
            </span>
          </div>
          <h1 className="mt-1 flex items-center gap-2 font-serif text-2xl font-semibold text-gray-900">
            Facture {invoice.number}
            {contractBubble && (
              <ContractInfoBubble
                triggerLabel="Voir les informations du contrat lié"
                title={`Contrat « ${contractBubble.title} »`}
                lines={[
                  {
                    label: "Montant total du contrat",
                    value:
                      contractBubble.amountCents != null
                        ? formatMoney(contractBubble.amountCents, invoice.currency)
                        : "Non renseigné",
                  },
                  {
                    label: "Déjà facturé",
                    value: `${formatMoney(contractBubble.billedCents, invoice.currency)}${
                      formatPercent(contractBubble.billedCents, contractBubble.amountCents)
                        ? ` (${formatPercent(contractBubble.billedCents, contractBubble.amountCents)})`
                        : ""
                    }`,
                  },
                  {
                    label: "Déjà payé",
                    value: `${formatMoney(contractBubble.paidCents, invoice.currency)}${
                      formatPercent(contractBubble.paidCents, contractBubble.amountCents)
                        ? ` (${formatPercent(contractBubble.paidCents, contractBubble.amountCents)})`
                        : ""
                    }`,
                  },
                  ...(contractBubble.amountCents != null
                    ? [
                        {
                          label: "Solde restant du contrat",
                          value: formatMoney(
                            Math.max(0, contractBubble.amountCents - contractBubble.paidCents),
                            invoice.currency
                          ),
                          muted: true,
                        },
                      ]
                    : []),
                ]}
              />
            )}
          </h1>
          <p className="mt-2 text-xs text-gray-400">{emittedLine}</p>

          {(invoice.client || guestClientName) && (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-400">Facturé à</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{invoice.client?.name || guestClientName}</p>
              {invoice.client?.email && <p className="text-sm text-gray-500">{invoice.client.email}</p>}
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="grid grid-cols-[1fr_50px_90px_90px] gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-400">
              <span>Description</span>
              <span className="text-center">Qté</span>
              <span className="text-right">Prix unit.</span>
              <span className="text-right">Total</span>
            </div>
            <div className="divide-y divide-gray-100">
              {lineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_50px_90px_90px] gap-2 px-4 py-3 text-sm">
                  <span className="text-gray-700">{item.description}</span>
                  <span className="text-center text-gray-500">{item.quantity}</span>
                  <span className="text-right text-gray-500">{formatMoney(item.unitPriceCents, invoice.currency)}</span>
                  <span className="text-right font-medium text-gray-900">
                    {formatMoney(item.unitPriceCents * item.quantity, invoice.currency)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex justify-end">
                <div className="w-56 space-y-1">
                  {vatRate != null && (
                    <>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Sous-total (HT)</span>
                        <span>{formatMoney(subtotalCents, invoice.currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>TVA ({vatRate}%)</span>
                        <span>{formatMoney(vatAmountCents, invoice.currency)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-base font-semibold text-gray-900">
                    <span>{vatRate != null ? "Total (TTC)" : "Total"}</span>
                    <span>{formatMoney(invoice.totalCents, invoice.currency)}</span>
                  </div>
                  {amountPaidCents > 0 && invoice.status !== "PAID" && (
                    <>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Déjà réglé</span>
                        <span>{formatMoney(amountPaidCents, invoice.currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-medium text-amber-600">
                        <span>Solde dû</span>
                        <span>{formatMoney(balanceDue, invoice.currency)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {notes && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-400">Notes</p>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{notes}</p>
            </div>
          )}

          {bankDetails && invoice.status !== "PAID" && invoice.status !== "CANCELLED" && (
            <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Réglez par virement</p>
              <div className="mt-1.5 space-y-0.5 text-sm text-gray-700">
                <p>
                  IBAN : <span className="font-medium">{bankDetails.iban}</span>
                </p>
                {bankDetails.bic && (
                  <p>
                    BIC : <span className="font-medium">{bankDetails.bic}</span>
                  </p>
                )}
                {bankDetails.bankName && (
                  <p>
                    Banque : <span className="font-medium">{bankDetails.bankName}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {invoice.status === "PAID" ? (
            <div className="mt-6 rounded-xl border border-green-100 bg-green-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-green-800">Facture payée</p>
                  <p className="mt-1 text-sm text-green-700">
                    {invoice.paidAt
                      ? `Réglée le ${invoice.paidAt.toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}.`
                      : "Cette facture a été réglée."}
                  </p>
                </div>
                <a
                  href={`/api/invoices/${invoice.id}/pdf`}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-green-800 shadow-sm hover:bg-green-100"
                >
                  <IconDownload />
                  Télécharger le PDF
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-900">
                  {ONLINE_PAYMENT_ENABLED ? "Paiement" : "Facture"}
                </p>
                <a
                  href={`/api/invoices/${invoice.id}/pdf`}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  <IconDownload />
                  Télécharger le PDF
                </a>
              </div>
              {ONLINE_PAYMENT_ENABLED && invoice.status !== "CANCELLED" && (
                <PayInvoiceButton invoiceId={invoice.id} />
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-gray-100 bg-white px-6 py-6">
        <div className="mx-auto flex max-w-2xl flex-col items-center justify-between gap-3 text-xs text-gray-400 sm:flex-row">
          <p>© {new Date().getFullYear()} pixleh — Groupe Lehwu</p>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
            <Link href="/mentions-legales" target="_blank" className="hover:text-gray-600 hover:underline">
              Mentions légales
            </Link>
            <Link href="/cgu" target="_blank" className="hover:text-gray-600 hover:underline">
              CGU
            </Link>
            <Link href="/cgv" target="_blank" className="hover:text-gray-600 hover:underline">
              CGV
            </Link>
            <Link href="/confidentialite" target="_blank" className="hover:text-gray-600 hover:underline">
              Confidentialité
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function IconDownload() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19h16" strokeLinecap="round" />
    </svg>
  );
}
