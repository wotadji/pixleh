import { getStudioSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getLiveFeatureKeys } from "@/lib/platformFeatures";
import { buildPlanFeatureList } from "@/lib/pricingDisplay";
import { getQuotaStatus } from "@/lib/quotas";
import { BillingPlans, type BillingPlanItem } from "@/components/studio/BillingPlans";

/**
 * [S2] Tâche #126 — Page Facturation côté studio. Permet de changer de forfait à tout moment
 * (voir /api/billing/change-plan) sans repasser par l'inscription — demandé par Adriel après
 * avoir remarqué qu'aucune UI ne permettait de monter en gamme depuis le panel.
 */
export default async function BillingPage() {
  const session = await getStudioSession();
  const studioId = session!.user.studioId;

  const [studio, plans, liveFeatures, usage] = await Promise.all([
    prisma.studio.findUnique({ where: { id: studioId }, include: { plan: true } }),
    prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getLiveFeatureKeys(),
    getQuotaStatus(studioId),
  ]);

  const items: BillingPlanItem[] = plans.map((plan) => ({
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    priceMonthlyCents: plan.priceMonthlyCents,
    priceAnnualCents: plan.priceAnnualCents,
    isFree: plan.isFree,
    features: buildPlanFeatureList(plan, liveFeatures),
    // Un plan payant peut exister côté admin sans avoir encore été synchronisé avec Stripe
    // (Price manquant) — le bouton doit rester désactivé plutôt que d'échouer au clic.
    synced: plan.isFree || Boolean(plan.stripePriceIdMonthly && plan.stripePriceIdAnnual),
    storageLimitGB: plan.storageLimitGB,
    galleryLimit: plan.galleryLimit,
  }));

  return (
    <BillingPlans
      plans={items}
      currentPlanId={studio?.planId ?? null}
      currentInterval={studio?.billingInterval ?? "MONTHLY"}
      subscriptionStatus={studio?.subscriptionStatus ?? null}
      currentPeriodEnd={studio?.currentPeriodEnd?.toISOString() ?? null}
      currency={studio?.currency || "EUR"}
      // Utilisé pour griser les forfaits dont les limites sont déjà dépassées par les
      // données actuellement stockées (voir Adriel : "toujours choisir le forfait dont la
      // configuration est supérieure à mes données") — revalidé aussi côté API.
      storageUsedBytes={usage.storageUsedBytes}
      galleryCount={usage.galleryCount}
    />
  );
}
