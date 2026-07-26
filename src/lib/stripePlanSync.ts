import { getStripe } from "@/lib/stripe";

interface PlanForSync {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceAnnualCents: number;
  currency: string;
  stripeProductId: string | null;
  stripePriceIdMonthly: string | null;
  stripePriceIdAnnual: string | null;
}

export interface StripePlanSyncResult {
  synced: boolean;
  stripeProductId?: string;
  stripePriceIdMonthly?: string;
  stripePriceIdAnnual?: string;
  error?: string;
}

/**
 * Crée/actualise le Product Stripe correspondant à un Plan pixleh, et crée de nouveaux
 * Price Stripe quand le tarif a changé (les Price Stripe sont immuables une fois créés —
 * impossible de modifier un montant existant, il faut en créer un nouveau et archiver
 * l'ancien via `active: false`). N'échoue jamais bruyamment : si STRIPE_SECRET_KEY n'est
 * pas configuré ou qu'un appel Stripe échoue, renvoie `synced: false` plutôt que de lever —
 * le plan reste utilisable côté pixleh (quotas, affichage), juste pas encore payable par
 * carte tant que Stripe n'est pas branché. Voir /admin/plans qui affiche cet état.
 */
export async function syncPlanWithStripe(
  plan: PlanForSync,
  options: { forceNewPrices: boolean }
): Promise<StripePlanSyncResult> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { synced: false, error: "STRIPE_SECRET_KEY non configuré" };
  }

  try {
    const stripe = getStripe();

    let productId = plan.stripeProductId;
    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description || undefined,
        metadata: { pixlehPlanId: plan.id, pixlehPlanSlug: plan.slug },
      });
      productId = product.id;
    } else {
      await stripe.products.update(productId, {
        name: plan.name,
        description: plan.description || "",
      });
    }

    let priceIdMonthly = plan.stripePriceIdMonthly ?? undefined;
    let priceIdAnnual = plan.stripePriceIdAnnual ?? undefined;

    const needNewPrices = options.forceNewPrices || !priceIdMonthly || !priceIdAnnual;
    if (needNewPrices) {
      const monthlyPrice = await stripe.prices.create({
        product: productId,
        unit_amount: plan.priceMonthlyCents,
        currency: plan.currency,
        recurring: { interval: "month" },
        metadata: { pixlehPlanId: plan.id },
      });
      // Archive l'ancien prix mensuel (ne peut plus être utilisé pour un NOUVEL abonnement,
      // mais les abonnements Stripe déjà en cours dessus continuent de fonctionner sans
      // interruption — Stripe ne résilie jamais un abonnement actif à l'archivage du Price).
      if (plan.stripePriceIdMonthly) {
        await stripe.prices.update(plan.stripePriceIdMonthly, { active: false }).catch(() => {});
      }
      priceIdMonthly = monthlyPrice.id;

      const annualPrice = await stripe.prices.create({
        product: productId,
        // priceAnnualCents est le prix MENSUEL équivalent facturé annuellement (ex: 800 =
        // 8€/mois) — le montant réellement prélevé une fois par an est donc x12.
        unit_amount: plan.priceAnnualCents * 12,
        currency: plan.currency,
        recurring: { interval: "year" },
        metadata: { pixlehPlanId: plan.id },
      });
      if (plan.stripePriceIdAnnual) {
        await stripe.prices.update(plan.stripePriceIdAnnual, { active: false }).catch(() => {});
      }
      priceIdAnnual = annualPrice.id;
    }

    return {
      synced: true,
      stripeProductId: productId,
      stripePriceIdMonthly: priceIdMonthly,
      stripePriceIdAnnual: priceIdAnnual,
    };
  } catch (e) {
    console.error("Échec de synchronisation Stripe pour le plan", plan.id, e);
    return { synced: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}
