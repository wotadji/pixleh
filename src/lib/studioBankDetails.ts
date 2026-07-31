import { prisma } from "@/lib/prisma";

/** IBAN/BIC/nom de banque du studio (StudioSettings, voir schema.prisma) — n'existent pas
 * encore dans le Prisma Client généré du sandbox, lus à part via $queryRaw. Partagé par POST
 * /api/invoices, /api/invoices/[id]/send et /api/cron/invoice-reminders (31/07/2026, demande
 * d'Adriel : réutiliser automatiquement l'IBAN renseigné une fois dans Réglages > Facturation
 * plutôt que de le retaper dans les Notes de chaque facture). Dans un fichier lib/ dédié
 * (plutôt qu'exporté depuis une route.ts) : Next.js interdit d'exporter autre chose que les
 * handlers HTTP standard (GET/POST/...) et quelques options de config depuis un fichier
 * route.ts (voir erreur de build TS2344 rencontrée en la mettant dans invoices/route.ts).
 */
export async function fetchStudioBankDetails(
  studioId: string
): Promise<{ iban: string | null; bic: string | null; bankName: string | null } | null> {
  const [row] = await prisma.$queryRaw<
    { iban: string | null; bic: string | null; bankName: string | null }[]
  >`SELECT iban, bic, "bankName" FROM "StudioSettings" WHERE "studioId" = ${studioId}`;
  return row ?? null;
}
