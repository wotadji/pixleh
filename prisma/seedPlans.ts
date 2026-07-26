/**
 * Grille tarifaire de départ, calquée sur celle de Pixieset (pixieset.com/pricing,
 * pricing-website, pricing-studio-manager — relevées le 20/07/2026) et validée avec Adriel —
 * sert de point de départ éditable ensuite depuis /admin/plans, PAS une grille figée.
 *
 * pixleh est un produit tout-en-un (galeries + site vitrine + réservation/contrats/factures +
 * boutique) alors que Pixieset vend ces briques comme 3 abonnements séparés (Client Gallery /
 * Website / Studio Manager) : cette grille fusionne l'essentiel des 3 en un seul jeu de plans.
 *
 * Deux axes de la page Pixieset ont volontairement été laissés de côté : les "campagnes
 * email" et l'upload RAW, qui n'existent pas (encore) dans pixleh.
 *
 * Certains champs (storeCommissionPercent, contractLimit, quoteLimit, sessionTypeLimit,
 * paymentReminders, tipOnInvoice, depositAtBooking, tipAtBooking, manualBookingApproval,
 * bookingReminders) décrivent une intention de grille tarifaire, mais ne sont pas encore
 * TOUS appliqués côté produit — voir src/lib/platformFeatures.ts et /admin/features pour
 * activer une fonctionnalité au fur et à mesure qu'elle est développée (indépendamment de
 * ce que chaque plan coche ici).
 *
 * Idempotent (upsert par slug) : peut être relancé sans dupliquer les plans déjà créés,
 * y compris après un ajustement manuel des prix depuis le panel admin (les valeurs saisies
 * à la main ne sont écrasées que si vous relancez ce script explicitement).
 *
 * Lancer avec : npm run prisma:seed-plans
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLANS = [
  {
    slug: "gratuit",
    name: "Gratuit",
    description: "Pour découvrir pixleh sans engagement.",
    priceMonthlyCents: 0,
    priceAnnualCents: 0,
    storageLimitGB: 3,
    galleryLimit: null,
    teamMemberLimit: null,
    customDomainAllowed: false,
    removeBranding: false,
    storeCommissionPercent: 15,
    contractLimit: 3,
    quoteLimit: 3,
    sessionTypeLimit: 1,
    paymentReminders: false,
    tipOnInvoice: false,
    depositAtBooking: false,
    tipAtBooking: false,
    manualBookingApproval: false,
    bookingReminders: false,
    isFree: true,
    active: true,
    sortOrder: 0,
  },
  {
    slug: "basic",
    name: "Basic",
    description: "Pour démarrer votre activité avec votre image de marque.",
    priceMonthlyCents: 1000, // 10€/mois
    priceAnnualCents: 800, // 8€/mois si facturé annuellement
    storageLimitGB: 10,
    galleryLimit: null,
    teamMemberLimit: null,
    customDomainAllowed: true,
    removeBranding: true,
    storeCommissionPercent: 0,
    contractLimit: null,
    quoteLimit: null,
    sessionTypeLimit: 3,
    paymentReminders: false,
    tipOnInvoice: false,
    depositAtBooking: false,
    tipAtBooking: false,
    manualBookingApproval: false,
    bookingReminders: false,
    isFree: false,
    active: true,
    sortOrder: 1,
  },
  {
    slug: "plus",
    name: "Plus",
    description: "Plus de stockage pour un studio qui grandit.",
    priceMonthlyCents: 2000, // 20€/mois
    priceAnnualCents: 1600, // 16€/mois si facturé annuellement
    storageLimitGB: 100,
    galleryLimit: null,
    teamMemberLimit: null,
    customDomainAllowed: true,
    removeBranding: true,
    storeCommissionPercent: 0,
    contractLimit: null,
    quoteLimit: null,
    sessionTypeLimit: 3,
    paymentReminders: true,
    tipOnInvoice: true,
    depositAtBooking: false,
    tipAtBooking: false,
    manualBookingApproval: false,
    bookingReminders: false,
    isFree: false,
    active: true,
    sortOrder: 2,
  },
  {
    slug: "pro",
    name: "Pro",
    description: "Pour les studios établis à fort volume.",
    priceMonthlyCents: 3000, // 30€/mois
    priceAnnualCents: 2400, // 24€/mois si facturé annuellement
    storageLimitGB: 1000,
    galleryLimit: null,
    teamMemberLimit: null,
    customDomainAllowed: true,
    removeBranding: true,
    storeCommissionPercent: 0,
    contractLimit: null,
    quoteLimit: null,
    sessionTypeLimit: null,
    paymentReminders: true,
    tipOnInvoice: true,
    depositAtBooking: true,
    tipAtBooking: true,
    manualBookingApproval: true,
    bookingReminders: true,
    isFree: false,
    active: true,
    sortOrder: 3,
  },
  {
    slug: "ultimate",
    name: "Ultimate",
    description: "Stockage illimité, sans compromis.",
    priceMonthlyCents: 5000, // 50€/mois
    priceAnnualCents: 4000, // 40€/mois si facturé annuellement
    storageLimitGB: null, // illimité
    galleryLimit: null,
    teamMemberLimit: null,
    customDomainAllowed: true,
    removeBranding: true,
    storeCommissionPercent: 0,
    contractLimit: null,
    quoteLimit: null,
    sessionTypeLimit: null,
    paymentReminders: true,
    tipOnInvoice: true,
    depositAtBooking: true,
    tipAtBooking: true,
    manualBookingApproval: true,
    bookingReminders: true,
    isFree: false,
    active: true,
    sortOrder: 4,
  },
];

async function main() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
  }
  console.log(`${PLANS.length} plans créés/mis à jour (gratuit, basic, plus, pro, ultimate).`);
  console.log("Va sur /admin/plans pour les ajuster (prix, quotas, activation).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
