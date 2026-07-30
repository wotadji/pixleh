import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { renderInvoicePdf } from "@/lib/pdf";
import { isInvoiceTemplateId } from "@/lib/invoiceTemplates";

export const runtime = "nodejs";

/**
 * Aperçu PDF d'une facture en cours de rédaction (bouton "Aperçu du PDF" dans la sidebar du
 * formulaire, voir InvoiceForm.tsx) — même patron que /api/contracts/preview-pdf : ne
 * persiste rien, génère le PDF à la volée à partir des valeurs actuelles du formulaire, avant
 * même l'enregistrement de la facture. Demandé par Adriel, 31/07/2026 : amener la facturation
 * au même niveau de rigueur que les contrats (design du PDF en sidebar + bouton aperçu, déjà
 * fait côté contrats).
 */
export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const body = await req.json();

    const studio = await prisma.studio.findUnique({
      where: { id: session.user.studioId },
      include: { settings: true },
    });
    if (!studio) throw new AccessError("Studio introuvable", 404);

    // Mentions légales du studio (StudioSettings) — pas encore dans le Prisma Client généré du
    // sandbox (voir schema.prisma) — lues à part via $queryRaw.
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
      FROM "StudioSettings" WHERE "studioId" = ${session.user.studioId}
    `;

    let clientName: string | null = null;
    let clientEmail: string | null = null;
    if (typeof body.clientId === "string" && body.clientId) {
      const client = await prisma.client.findUnique({ where: { id: body.clientId } });
      clientName = client?.name || null;
      clientEmail = client?.email || null;
    }

    const lineItems = Array.isArray(body.lineItems)
      ? body.lineItems.map((item: { description?: string; quantity?: number; unitPriceCents?: number }) => ({
          description: typeof item.description === "string" ? item.description : "",
          quantity: typeof item.quantity === "number" ? item.quantity : 0,
          unitPriceCents: typeof item.unitPriceCents === "number" ? item.unitPriceCents : 0,
        }))
      : [];
    const totalCents = lineItems.reduce(
      (sum: number, item: { quantity: number; unitPriceCents: number }) => sum + item.quantity * item.unitPriceCents,
      0
    );

    const pdfBuffer = await renderInvoicePdf({
      studioName: studio.name,
      number: typeof body.number === "string" && body.number ? body.number : "APERÇU",
      clientName,
      clientEmail,
      lineItems,
      totalCents,
      currency: "EUR",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      createdAt: new Date(),
      notes: typeof body.notes === "string" ? body.notes : null,
      studioLogoUrl: studio.logoUrl || null,
      brandColor: studio.brandColor || null,
      studioAddress: studio.settings?.address || null,
      studioContactEmail: studio.settings?.contactEmail || null,
      studioContactPhone: studio.settings?.contactPhone || null,
      studioLegalForm: legalRow?.legalForm || null,
      studioSiret: legalRow?.siret || null,
      studioVatNumber: legalRow?.vatNumber || null,
      studioVatExempt: legalRow?.vatExempt ?? true,
      studioIban: legalRow?.iban || null,
      studioBic: legalRow?.bic || null,
      studioLegalMentions: legalRow?.invoiceLegalMentions || null,
      template: isInvoiceTemplateId(body.template) ? body.template : undefined,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="apercu-facture.pdf"',
      },
    });
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
