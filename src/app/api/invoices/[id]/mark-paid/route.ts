import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { sendStudioInvoicePaidEmail, sendClientInvoicePaidEmail } from "@/lib/notifications";

/**
 * Enregistrement d'un paiement manuel (espèces, virement, chèque...) — en complément du
 * paiement en ligne par carte (voir /api/invoices/[id]/pay, Stripe Checkout). Demandé par
 * Adriel, 31/07/2026 : gérer aussi bien le paiement "à la demande" en ligne que les règlements
 * hors-ligne classiques d'un studio photo. Supporte le paiement partiel (acompte) :
 * `amountCents` s'ADDITIONNE au montant déjà réglé plutôt que de le remplacer, pour permettre
 * plusieurs règlements successifs (acompte puis solde) sans écraser l'historique — voir la doc
 * du champ `amountPaidCents` dans schema.prisma. Le statut ne passe PAID que lorsque le
 * cumulé atteint (ou dépasse) le total.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const existing = await prisma.invoice.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
      include: { client: true, studio: { include: { settings: true } } },
    });
    if (!existing) throw new AccessError("Facture introuvable", 404);
    if (existing.status === "PAID") {
      throw new AccessError("Cette facture est déjà intégralement payée.", 409);
    }

    const body = await req.json();
    const amountCents = Number(body.amountCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }
    const method = typeof body.method === "string" && body.method.trim() ? body.method.trim() : null;

    // amountPaidCents/paymentMethod n'existent pas encore dans le Prisma Client généré du
    // sandbox (voir schema.prisma) — lus/écrits via $queryRaw/$executeRaw, même workaround que
    // les autres champs récents.
    const [row] = await prisma.$queryRaw<{ amountPaidCents: number }[]>`
      SELECT "amountPaidCents" FROM "Invoice" WHERE id = ${existing.id}
    `;
    const newAmountPaid = Math.min((row?.amountPaidCents ?? 0) + amountCents, existing.totalCents);
    const isNowPaid = newAmountPaid >= existing.totalCents;

    await prisma.$executeRaw`
      UPDATE "Invoice"
      SET "amountPaidCents" = ${newAmountPaid}, "paymentMethod" = ${method}
      WHERE id = ${existing.id}
    `;

    const updated = isNowPaid
      ? await prisma.invoice.update({ where: { id: existing.id }, data: { status: "PAID", paidAt: new Date() } })
      : existing;

    if (isNowPaid) {
      // Fire-and-forget, même patron que sendStudioContractSignedEmail : un échec d'envoi ne
      // doit pas faire échouer l'enregistrement du paiement, déjà acté en base à ce stade.
      sendStudioInvoicePaidEmail({
        studioId: existing.studioId,
        invoiceNumber: existing.number,
        clientName: existing.client?.name ?? null,
        totalCents: existing.totalCents,
        currency: existing.currency,
      }).catch((e) => console.error("Échec de la notification de facture payée :", e));

      // Confirmation au client — demandé par Adriel, 31/07/2026 : "quand on clique sur confirmé
      // le paiement il faut faire un send mail au client", y compris pour un règlement manuel
      // (espèces/chèque/virement) enregistré ici par le studio, pas seulement pour le paiement
      // en ligne Stripe (voir markInvoicePaidFromStripe). Uniquement si un client du CRM avec
      // email est rattaché (une facture "à la volée" via guestClientName n'a pas d'email à qui
      // écrire).
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

    return NextResponse.json({
      invoice: updated,
      amountPaidCents: newAmountPaid,
      status: isNowPaid ? "PAID" : existing.status,
    });
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
