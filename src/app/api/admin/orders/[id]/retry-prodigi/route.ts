import { NextResponse } from "next/server";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { submitProdigiOrder } from "@/lib/prodigiOrder";

/**
 * Bouton "Réessayer l'envoi à Prodigi" de /admin/orders (chantier "impression pixleh Phase 2",
 * 01/08/2026) — la soumission se fait normalement automatiquement au paiement (voir webhook
 * Stripe), mais peut échouer (Prodigi indisponible, attribut produit manquant, adresse
 * invalide...) ; submitProdigiOrder est idempotent, donc rejouable sans risque de double
 * commande tant que le statut n'est pas déjà SUBMITTED.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) throw new AccessError("Commande introuvable.", 404);

    const result = await submitProdigiOrder(order.id);
    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e);
  }
}
