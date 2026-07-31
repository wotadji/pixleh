import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendInvoiceReminderEmail } from "@/lib/notifications";
import { fetchStudioBankDetails } from "@/lib/studioBankDetails";

export const dynamic = "force-dynamic";

/**
 * Relances automatiques d'échéance (31/07/2026, demande d'Adriel : "faire un send mail de
 * rappel au client à chaque 2 jours avant, puis 1 jour avant et le jour J pour le règlement de
 * la facture") — route publique (pas de session, appelée depuis une tâche cron externe, voir
 * README section 8) protégée par un secret partagé `CRON_SECRET`.
 *
 * Pas de session studio ici : c'est un job qui balaie TOUTES les factures de TOUS les studios,
 * appelé une fois par jour. Idempotent — chaque palier (2j/1j/jour J) n'est envoyé qu'une seule
 * fois par facture grâce aux horodatages reminder2dSentAt/reminder1dSentAt/reminderDueDaySentAt
 * (voir schema.prisma), donc un appel en double le même jour (retry cron, etc.) ne renvoie rien
 * de plus.
 *
 * Bonus : fait aussi passer une facture SENT en OVERDUE dès que l'échéance est dépassée sans
 * règlement — ce statut n'était jusqu'ici jamais positionné automatiquement nulle part dans le
 * code (seulement affiché s'il avait été mis à la main), incohérence corrigée au passage.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré côté serveur — voir .env.example." },
      { status: 501 }
    );
  }
  const url = new URL(req.url);
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Toutes les factures potentiellement concernées : non réglées, non annulées/brouillon, avec
  // une échéance et un client identifié (guestClientName seul n'a pas d'adresse email à
  // relancer). contractId/notes/vatRate n'entrent pas ici, seuls les champs utiles au calcul.
  const candidates = await prisma.$queryRaw<
    {
      id: string;
      studioId: string;
      clientId: string | null;
      number: string;
      status: string;
      totalCents: number;
      currency: string;
      dueDate: Date | null;
      notes: string | null;
      reminder2dSentAt: Date | null;
      reminder1dSentAt: Date | null;
      reminderDueDaySentAt: Date | null;
    }[]
  >`
    SELECT id, "studioId", "clientId", number, status, "totalCents", currency, "dueDate", notes,
      "reminder2dSentAt", "reminder1dSentAt", "reminderDueDaySentAt"
    FROM "Invoice"
    WHERE status IN ('SENT', 'OVERDUE') AND "dueDate" IS NOT NULL AND "clientId" IS NOT NULL
  `;

  // Comparaison en jours calendaires (pas en heures) : une facture à échéance "aujourd'hui" doit
  // déclencher le rappel "jour J" quelle que soit l'heure du cron.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let checked = 0;
  let sent2d = 0;
  let sent1d = 0;
  let sentDue = 0;
  let markedOverdue = 0;
  const errors: string[] = [];

  for (const inv of candidates) {
    checked++;
    if (!inv.dueDate) continue;
    const due = new Date(inv.dueDate);
    due.setHours(0, 0, 0, 0);
    const daysUntil = Math.round((due.getTime() - today.getTime()) / 86400000);

    let stage: "2d" | "1d" | "due" | null = null;
    if (daysUntil === 2 && !inv.reminder2dSentAt) stage = "2d";
    else if (daysUntil === 1 && !inv.reminder1dSentAt) stage = "1d";
    else if (daysUntil === 0 && !inv.reminderDueDaySentAt) stage = "due";

    if (stage) {
      try {
        const [client, studio] = await Promise.all([
          inv.clientId ? prisma.client.findUnique({ where: { id: inv.clientId } }) : null,
          prisma.studio.findUnique({ where: { id: inv.studioId }, include: { settings: true } }),
        ]);
        if (client?.email && studio) {
          const result = await sendInvoiceReminderEmail({
            clientName: client.name,
            clientEmail: client.email,
            invoiceNumber: inv.number,
            invoiceId: inv.id,
            totalCents: inv.totalCents,
            currency: inv.currency,
            dueDate: inv.dueDate,
            studio: { name: studio.name, slug: studio.slug, logoUrl: studio.logoUrl, brandColor: studio.brandColor },
            settings: studio.settings
              ? { contactEmail: studio.settings.contactEmail, contactPhone: studio.settings.contactPhone }
              : null,
            notes: inv.notes,
            bankDetails: await fetchStudioBankDetails(inv.studioId),
            stage,
          });
          if (result.ok) {
            const column =
              stage === "2d" ? "reminder2dSentAt" : stage === "1d" ? "reminder1dSentAt" : "reminderDueDaySentAt";
            const now = new Date();
            if (column === "reminder2dSentAt") {
              await prisma.$executeRaw`UPDATE "Invoice" SET "reminder2dSentAt" = ${now} WHERE id = ${inv.id}`;
              sent2d++;
            } else if (column === "reminder1dSentAt") {
              await prisma.$executeRaw`UPDATE "Invoice" SET "reminder1dSentAt" = ${now} WHERE id = ${inv.id}`;
              sent1d++;
            } else {
              await prisma.$executeRaw`UPDATE "Invoice" SET "reminderDueDaySentAt" = ${now} WHERE id = ${inv.id}`;
              sentDue++;
            }
          } else {
            errors.push(`Facture ${inv.number} (${stage}) : ${result.error}`);
          }
        }
      } catch (e) {
        errors.push(`Facture ${inv.number} (${stage}) : ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Bascule SENT → OVERDUE une fois l'échéance dépassée, indépendamment de l'envoi d'un
    // rappel ce jour précis (une facture peut devenir OVERDUE bien après le palier "jour J" si
    // le cron n'a pas tourné un jour donné).
    if (daysUntil < 0 && inv.status === "SENT") {
      await prisma.$executeRaw`UPDATE "Invoice" SET status = 'OVERDUE' WHERE id = ${inv.id}`;
      markedOverdue++;
    }
  }

  return NextResponse.json({ checked, sent2d, sent1d, sentDue, markedOverdue, errors });
}
