"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Détecte `?plan=<slug>&interval=MONTHLY|ANNUAL` sur /dashboard (posé par /register après
 * l'inscription — voir register/page.tsx, qui reporte le plan choisi sur /tarifs quel que
 * soit le mode de connexion : credentials via router.push, ou Social Login via callbackUrl)
 * et lance immédiatement la session Stripe Checkout correspondante via /api/billing/checkout.
 * Plan gratuit → pas de Stripe, juste un aller-retour serveur puis nettoyage de l'URL.
 * Rendu dans le layout du dashboard, avant `children`, pour s'exécuter sur n'importe quelle
 * page d'atterrissage post-inscription.
 */
export function PendingPlanCheckout() {
  return (
    <Suspense fallback={null}>
      <PendingPlanCheckoutInner />
    </Suspense>
  );
}

function PendingPlanCheckoutInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const planSlug = searchParams.get("plan");
    if (!planSlug) return;
    const interval = searchParams.get("interval") === "ANNUAL" ? "ANNUAL" : "MONTHLY";

    let cancelled = false;
    setStatus("loading");

    fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planSlug, interval }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Impossible de lancer le paiement.");
        if (cancelled) return;
        if (data.url) {
          window.location.href = data.url as string;
        } else {
          // Plan gratuit : rien à payer, mais on garde ?checkout=success pour que la Vue
          // d'ensemble affiche quand même la confirmation du plan choisi (voir OverviewStats).
          router.replace("/dashboard?checkout=success");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "Erreur inattendue.");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        <Spinner size={16} />
        Redirection vers le paiement sécurisé Stripe...
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error} Vous pouvez réessayer depuis Réglages.
      </div>
    );
  }
  return null;
}
