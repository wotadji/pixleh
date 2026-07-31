"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Filet de sécurité pour la confirmation de paiement d'une facture : au retour de Stripe
 * Checkout sur /i/[id]?success=1&session_id=..., appelle /api/invoices/[id]/confirm-payment
 * puis rafraîchit la page (router.refresh()) pour afficher immédiatement le bandeau "Facture
 * payée" — sans ça, il faudrait attendre le webhook Stripe (qui ne peut pas atteindre un
 * serveur en développement local sans tunnel, et peut aussi arriver en retard en production),
 * et le client revenant sur la page pouvait encore voir "en attente de paiement" alors que son
 * paiement avait bien été accepté (constat d'Adriel, 31/07/2026). Même patron que
 * CheckoutConfirm pour les abonnements de plan. Ne fait rien si `session_id` est absent.
 */
export function InvoicePaymentConfirm({ invoiceId }: { invoiceId: string }) {
  return (
    <Suspense fallback={null}>
      <InvoicePaymentConfirmInner invoiceId={invoiceId} />
    </Suspense>
  );
}

function InvoicePaymentConfirmInner({ invoiceId }: { invoiceId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const done = useRef(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const success = searchParams.get("success");
    const sessionId = searchParams.get("session_id");
    if (success !== "1" || !sessionId || done.current) return;
    done.current = true;
    setConfirming(true);

    fetch(`/api/invoices/${invoiceId}/confirm-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(() => router.refresh())
      .catch((e) => console.error("Confirmation du paiement impossible", e))
      .finally(() => setConfirming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!confirming) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
      <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      Confirmation du paiement en cours...
    </div>
  );
}
