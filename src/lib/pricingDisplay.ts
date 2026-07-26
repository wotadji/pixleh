import type { Plan } from "@prisma/client";

/**
 * Construit la liste des lignes affichées pour un plan sur la page tarifs publique.
 * Les quotas (stockage, galeries, équipe) sont toujours affichés — ce sont des repères de
 * positionnement des plans, même si leur application technique (Sprint 2, tâche #127)
 * n'est pas encore en place. En revanche, les fonctionnalités concrètes (domaine
 * personnalisé, retrait du badge, relances, acompte à la réservation...) ne sont listées
 * QUE si elles sont réellement développées (voir src/lib/platformFeatures.ts et
 * /admin/features) — pas question d'afficher publiquement une promesse qu'on ne tient pas
 * encore.
 */
export function buildPlanFeatureList(plan: Plan, liveFeatures: Set<string>): string[] {
  const lines: string[] = [];

  lines.push(plan.storageLimitGB ? `${plan.storageLimitGB} Go de stockage` : "Stockage illimité");
  lines.push(plan.galleryLimit ? `${plan.galleryLimit} galerie(s)` : "Galeries illimitées");
  lines.push(plan.teamMemberLimit ? `${plan.teamMemberLimit} membre(s) d'équipe` : "Équipe illimitée");

  if (plan.customDomainAllowed && liveFeatures.has("customDomain")) {
    lines.push("Domaine personnalisé");
  }
  if (plan.removeBranding && liveFeatures.has("removeBranding")) {
    lines.push('Retrait du badge "Propulsé par pixleh"');
  }
  if (liveFeatures.has("storeCommission")) {
    lines.push(
      plan.storeCommissionPercent > 0
        ? `${plan.storeCommissionPercent}% de commission boutique`
        : "0% de commission boutique"
    );
  }
  if (liveFeatures.has("contractQuoteLimits")) {
    lines.push(plan.contractLimit ? `${plan.contractLimit} contrat(s)` : "Contrats illimités");
    lines.push(plan.quoteLimit ? `${plan.quoteLimit} devis` : "Devis illimités");
  }
  if (liveFeatures.has("sessionTypeLimits")) {
    lines.push(
      plan.sessionTypeLimit ? `${plan.sessionTypeLimit} type(s) de séance` : "Types de séance illimités"
    );
  }
  if (plan.paymentReminders && liveFeatures.has("paymentReminders")) {
    lines.push("Relances automatiques (facture, document)");
  }
  if (plan.tipOnInvoice && liveFeatures.has("tipOnInvoice")) {
    lines.push("Pourboire sur facture");
  }
  if (plan.depositAtBooking && liveFeatures.has("depositAtBooking")) {
    lines.push("Acompte à la réservation");
  }
  if (plan.tipAtBooking && liveFeatures.has("tipAtBooking")) {
    lines.push("Pourboire à la réservation");
  }
  if (plan.manualBookingApproval && liveFeatures.has("manualBookingApproval")) {
    lines.push("Validation manuelle des réservations");
  }
  if (plan.bookingReminders && liveFeatures.has("bookingReminders")) {
    lines.push("Relances de réservation");
  }

  return lines;
}
