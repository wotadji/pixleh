import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { invoiceSchema } from "@/lib/validators";
import { isInvoiceTemplateId } from "@/lib/invoiceTemplates";

/**
 * Consultation authentifiée d'une facture côté studio (pré-remplissage du formulaire
 * d'édition, voir invoices/[id]/edit) — même patron que GET /api/contracts/[id]. La page
 * publique de paiement (/i/[id]) ne passe pas par cette route : elle lit directement Prisma
 * côté serveur (Server Component, voir src/app/i/[id]/page.tsx), sans authentification —
 * refonte facturation du 31/07/2026 demandée par Adriel (avant cette date, cette route GET
 * était elle-même publique et non authentifiée : ce n'est plus le cas).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
      include: { client: true },
    });
    if (!invoice) throw new AccessError("Facture introuvable", 404);

    // contractId/notes/amountPaidCents/paymentMethod/template/archived/sentAt n'existent pas
    // encore dans le Prisma Client généré du sandbox (voir schema.prisma) — lus à part via
    // $queryRaw, même workaround que pour les contrats.
    const [row] = await prisma.$queryRaw<
      {
        contractId: string | null;
        notes: string | null;
        amountPaidCents: number;
        paymentMethod: string | null;
        template: string;
        archived: boolean;
        sentAt: Date | null;
      }[]
    >`
      SELECT "contractId", notes, "amountPaidCents", "paymentMethod", template, archived, "sentAt"
      FROM "Invoice" WHERE id = ${invoice.id}
    `;

    return NextResponse.json({
      invoice: {
        ...invoice,
        contractId: row?.contractId ?? null,
        notes: row?.notes ?? null,
        amountPaidCents: row?.amountPaidCents ?? 0,
        paymentMethod: row?.paymentMethod ?? null,
        template: row?.template ?? "classic",
        archived: row?.archived ?? false,
        sentAt: row?.sentAt ?? null,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * Modification d'une facture après création — bloquée une fois PAID (même logique que
 * PATCH /api/contracts/[id] bloqué une fois SIGNED) : une fois réglée, la facture fait foi
 * telle quelle. Modifiable tant qu'elle est DRAFT/SENT/OVERDUE/CANCELLED.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const existing = await prisma.invoice.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!existing) throw new AccessError("Facture introuvable", 404);
    if (existing.status === "PAID") {
      throw new AccessError("Cette facture est déjà payée, elle ne peut plus être modifiée.", 409);
    }

    const body = await req.json();
    const parsed = invoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;
    const totalCents = data.lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0
    );

    const invoice = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        clientId: data.clientId || null,
        lineItems: data.lineItems,
        totalCents,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });

    // contractId/notes/template n'existent pas encore dans le Prisma Client généré du sandbox
    // (voir schema.prisma) — écrits à part via $executeRaw. `!== undefined` (et pas juste
    // "truthy") pour permettre explicitement de retirer une valeur existante.
    if (body.contractId !== undefined) {
      await prisma.$executeRaw`UPDATE "Invoice" SET "contractId" = ${body.contractId || null} WHERE id = ${invoice.id}`;
    }
    if (body.notes !== undefined) {
      await prisma.$executeRaw`UPDATE "Invoice" SET notes = ${body.notes || null} WHERE id = ${invoice.id}`;
    }
    if (isInvoiceTemplateId(body.template)) {
      await prisma.$executeRaw`UPDATE "Invoice" SET template = ${body.template} WHERE id = ${invoice.id}`;
    }

    return NextResponse.json({ invoice });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
