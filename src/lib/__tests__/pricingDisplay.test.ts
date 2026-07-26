import { describe, expect, it } from "vitest";
import type { Plan } from "@prisma/client";
import { buildPlanFeatureList } from "@/lib/pricingDisplay";

/** Plan minimal, toutes options désactivées — sert de base à cloner dans chaque test
 * pour ne faire varier que le champ testé. */
const basePlan: Plan = {
  id: "plan_1",
  slug: "gratuit",
  name: "Gratuit",
  description: null,
  priceMonthlyCents: 0,
  priceAnnualCents: 0,
  currency: "eur",
  storageLimitGB: 5,
  galleryLimit: 3,
  teamMemberLimit: 1,
  customDomainAllowed: false,
  removeBranding: false,
  storeCommissionPercent: 0,
  contractLimit: null,
  quoteLimit: null,
  sessionTypeLimit: null,
  paymentReminders: false,
  tipOnInvoice: false,
  depositAtBooking: false,
  tipAtBooking: false,
  manualBookingApproval: false,
  bookingReminders: false,
  isFree: true,
  active: true,
  sortOrder: 0,
  stripeProductId: null,
  stripePriceMonthlyId: null,
  stripePriceAnnualId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Plan;

describe("buildPlanFeatureList (page tarifs publique — ne jamais afficher une promesse non tenue)", () => {
  it("affiche toujours les quotas de base, même sans aucune fonctionnalité live", () => {
    const lines = buildPlanFeatureList(basePlan, new Set());
    expect(lines).toContain("5 Go de stockage");
    expect(lines).toContain("3 galerie(s)");
    expect(lines).toContain("1 membre(s) d'équipe");
  });

  it("affiche 'illimité' quand la limite est null", () => {
    const lines = buildPlanFeatureList({ ...basePlan, storageLimitGB: null, galleryLimit: null, teamMemberLimit: null }, new Set());
    expect(lines).toContain("Stockage illimité");
    expect(lines).toContain("Galeries illimitées");
    expect(lines).toContain("Équipe illimitée");
  });

  it("n'affiche PAS une fonctionnalité activée sur le plan si elle n'est pas dans liveFeatures (pas encore développée)", () => {
    const plan = { ...basePlan, customDomainAllowed: true };
    const lines = buildPlanFeatureList(plan, new Set());
    expect(lines).not.toContain("Domaine personnalisé");
  });

  it("affiche la fonctionnalité seulement si ELLE EST À LA FOIS activée sur le plan ET live", () => {
    const plan = { ...basePlan, customDomainAllowed: true };
    const lines = buildPlanFeatureList(plan, new Set(["customDomain"]));
    expect(lines).toContain("Domaine personnalisé");
  });

  it("affiche 0% de commission explicitement plutôt que de l'omettre (transparence tarifaire)", () => {
    const lines = buildPlanFeatureList(basePlan, new Set(["storeCommission"]));
    expect(lines).toContain("0% de commission boutique");
  });
});
