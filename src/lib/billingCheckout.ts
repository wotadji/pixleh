import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { AccessError } from "@/lib/access";

/**
 * Logique partagée de souscription à un plan, extraite de /api/billing/checkout pour être
 * appelée aussi bien depuis cette route (fallback client, voir PendingPlanCheckout) que
 * directement depuis /checkout (Server Component qui fait un redirect() serveur juste après
 * l'inscription — voir ce fichier pour le pourquoi : éviter que l'utilisateur voie le panel
 * dashboard s'afficher une fraction de seconde avant d'être renvoyé vers Stripe).
 *
 * Si le plan est gratuit, aucune session Stripe n'est créée : le plan est attribué
 * directement au studio et `url` vaut null.
 */
export async function createCheckoutOrAssignPlan(params: {
  studioId: string;
  userEmail?: string | null;
  planSlug: string;
  billingInterval: "MONTHLY" | "ANNUAL";
}): Promise<{ url: string | null; free: boolean }> {
  const { studioId, userEmail, planSlug, billingInterval } = params;

  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!plan || !plan.active) throw new AccessError("Plan introuvable", 404);

  const studio = await prisma.studio.findUnique({ where: { id: studioId } });
  if (!studio) throw new AccessError("Studio introuvable", 404);

  // Plan gratuit : rien à payer, on l'attribue directement sans passer par Stripe.
  if (plan.isFree) {
    await prisma.studio.update({
      where: { id: studio.id },
      data: { planId: plan.id, billingInterval, subscriptionStatus: null },
    });
    return { url: null, free: true };
  }

  const priceId = billingInterval === "ANNUAL" ? plan.stripePriceIdAnnual : plan.stripePriceIdMonthly;
  if (!priceId) {
    throw new AccessError(
      "Ce plan n'est pas encore synchronisé avec Stripe — contactez l'équipe pixleh.",
      400
    );
  }

  const stripe = getStripe();

  // Réutilise le Customer Stripe existant du studio s'il y en a déjà un (ex: tentative de
  // paiement précédente annulée), sinon en crée un — évite les doublons de Customer côté
  // Stripe à chaque nouvelle tentative.
  let customerId = studio.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail || undefined,
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
    // session_id repris par CheckoutConfirm (composant dashboard) au retour : sert de
    // filet de sécurité qui synchronise directement auprès de Stripe si le webhook n'est
    // pas arrivé (ex: développement local sans tunnel — voir /api/billing/confirm-checkout).
    success_url: `${process.env.APP_URL}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/dashboard?checkout=cancel`,
    client_reference_id: studio.id,
    metadata: { studioId: studio.id, planId: plan.id, billingInterval },
    subscription_data: {
      metadata: { studioId: studio.id, planId: plan.id, billingInterval },
    },
  });

  return { url: checkoutSession.url, free: false };
}
