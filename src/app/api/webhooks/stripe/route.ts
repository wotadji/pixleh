import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { syncSubscriptionFromStripe } from "@/lib/subscriptionSync";
import { sendStudioOrderPaidEmail, sendClientOrderPaidEmail } from "@/lib/notifications";
import { markInvoicePaidFromStripe } from "@/lib/invoicePayment";
import { submitProdigiOrder } from "@/lib/prodigiOrder";
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

      const order = await prisma.order.findUnique({
        where: { stripeSessionId: session.id },
        include: { studio: { select: { name: true } } },
      });
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

        // Confirmation au client (demande d'Adriel : le client n'avait jusqu'ici aucune
        // confirmation par email de son paiement) — best-effort comme ci-dessus, ne bloque
        // jamais la confirmation de paiement ni la soumission Prodigi.
        sendClientOrderPaidEmail({
          customerEmail: order.customerEmail,
          customerName: order.customerName,
          studioName: order.studio.name,
          totalCents: order.totalCents,
          currency: order.currency,
        }).catch((e) => console.error("Échec de l'email de confirmation client :", e));

        // Soumission automatique à Prodigi (chantier "impression pixleh Phase 2", 01/08/2026,
        // demande d'Adriel : "passons à la phase 2" — envoi automatique, pas de validation
        // manuelle). Best-effort comme la notification ci-dessus : ne modifie que Order.prodigi*
        // en cas d'échec (voir src/lib/prodigiOrder.ts), visible et rejouable depuis
        // /admin/orders — ne bloque jamais la confirmation de paiement au client.
        submitProdigiOrder(order.id).catch((e) => console.error("Échec de la soumission Prodigi :", e));
      }

      const invoiceId = session.metadata?.invoiceId;
      if (invoiceId) {
        // Factorisé dans src/lib/invoicePayment.ts (idempotent) — partagé avec le filet de
        // sécurité /api/invoices/[id]/confirm-payment, voir ce fichier pour le détail.
        await markInvoicePaidFromStripe(invoiceId);
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
