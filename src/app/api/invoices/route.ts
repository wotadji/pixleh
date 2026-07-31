import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";
import { invoiceSchema } from "@/lib/validators";
import { sendInvoiceEmail } from "@/lib/notifications";
import { isInvoiceTemplateId } from "@/lib/invoiceTemplates";
import { fetchStudioBankDetails } from "@/lib/studioBankDetails";
import { resolveStudioVatRate } from "@/lib/studioVat";

/**
 * Liste des factures du studio — refonte du 31/07/2026 (demande d'Adriel : amener la
 * facturation au même niveau de rigueur que les contrats). contractId/notes/amountPaidCents/
 * paymentMethod/template/archived/sentAt n'existent pas encore dans le Prisma Client généré du
 * sandbox (voir schema.prisma) : lus à part via $queryRaw et fusionnés dans la liste typée,
 * même workaround que pour /api/contracts.
 */
export async function GET() {
  try {
    const session = await requireStudioSession();
    const invoices = await prisma.invoice.findMany({
      where: { studioId: session.user.studioId },
      include: { client: true },
      orderBy: { createdAt: "desc" },
    });

    const extraRows = await prisma.$queryRaw<
      {
        id: string;
        contractId: string | null;
        notes: string | null;
        amountPaidCents: number;
        paymentMethod: string | null;
        template: string;
        archived: boolean;
        sentAt: Date | null;
        guestClientName: string | null;
        vatRate: number | null;
      }[]
    >`
      SELECT id, "contractId", notes, "amountPaidCents", "paymentMethod", template, archived, "sentAt",
        "guestClientName", "vatRate"
      FROM "Invoice" WHERE "studioId" = ${session.user.studioId}
    `;
    const extraById = new Map(extraRows.map((r) => [r.id, r]));

    const withExtra = invoices.map((inv) => {
      const extra = extraById.get(inv.id);
      return {
        ...inv,
        contractId: extra?.contractId ?? null,
        notes: extra?.notes ?? null,
        amountPaidCents: extra?.amountPaidCents ?? 0,
        paymentMethod: extra?.paymentMethod ?? null,
        template: extra?.template ?? "classic",
        archived: extra?.archived ?? false,
        sentAt: extra?.sentAt ?? null,
        guestClientName: extra?.guestClientName ?? null,
        vatRate: extra?.vatRate ?? null,
      };
    });

    return NextResponse.json({ invoices: withExtra });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const body = await req.json();
    const parsed = invoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    // Un contrat ne peut être lié à une facture que s'il est signé par le studio ET par le
    // client (demande d'Adriel, 31/07/2026) : avant signature, le montant/les conditions
    // peuvent encore changer, facturer dessus n'a pas de sens. Déjà appliqué côté UI (le
    // bouton "Facturer" et le sélecteur de contrat de InvoiceForm ne proposent que les
    // contrats SIGNED), vérifié ici aussi côté serveur en défense en profondeur.
    if (data.contractId) {
      const contract = await prisma.contract.findFirst({
        where: { id: data.contractId, studioId: session.user.studioId },
      });
      if (!contract) {
        return NextResponse.json({ error: "Contrat introuvable." }, { status: 400 });
      }
      if (contract.status !== "SIGNED") {
        return NextResponse.json(
          { error: "Ce contrat doit être signé par le studio et le client avant de pouvoir y lier une facture." },
          { status: 400 }
        );
      }
    }

    const studio = await prisma.studio.findUnique({
      where: { id: session.user.studioId },
      include: { settings: true },
    });
    if (!studio) throw new AccessError("Studio introuvable", 404);

    // Numérotation : préfixe personnalisable (StudioSettings.invoiceNumberPrefix, voir
    // Réglages > Facturation), "FAC" par défaut. Champ pas encore dans le Prisma Client généré
    // du sandbox (voir schema.prisma) — lu à part via $queryRaw, même workaround que les
    // autres champs récents de StudioSettings.
    const [settingsRow] = await prisma.$queryRaw<{ invoiceNumberPrefix: string | null }[]>`
      SELECT "invoiceNumberPrefix" FROM "StudioSettings" WHERE "studioId" = ${session.user.studioId}
    `;
    const prefix = settingsRow?.invoiceNumberPrefix || "FAC";
    const year = new Date().getFullYear();
    const countThisYear = await prisma.invoice.count({
      where: { studioId: session.user.studioId, number: { startsWith: `${prefix}-${year}-` } },
    });
    const number = `${prefix}-${year}-${String(countThisYear + 1).padStart(4, "0")}`;

    // Sous-total HT : toujours dérivé des lineItems (source de vérité unique, voir
    // schema.prisma sur Invoice.totalCents). Le taux de TVA n'est PLUS choisi par le studio à
    // la création (case "Appliquer la TVA" supprimée de InvoiceForm, 31/07/2026, demande
    // d'Adriel : "je veux que la TVA dans paramètre soit configurée et que [...] cela soit
    // appliqué sans modification") — il est dérivé uniquement de StudioSettings.vatExempt/
    // vatRate, toute valeur envoyée par le client est ignorée.
    const vatRate = await resolveStudioVatRate(session.user.studioId);
    const subtotalCents = data.lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0
    );
    const totalCents = vatRate != null ? Math.round(subtotalCents * (1 + vatRate / 100)) : subtotalCents;

    const invoice = await prisma.invoice.create({
      data: {
        studioId: session.user.studioId,
        clientId: data.clientId || null,
        number,
        status: "SENT",
        lineItems: data.lineItems,
        totalCents,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });

    // contractId/notes/template/sentAt/guestClientName/vatRate n'existent pas encore dans le
    // Prisma Client généré du sandbox (voir schema.prisma) — écrits à part via $executeRaw,
    // même workaround que pour les contrats (studioSignatureDataUrl/place/template).
    if (data.contractId) {
      await prisma.$executeRaw`UPDATE "Invoice" SET "contractId" = ${data.contractId} WHERE id = ${invoice.id}`;
    }
    if (data.notes) {
      await prisma.$executeRaw`UPDATE "Invoice" SET notes = ${data.notes} WHERE id = ${invoice.id}`;
    }
    if (isInvoiceTemplateId(data.template)) {
      await prisma.$executeRaw`UPDATE "Invoice" SET template = ${data.template} WHERE id = ${invoice.id}`;
    }
    // Nom libre du client (facture "à la volée" sans fiche CRM) — seulement pertinent quand
    // aucun clientId n'est défini, voir invoiceSchema.superRefine.
    if (!data.clientId && data.guestClientName) {
      await prisma.$executeRaw`UPDATE "Invoice" SET "guestClientName" = ${data.guestClientName} WHERE id = ${invoice.id}`;
    }
    if (vatRate != null) {
      await prisma.$executeRaw`UPDATE "Invoice" SET "vatRate" = ${vatRate} WHERE id = ${invoice.id}`;
    }
    const sentAt = new Date();
    await prisma.$executeRaw`UPDATE "Invoice" SET "sentAt" = ${sentAt} WHERE id = ${invoice.id}`;

    // Si le studio a choisi un client, on lui envoie directement le lien de paiement par email
    // (même logique que POST /api/contracts) — pas d'échec bloquant si l'envoi rate, la
    // facture est de toute façon créée et le lien reste consultable/partageable manuellement.
    let emailSent = false;
    let emailError: string | undefined;
    if (data.clientId) {
      const client = await prisma.client.findUnique({ where: { id: data.clientId } });
      if (client?.email) {
        const result = await sendInvoiceEmail({
          clientName: client.name,
          clientEmail: client.email,
          invoiceNumber: number,
          invoiceId: invoice.id,
          totalCents,
          currency: invoice.currency,
          dueDate: invoice.dueDate,
          studio: { name: studio.name, slug: studio.slug, logoUrl: studio.logoUrl, brandColor: studio.brandColor },
          settings: studio.settings
            ? { contactEmail: studio.settings.contactEmail, contactPhone: studio.settings.contactPhone }
            : null,
          notes: data.notes,
          bankDetails: await fetchStudioBankDetails(session.user.studioId),
        });
        emailSent = result.ok;
        emailError = result.error;
      }
    }

    return NextResponse.json(
      {
        invoice: {
          ...invoice,
          sentAt,
          guestClientName: !data.clientId ? data.guestClientName ?? null : null,
          vatRate,
        },
        emailSent,
        emailError,
      },
      { status: 201 }
    );
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
