import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { requireStudioSession, handleApiError, AccessError } from "@/lib/access";
import { syncSubscriptionFromStripe } from "@/lib/subscriptionSync";
import { getQuotaStatus } from "@/lib/quotas";

const GB = 1024 ** 3;

/**
 * Change le plan du studio connecté — appelée depuis /dashboard/billing (voir BillingPlans).
 * Trois cas, pour ne jamais facturer deux abonnements en parallèle :
 *
 * 1. Vers le plan gratuit : résilie immédiatement l'abonnement Stripe payant en cours (s'il y
 *    en a un), puis assigne le plan gratuit directement — pas de session Checkout.
 * 2. Le studio a déjà un abonnement Stripe actif (changement de palier, mensuel ↔ annuel...) :
 *    on modifie CET abonnement en place (`stripe.subscriptions.update`) avec proration
 *    immédiate (`proration_behavior: "create_prorations"`, choix confirmé avec Adriel)
 *    plutôt que d'en créer un second. On synchronise directement la réponse de Stripe dans
 *    la base — inutile d'attendre le webhook (voir syncSubscriptionFromStripe).
 * 3. Le studio n'a pas d'abonnement en cours (venait du gratuit, ou résilié) : même chemin
 *    que l'inscription — nouvelle session Stripe Checkout (voir /api/billing/checkout, dont
 *    la logique est reprise ici pour rester autonome).
 */
export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const { planSlug, interval } = (await req.json()) as {
      planSlug?: string;
      interval?: "MONTHLY" | "ANNUAL";
    };
    if (!planSlug) throw new AccessError("Plan manquant", 400);

    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
    if (!plan || !plan.active) throw new AccessError("Plan introuvable", 404);

    const billingInterval: "MONTHLY" | "ANNUAL" = interval === "ANNUAL" ? "ANNUAL" : "MONTHLY";

    const studio = await prisma.studio.findUnique({ where: { id: session.user.studioId } });
    if (!studio) throw new AccessError("Studio introuvable", 404);

    if (studio.planId === plan.id && studio.billingInterval === billingInterval) {
      return NextResponse.json({ url: null, changed: false });
    }

    // Empêche de choisir un forfait dont les limites (stockage/galeries) sont déjà dépassées
    // par les données actuellement stockées — sinon le studio se retrouverait immédiatement
    // en situation de quota dépassé après le changement. Le bouton est aussi grisé côté UI
    // (voir BillingPlans), mais on revalide ici car cet endpoint est appelable directement.
    // Vérifié pour TOUS les forfaits (pas seulement le gratuit) : les limites viennent du
    // Plan choisi, configuré par Adriel dans /admin/plans, jamais codées en dur.
    const usage = await getQuotaStatus(studio.id);
    if (plan.storageLimitGB !== null && usage.storageUsedBytes > plan.storageLimitGB * GB) {
      throw new AccessError(
        `Ce forfait n'offre que ${plan.storageLimitGB} Go — vous utilisez déjà plus que cette limite. Libérez de l'espace ou choisissez un forfait supérieur.`,
        400
      );
    }
    if (plan.galleryLimit !== null && usage.galleryCount > plan.galleryLimit) {
      throw new AccessError(
        `Ce forfait n'autorise que ${plan.galleryLimit} galerie(s) — vous en avez déjà plus. Supprimez des galeries ou choisissez un forfait supérieur.`,
        400
      );
    }

    const stripe = getStripe();
    const hasUpdatableSubscription =
      Boolean(studio.stripeSubscriptionId) && studio.subscriptionStatus !== "CANCELED";

    // 1. Vers le gratuit.
    if (plan.isFree) {
      if (hasUpdatableSubscription && studio.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(studio.stripeSubscriptionId);
        } catch {
          // Déjà résilié côté Stripe (ex: double clic) — on continue quand même.
        }

        // Nettoyage du solde client : résilier un abonnement en cours de période laisse
        // parfois traîner, côté Stripe, une proration non facturée (avoir OU dû) rattachée
        // au Customer plutôt qu'à l'abonnement supprimé — elle ne disparaît pas avec
        // l'abonnement et refait surface sur la PROCHAINE facture, même si cette prochaine
        // facture vient d'un abonnement recréé bien plus tard (ex: le studio repasse au
        // payant après un aller-retour par le gratuit). Repéré par Adriel : après un
        // aller-retour Basique → Gratuit → Basique répété, le montant affiché sur Stripe
        // Checkout augmentait à chaque fois ("Solde appliqué" grandissant). On repart donc
        // sur une ardoise propre à chaque passage au gratuit : aucune trace financière ne
        // doit survivre à une résiliation.
        if (studio.stripeCustomerId) {
          try {
            const pendingItems = await stripe.invoiceItems.list({
              customer: studio.stripeCustomerId,
              pending: true,
              limit: 100,
            });
            await Promise.all(pendingItems.data.map((item) => stripe.invoiceItems.del(item.id)));
            await stripe.customers.update(studio.stripeCustomerId, { balance: 0 });
          } catch (cleanupError) {
            console.error("Nettoyage du solde Stripe échoué pour le studio", studio.id, cleanupError);
          }
        }
      }
      await prisma.studio.update({
        where: { id: studio.id },
        data: {
          planId: plan.id,
          billingInterval,
          subscriptionStatus: null,
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
        },
      });
      return NextResponse.json({ url: null, changed: true, free: true });
    }

    const priceId = billingInterval === "ANNUAL" ? plan.stripePriceIdAnnual : plan.stripePriceIdMonthly;
    if (!priceId) {
      throw new AccessError(
        "Ce plan n'est pas encore synchronisé avec Stripe — contactez l'équipe pixleh.",
        400
      );
    }

    // 2. Abonnement payant déjà actif : mise à jour en place, avec proration immédiate.
    if (hasUpdatableSubscription && studio.stripeSubscriptionId) {
      const current = await stripe.subscriptions.retrieve(studio.stripeSubscriptionId);
      const itemId = current.items.data[0]?.id;
      if (!itemId) throw new AccessError("Abonnement Stripe invalide.", 500);

      const updated = await stripe.subscriptions.update(studio.stripeSubscriptionId, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: { studioId: studio.id, planId: plan.id, billingInterval },
      });
      await syncSubscriptionFromStripe(updated);
      return NextResponse.json({ url: null, changed: true });
    }

    // 3. Pas d'abonnement en cours : nouvelle session Checkout.
    let customerId = studio.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email || undefined,
        name: studio.name,
        metadata: { studioId: studio.id },
      });
      customerId = customer.id;
      await prisma.studio.update({ where: { id: studio.id }, data: { stripeCustomerId: customerId } });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL}/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/dashboard/billing?checkout=cancel`,
      client_reference_id: studio.id,
      metadata: { studioId: studio.id, planId: plan.id, billingInterval },
      subscription_data: {
        metadata: { studioId: studio.id, planId: plan.id, billingInterval },
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (e) {
    if (e instanceof Error && e.message.includes("STRIPE_SECRET_KEY")) {
      return NextResponse.json(
        { error: "Paiement indisponible : configuration Stripe manquante." },
        { status: 500 }
      );
    }
    return handleApiError(e);
  }
}
