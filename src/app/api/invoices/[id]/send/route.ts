import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { sendInvoiceEmail, sendInvoiceReminderEmail } from "@/lib/notifications";
import { fetchStudioBankDetails } from "@/lib/studioBankDetails";

/**
 * (Re)envoi manuel d'une facture au client (bouton "Renvoyer" / "Relancer" sur
 * /dashboard/invoices) — utile si l'envoi automatique à la création a échoué (SMTP en panne,
 * etc.) ou pour relancer un client qui n'a pas encore payé. `{ reminder: true }` dans le corps
 * de la requête envoie le gabarit de relance (sendInvoiceReminderEmail) plutôt que le gabarit
 * de premier envoi.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
      include: { client: true },
    });
    if (!invoice) throw new AccessError("Facture introuvable", 404);
    if (!invoice.client?.email) {
      throw new AccessError("Cette facture n'est rattachée à aucun client avec une adresse email.", 400);
    }

    const studio = await prisma.studio.findUnique({
      where: { id: session.user.studioId },
      include: { settings: true },
    });
    if (!studio) throw new AccessError("Studio introuvable", 404);

    // notes n'existe pas encore dans le Prisma Client généré du sandbox (voir schema.prisma)
    // — lu à part via $queryRaw, même workaround que le reste des champs récents d'Invoice.
    // Repris dans l'email (voir sendInvoiceEmail) pour l'IBAN qu'un studio peut y indiquer en
    // vue d'un paiement par virement (demande d'Adriel, 31/07/2026).
    const [row] = await prisma.$queryRaw<{ notes: string | null }[]>`
      SELECT notes FROM "Invoice" WHERE id = ${invoice.id}
    `;

    const body = await req.json().catch(() => ({}));
    const send = body?.reminder ? sendInvoiceReminderEmail : sendInvoiceEmail;

    const result = await send({
      clientName: invoice.client.name,
      clientEmail: invoice.client.email,
      invoiceNumber: invoice.number,
      invoiceId: invoice.id,
      totalCents: invoice.totalCents,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      studio: { name: studio.name, slug: studio.slug, logoUrl: studio.logoUrl, brandColor: studio.brandColor },
      settings: studio.settings
        ? { contactEmail: studio.settings.contactEmail, contactPhone: studio.settings.contactPhone }
        : null,
      notes: row?.notes ?? null,
      bankDetails: await fetchStudioBankDetails(session.user.studioId),
    });

    if (result.ok) {
      await prisma.$executeRaw`UPDATE "Invoice" SET "sentAt" = ${new Date()} WHERE id = ${invoice.id}`;
    }

    return NextResponse.json({ ok: result.ok, error: result.error });
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
