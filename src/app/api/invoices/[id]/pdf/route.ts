import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderInvoicePdf } from "@/lib/pdf";
import { isInvoiceTemplateId } from "@/lib/invoiceTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

/**
 * Téléchargement du PDF d'une facture — généré à la volée à chaque appel plutôt que stocké.
 * Contrairement au contrat signé (figé une fois signé, voir /api/contracts/[id]/pdf qui sert
 * un fichier stocké à la signature), une facture reste modifiable tant qu'elle n'est pas payée
 * (voir PATCH /api/invoices/[id]) : un PDF généré et stocké à la création deviendrait vite
 * obsolète après une édition. Accessible sans authentification, comme le PDF de contrat :
 * l'identifiant (cuid non devinable) fait office de jeton d'accès, utilisé aussi bien par le
 * studio (dashboard) que par le client (page publique /i/[id]).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { studio: true, client: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  }

  try {
    // notes/amountPaidCents/template n'existent pas encore dans le Prisma Client généré du
    // sandbox (voir schema.prisma) — lus à part via $queryRaw, même workaround que pour les
    // contrats.
    const [row] = await prisma.$queryRaw<
      { notes: string | null; amountPaidCents: number; template: string | null }[]
    >`SELECT notes, "amountPaidCents", template FROM "Invoice" WHERE id = ${invoice.id}`;

    // Mentions légales du studio (StudioSettings) — idem, pas encore dans le Prisma Client
    // généré du sandbox.
    const [legalRow] = await prisma.$queryRaw<
      {
        legalForm: string | null;
        siret: string | null;
        vatNumber: string | null;
        vatExempt: boolean | null;
        iban: string | null;
        bic: string | null;
        invoiceLegalMentions: string | null;
      }[]
    >`
      SELECT "legalForm", siret, "vatNumber", "vatExempt", iban, bic, "invoiceLegalMentions"
      FROM "StudioSettings" WHERE "studioId" = ${invoice.studioId}
    `;

    const lineItems = invoice.lineItems as unknown as LineItem[];

    const pdfBuffer = await renderInvoicePdf({
      studioName: invoice.studio.name,
      number: invoice.number,
      clientName: invoice.client?.name || null,
      clientEmail: invoice.client?.email || null,
      lineItems,
      totalCents: invoice.totalCents,
      amountPaidCents: row?.amountPaidCents ?? 0,
      paidAt: invoice.paidAt,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      createdAt: invoice.createdAt,
      notes: row?.notes || null,
      studioLogoUrl: invoice.studio.logoUrl || null,
      brandColor: invoice.studio.brandColor || null,
      studioLegalForm: legalRow?.legalForm || null,
      studioSiret: legalRow?.siret || null,
      studioVatNumber: legalRow?.vatNumber || null,
      studioVatExempt: legalRow?.vatExempt ?? true,
      studioIban: legalRow?.iban || null,
      studioBic: legalRow?.bic || null,
      studioLegalMentions: legalRow?.invoiceLegalMentions || null,
      template: isInvoiceTemplateId(row?.template ?? null) ? (row!.template as string) : undefined,
    });

    const filename = `Facture_${invoice.number.replace(/[^\w\-]+/g, "_")}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erreur lors de la génération du PDF" }, { status: 500 });
  }
}
