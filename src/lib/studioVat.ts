import { prisma } from "@/lib/prisma";

/**
 * Taux de TVA effectif d'un studio (31/07/2026, demande d'Adriel) — source de vérité UNIQUE
 * pour toute la TVA appliquée aux factures et contrats : StudioSettings.vatExempt/vatRate,
 * configurés une fois dans Réglages > Facturation. Retourne `null` si le studio est en
 * franchise de TVA (vatExempt=true, "TVA non applicable, art. 293 B du CGI") — dans ce cas la
 * TVA ne doit jamais s'appliquer, nulle part, sans exception. Sinon retourne le taux configuré
 * (repli sur 20% si vatRate n'a pas encore été renseigné).
 *
 * Utilisé côté serveur uniquement (POST/PATCH /api/invoices, preview-pdf, ContractForm côté
 * affichage informatif) : le client n'a plus la main pour choisir/modifier ce taux par
 * facture/contrat, voir InvoiceForm.tsx et ContractForm.tsx (case "Appliquer la TVA"
 * supprimée). vatExempt/vatRate n'existent pas encore dans le Prisma Client généré du sandbox
 * (voir schema.prisma) — lus via $queryRaw, même workaround que le reste de StudioSettings.
 */
export async function resolveStudioVatRate(studioId: string): Promise<number | null> {
  const [row] = await prisma.$queryRaw<{ vatExempt: boolean; vatRate: number | null }[]>`
    SELECT "vatExempt", "vatRate" FROM "StudioSettings" WHERE "studioId" = ${studioId}
  `;
  if (!row || row.vatExempt) return null;
  return row.vatRate ?? 20;
}
