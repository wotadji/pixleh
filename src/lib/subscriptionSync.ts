import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";

/** Fait correspondre le statut Stripe (plus fin) à notre enum SubscriptionStatus (plus
 * simple, pensé pour l'affichage côté Facturation studio) — les statuts rares sans
 * équivalent direct sont ramenés au plus proche en termes d'accès (unpaid/paused ≈ impayé). */
export function mapStripeStatus(
  status: Stripe.Subscription.Status
): "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "INCOMPLETE" {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "incomplete_expired":
      return "CANCELED";
    case "unpaid":
    case "paused":
      return "PAST_DUE";
    case "incomplete":
    default:
      return "INCOMPLETE";
  }
}

/**
 * Met à jour le Studio à partir d'un objet Subscription Stripe — `metadata.studioId` (posé
 * à la création dans /api/billing/checkout) identifie le studio concerné.
 *
 * Appelée depuis deux chemins :
 * 1. Le webhook Stripe (/api/webhooks/stripe) — checkout.session.completed (paiement
 *    initial) et customer.subscription.* (mises à jour ultérieures : renouvellement, échec
 *    de paiement, résiliation). C'est la source de vérité en production.
 * 2. Le secours côté client (/api/billing/confirm-checkout, voir CheckoutConfirm) — les
 *    webhooks Stripe ne peuvent pas atteindre un serveur local (localhost) sans un tunnel
 *    (Stripe CLI `stripe listen`, ngrok...), donc en dev sans ce tunnel, l'activation initiale
 *    ne se ferait jamais sans ce filet de sécurité déclenché au retour sur /dashboard.
 */
export async function syncSubscriptionFromStripe(subscription: Stripe.Subscription) {
  const studioId = subscription.metadata?.studioId;
  if (!studioId) return; // Abonnement Stripe sans lien pixleh (ne devrait pas arriver).

  const planId = subscription.metadata?.planId;
  // Posé dans metadata à la création ET à chaque changement de plan (voir
  // /api/billing/checkout et /api/billing/change-plan) — sans ce champ ici, le Studio
  // pouvait rester affiché "mensuel" après un choix "annuel" (ou l'inverse après un
  // changement de forfait), puisque rien d'autre ne synchronisait billingInterval.
  const rawInterval = subscription.metadata?.billingInterval;
  const billingInterval = rawInterval === "MONTHLY" || rawInterval === "ANNUAL" ? rawInterval : undefined;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  try {
    await prisma.studio.update({
      where: { id: studioId },
      data: {
        ...(planId ? { planId } : {}),
        ...(billingInterval ? { billingInterval } : {}),
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: mapStripeStatus(subscription.status),
        currentPeriodEnd: periodEnd,
      },
    });
  } catch (e) {
    // Le studio a pu être supprimé entre-temps — on log sans lever, sinon Stripe
    // retenterait indéfiniment ce webhook.
    console.error("syncSubscriptionFromStripe : échec de mise à jour du studio", studioId, e);
  }
}
