import { redirect } from "next/navigation";
import { getStudioSession } from "@/lib/access";
import { createCheckoutOrAssignPlan } from "@/lib/billingCheckout";

/**
 * Étape intermédiaire, invisible en pratique, entre l'inscription et le dashboard quand un
 * plan payant a été choisi sur /tarifs — Adriel a remarqué que le panel s'affichait une
 * fraction de seconde avant la redirection vers Stripe (l'ancien flux faisait tourner
 * PendingPlanCheckout, un composant CLIENT monté dans le dashboard, donc après que tout le
 * HTML du panel soit déjà arrivé côté navigateur).
 *
 * Ici la création de la session Checkout (ou l'attribution du plan gratuit) se fait
 * entièrement côté SERVEUR pendant le rendu de cette page, et `redirect()` renvoie une
 * redirection HTTP avant qu'aucun contenu ne soit envoyé au navigateur — l'utilisateur ne
 * voit jamais cette page ni le dashboard, juste un aller direct vers Stripe (ou vers
 * /dashboard si le plan est gratuit). Voir register/page.tsx (credentials) et
 * SocialLoginButtons callbackUrl (OAuth), qui pointent tous les deux ici plutôt que
 * directement vers /dashboard dès qu'un plan a été choisi sur /tarifs.
 */
export default async function CheckoutRedirectPage({
  searchParams,
}: {
  searchParams: { plan?: string; interval?: string };
}) {
  const session = await getStudioSession();
  if (!session) redirect("/login");

  const planSlug = searchParams.plan;
  if (!planSlug) redirect("/dashboard");

  const billingInterval: "MONTHLY" | "ANNUAL" = searchParams.interval === "ANNUAL" ? "ANNUAL" : "MONTHLY";

  // redirect() lève en interne une exception de contrôle de flux spéciale (NEXT_REDIRECT) —
  // elle ne doit JAMAIS être appelée à l'intérieur du try/catch ci-dessous, sinon on la
  // attraperait par erreur comme une vraie erreur. On calcule donc juste la destination ici,
  // et le redirect() a lieu une seule fois, à la fin, hors du try/catch.
  let target: string;
  try {
    const result = await createCheckoutOrAssignPlan({
      studioId: session.user.studioId,
      userEmail: session.user.email,
      planSlug,
      billingInterval,
    });
    target = result.url ?? "/dashboard?checkout=success";
  } catch (e) {
    // Plan introuvable / pas encore synchronisé Stripe / erreur réseau : on retombe sur le
    // dashboard avec le plan en paramètre — PendingPlanCheckout y réessaiera côté client et
    // affichera un message d'erreur clair si ça échoue à nouveau, plutôt que de faire planter
    // cette page pour l'utilisateur.
    console.error("Redirection Stripe échouée, retombée sur /dashboard", e);
    target = `/dashboard?plan=${encodeURIComponent(planSlug)}&interval=${billingInterval}`;
  }

  redirect(target);
}
