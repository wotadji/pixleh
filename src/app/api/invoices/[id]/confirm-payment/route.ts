import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { markInvoicePaidFromStripe } from "@/lib/invoicePayment";

export const runtime = "nodejs";

/**
 * Filet de sécurité appelé côté client (voir InvoicePaymentConfirm) juste après le retour de
 * Stripe Checkout sur /i/[id]?success=1&session_id=... — vérifie directement auprès de Stripe
 * que le paiement a bien abouti puis marque la facture payée, sans attendre le webhook
 * (/api/webhooks/stripe). Même patron que /api/billing/confirm-checkout pour les abonnements
 * de plan : le webhook ne peut pas atteindre un serveur en développement local sans tunnel, et
 * peut aussi arriver en retard en production — sans ce filet, un client revenant sur la page
 * de paiement juste après avoir réglé pouvait encore voir "en attente de paiement" (constat
 * d'Adriel, 31/07/2026).
 *
 * Public (pas de session studio) comme le reste de /i/[id] : le sessionId n'est exploitable
 * qu'après vérification auprès de Stripe que sa metadata.invoiceId correspond bien à la
 * facture demandée dans l'URL, ce qui empêche de marquer payée une facture arbitraire avec un
 * sessionId d'une autre facture.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { sessionId } = (await req.json()) as { sessionId?: string };
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId manquant" }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.metadata?.invoiceId !== params.id) {
      return NextResponse.json({ error: "Session de paiement invalide" }, { status: 403 });
    }
    if (session.payment_status !== "paid") {
      return NextResponse.json({ ok: false, status: session.payment_status });
    }

    await markInvoicePaidFromStripe(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
