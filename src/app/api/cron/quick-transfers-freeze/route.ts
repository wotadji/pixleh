import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Gèle automatiquement les Transferts rapides dont les 14 jours (voir ACTIVE_DAYS dans
 * /api/quick-transfers) sont dépassés — même mécanique cron que
 * /api/cron/invoice-reminders (secret partagé CRON_SECRET, voir README section 8), à
 * appeler une fois par jour.
 *
 * Ne supprime JAMAIS les fichiers (voir le commentaire du modèle QuickTransfer dans
 * schema.prisma) : seul le statut bascule, le téléchargement public est ensuite bloqué par
 * /api/t/[slug]/... qui revérifie de toute façon `expiresAt` dynamiquement (donc même un
 * jour de retard du cron ne laisse pas passer un téléchargement après expiration).
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

  const now = new Date();
  const result = await prisma.$executeRaw`
    UPDATE "QuickTransfer" SET status = 'FROZEN', "frozenAt" = ${now}
    WHERE status = 'ACTIVE' AND "expiresAt" < ${now}
  `;

  return NextResponse.json({ frozen: result });
}
