import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/** Client Stripe partagé (paiements boutique + factures). */
export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY manquant. Configurez vos clés Stripe dans .env pour activer les paiements."
      );
    }
    stripeClient = new Stripe(key, { apiVersion: "2024-06-20" });
  }
  return stripeClient;
}
