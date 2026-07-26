import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, handleApiError, AccessError } from "@/lib/access";
import { syncSubscriptionFromStripe } from "@/lib/subscriptionSync";

/**
 * Filet de sécurité appelé côté client (voir CheckoutConfirm) juste après le retour de Stripe
 * Checkout sur /dashboard?checkout=success&session_id=... — vérifie et synchronise l'état de
 * l'abonnement directement auprès de Stripe, sans attendre le webhook.
 *
 * Nécessaire car le webhook (/api/webhooks/stripe) ne peut pas atteindre un serveur en
 * développement local (localhost) sans tunnel — sans ce filet, un studio qui paie en local
 * resterait indéfiniment affiché "sans plan actif" malgré un paiement réussi. Reste utile
 * aussi en production comme garde-fou en cas de webhook en retard.
 */
export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const { sessionId } = (await req.json()) as { sessionId?: string };
    if (!sessionId) throw new AccessError("sessionId manquant", 400);

    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    // sessionId est visible dans l'URL (donc potentiellement rejoué/partagé) — on vérifie
    // qu'elle appartient bien au studio actuellement connecté avant de synchroniser quoi
    // que ce soit.
    if (checkoutSession.client_reference_id !== session.user.studioId) {
      throw new AccessError("Session de paiement invalide", 403);
    }

    if (checkoutSession.mode === "subscription" && typeof checkoutSession.subscription === "string") {
      const subscription = await stripe.subscriptions.retrieve(checkoutSession.subscription);
      await syncSubscriptionFromStripe(subscription);
    }

    const studio = await prisma.studio.findUnique({
      where: { id: session.user.studioId },
      include: { plan: true },
    });

    return NextResponse.json({ plan: studio?.plan ? { name: studio.plan.name, isFree: studio.plan.isFree } : null });
  } catch (e) {
    return handleApiError(e);
  }
}
