import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { syncSubscriptionFromStripe } from "@/lib/subscriptionSync";
import { sendStudioOrderPaidEmail, sendStudioInvoicePaidEmail } from "@/lib/notifications";
import type Stripe from "stripe";

export const runtime = "nodejs";

/**
 * Webhook Stripe : confirme le paiement d'une commande boutique / facture, ET tient à jour
 * l'abonnement plan d'un studio (Sprint 2 — facturation SaaS).
 * À enregistrer dans le dashboard Stripe sur : {APP_URL}/api/webhooks/stripe
 * Événements écoutés : checkout.session.completed, customer.subscription.created/updated/deleted
 *
 * ⚠️ En développement local (localhost), Stripe ne peut pas atteindre ce endpoint sans un
 * tunnel — utilisez `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (Stripe
 * CLI) et reportez le secret affiché dans STRIPE_WEBHOOK_SECRET (.env), différent de celui du
 * endpoint configuré en production. Sans ça, ce webhook ne se déclenche jamais en local — voir
 * aussi /api/billing/confirm-checkout, qui sert de filet de sécurité pour l'activation
 * initiale (pas pour les événements ultérieurs : renouvellement, échec de paiement...).
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const sig = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig || "",
      process.env.STRIPE_WEBHOOK_SECRET || ""
    );
  } catch (err) {
    console.error("Signature webhook Stripe invalide", err);
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      const order = await prisma.order.findUnique({ where: { stripeSessionId: session.id } });
      if (order) {
        await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });
        // Best-effort, ne bloque jamais la confirmation du paiement (voir sendMail).
        sendStudioOrderPaidEmail({
          studioId: order.studioId,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          totalCents: order.totalCents,
          currency: order.currency,
        }).catch((e) => console.error("Échec de la notification de commande payée :", e));
      }

      const invoiceId = session.metadata?.invoiceId;
      if (invoiceId) {
        const invoice = await prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: "PAID", paidAt: new Date() },
          include: { client: true },
        });
        sendStudioInvoicePaidEmail({
          studioId: invoice.studioId,
          invoiceNumber: invoice.number,
          clientName: invoice.client?.name ?? null,
          totalCents: invoice.totalCents,
          currency: invoice.currency,
        }).catch((e) => console.error("Échec de la notification de facture payée :", e));
      }

      // Abonnement de plan studio (voir /api/billing/checkout) : on récupère l'objet
      // Subscription complet tout de suite plutôt que d'attendre le prochain événement
      // customer.subscription.* (qui arrivera aussi, mais potentiellement dans le désordre).
      if (session.mode === "subscription" && typeof session.subscription === "string") {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await syncSubscriptionFromStripe(subscription);
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncSubscriptionFromStripe(event.data.object as Stripe.Subscription);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
