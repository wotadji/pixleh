import { NextResponse } from "next/server";
import { requireStudioSession, handleApiError, AccessError } from "@/lib/access";
import { createCheckoutOrAssignPlan } from "@/lib/billingCheckout";

/**
 * Crée une session Stripe Checkout (ou attribue directement le plan gratuit) pour le studio
 * connecté. Chemin PRINCIPAL désormais : /checkout (Server Component, redirect() côté
 * serveur juste après l'inscription — pas de flash du dashboard avant Stripe). Cette route
 * reste en place comme filet de sécurité côté client (voir PendingPlanCheckout) pour les cas
 * où /checkout échoue et retombe sur /dashboard?plan=..., ou pour un futur changement de
 * plan déclenché ailleurs que /dashboard/billing (qui a son propre /api/billing/change-plan).
 */
export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const { planSlug, interval } = (await req.json()) as {
      planSlug?: string;
      interval?: "MONTHLY" | "ANNUAL";
    };
    if (!planSlug) throw new AccessError("Plan manquant", 400);

    const result = await createCheckoutOrAssignPlan({
      studioId: session.user.studioId,
      userEmail: session.user.email,
      planSlug,
      billingInterval: interval === "ANNUAL" ? "ANNUAL" : "MONTHLY",
    });

    return NextResponse.json(result);
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
