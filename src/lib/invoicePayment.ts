import { prisma } from "@/lib/prisma";
import { sendStudioInvoicePaidEmail, sendClientInvoicePaidEmail } from "@/lib/notifications";

/**
 * Marque une facture comme payée suite à un paiement en ligne Stripe réussi — factorisé pour
 * être appelé à la fois par le webhook (/api/webhooks/stripe, la source de vérité) et par le
 * filet de sécurité côté client (/api/invoices/[id]/confirm-payment), qui vérifie directement
 * auprès de Stripe au retour du client sur /i/[id] plutôt que d'attendre le webhook — celui-ci
 * ne peut pas atteindre un serveur en développement local (localhost) sans tunnel (Stripe CLI
 * `stripe listen`), et peut aussi arriver en retard en production. Même patron que
 * syncSubscriptionFromStripe / /api/billing/confirm-checkout pour les abonnements de plan
 * (demandé par Adriel, 31/07/2026, suite au constat qu'un client revenant sur la page de
 * paiement après un règlement réussi pouvait encore voir "en attente de paiement").
 *
 * Idempotent : si la facture est déjà PAID (l'un des deux chemins — webhook ou filet de
 * sécurité — est arrivé en premier), ne fait rien et ne renvoie pas d'email en double.
 */
export async function markInvoicePaidFromStripe(invoiceId: string): Promise<void> {
  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, studio: { include: { settings: true } } },
  });
  if (!existing || existing.status === "PAID") return;

  await prisma.invoice.update({
    where: { id: existing.id },
    data: { status: "PAID", paidAt: new Date() },
  });
  // amountPaidCents n'existe pas encore dans le Prisma Client généré du sandbox (voir
  // schema.prisma) — écrit à part via $executeRaw. Un paiement Stripe Checkout est toujours
  // intégral (pas de paiement partiel en ligne, contrairement au règlement manuel via
  // /api/invoices/[id]/mark-paid) : on aligne donc amountPaidCents sur le total.
  await prisma.$executeRaw`UPDATE "Invoice" SET "amountPaidCents" = ${existing.totalCents} WHERE id = ${existing.id}`;

  // Fire-and-forget, même patron que les autres notifications de paiement : un échec d'envoi
  // ne doit jamais faire échouer la confirmation du paiement, déjà actée en base à ce stade.
  sendStudioInvoicePaidEmail({
    studioId: existing.studioId,
    invoiceNumber: existing.number,
    clientName: existing.client?.name ?? null,
    totalCents: existing.totalCents,
    currency: existing.currency,
  }).catch((e) => console.error("Échec de la notification (studio) de facture payée :", e));

  // Confirmation au client — uniquement pour ce chemin (paiement en ligne, voir la doc
  // ci-dessus) et seulement si un client du CRM avec email est rattaché (une facture "à la
  // volée" sans fiche CRM, voir Invoice.guestClientName, n'a pas d'email à qui écrire).
  if (existing.client?.email) {
    sendClientInvoicePaidEmail({
      clientEmail: existing.client.email,
      clientName: existing.client.name,
      invoiceId: existing.id,
      invoiceNumber: existing.number,
      totalCents: existing.totalCents,
      currency: existing.currency,
      studio: {
        name: existing.studio.name,
        slug: existing.studio.slug,
        logoUrl: existing.studio.logoUrl,
        brandColor: existing.studio.brandColor,
      },
      settings: existing.studio.settings
        ? {
            contactEmail: existing.studio.settings.contactEmail,
            contactPhone: existing.studio.settings.contactPhone,
          }
        : null,
    }).catch((e) => console.error("Échec de la confirmation de paiement (client) :", e));
  }
}
