"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Filet de sécurité pour l'activation d'un plan payé : au retour de Stripe Checkout sur
 * /dashboard?checkout=success&session_id=..., appelle /api/billing/confirm-checkout puis
 * rafraîchit les données serveur (router.refresh()) pour que la Vue d'ensemble affiche le
 * bon plan immédiatement — sans ça, il faudrait attendre le webhook Stripe, qui ne peut pas
 * atteindre un serveur en développement local (localhost) sans tunnel (Stripe CLI `stripe
 * listen`). Ne fait rien si `session_id` est absent (ex: retour sur un plan gratuit, déjà
 * géré directement par PendingPlanCheckout). Composant sans rendu visuel — la confirmation
 * elle-même s'affiche via le bandeau de OverviewStats une fois les données rafraîchies.
 */
export function CheckoutConfirm() {
  return (
    <Suspense fallback={null}>
      <CheckoutConfirmInner />
    </Suspense>
  );
}

function CheckoutConfirmInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    const status = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");
    if (status !== "success" || !sessionId || done.current) return;
    done.current = true;

    fetch("/api/billing/confirm-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(() => router.refresh())
      .catch((e) => console.error("Confirmation du paiement impossible", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
