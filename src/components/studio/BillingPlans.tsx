"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { IconSparkle } from "@/components/studio/OverviewIcons";
import { Modal } from "@/components/ui/Modal";

export interface BillingPlanItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceAnnualCents: number;
  isFree: boolean;
  features: string[];
  /** false si le plan payant n'a pas encore de Price Stripe (pas synchronisé côté admin). */
  synced: boolean;
  /** null = stockage illimité. */
  storageLimitGB: number | null;
  /** null = galeries illimitées. */
  galleryLimit: number | null;
}

const GB = 1024 ** 3;

// Même format que src/components/studio/OverviewStats.tsx (formatGB) — "GB" plutôt que "Go"
// pour rester cohérent avec l'unité déjà affichée ailleurs dans le dashboard.
function formatGB(bytes: number) {
  const gb = bytes / GB;
  return gb >= 10 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;
}

type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "INCOMPLETE" | null;

const STATUS_TINTS: Record<string, string> = {
  TRIALING: "bg-blue-50 text-blue-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PAST_DUE: "bg-red-50 text-red-700",
  CANCELED: "bg-gray-100 text-gray-500",
  INCOMPLETE: "bg-amber-50 text-amber-700",
};

/**
 * Page /dashboard/billing (Facturation) — [S2] tâche #126. Permet de changer de forfait à
 * tout moment sans repasser par l'inscription : voir /api/billing/change-plan pour la
 * logique de bascule (résiliation vers le gratuit, mise à jour en place avec proration pour
 * un abonnement payant déjà actif, ou nouvelle session Checkout sinon).
 */
export function BillingPlans({
  plans,
  currentPlanId,
  currentInterval,
  subscriptionStatus,
  currentPeriodEnd,
  currency,
  storageUsedBytes,
  galleryCount,
}: {
  plans: BillingPlanItem[];
  currentPlanId: string | null;
  currentInterval: "MONTHLY" | "ANNUAL";
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: string | null;
  currency: string;
  /** Usage actuel du studio, indépendant du forfait — sert à griser les forfaits dont les
   * limites sont déjà dépassées par les données stockées. */
  storageUsedBytes: number;
  galleryCount: number;
}) {
  const { t, locale } = useLanguage();
  const router = useRouter();

  const [annual, setAnnual] = useState(currentInterval === "ANNUAL");
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Plan en attente de confirmation (passage au gratuit) — affiché dans une Modal plutôt
  // qu'un window.confirm() natif du navigateur, pour rester cohérent avec le reste du panel.
  const [pendingDowngrade, setPendingDowngrade] = useState<BillingPlanItem | null>(null);

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: currency || "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    [locale, currency]
  );
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "long" }), [locale]);

  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? null;

  // Un forfait est "insuffisant" si ses limites (stockage et/ou galeries) sont déjà
  // dépassées par les données actuellement stockées — on ne grise QUE dans ce cas, pas par
  // rapport au forfait actuel : un studio peut toujours choisir un forfait dont la
  // configuration est supérieure ou égale à son usage, même s'il "descend" de palier.
  function isInsufficientForUsage(plan: BillingPlanItem) {
    const storageInsufficient = plan.storageLimitGB !== null && storageUsedBytes > plan.storageLimitGB * GB;
    const galleryInsufficient = plan.galleryLimit !== null && galleryCount > plan.galleryLimit;
    return storageInsufficient || galleryInsufficient;
  }

  function handleChange(plan: BillingPlanItem) {
    const isCurrent = plan.id === currentPlanId && (annual ? "ANNUAL" : "MONTHLY") === currentInterval;
    if (isCurrent || !plan.synced || isInsufficientForUsage(plan)) return;
    if (plan.isFree && currentPlan && !currentPlan.isFree) {
      setPendingDowngrade(plan);
      return;
    }
    performChange(plan);
  }

  async function performChange(plan: BillingPlanItem) {
    setError(null);
    setSuccessMessage(null);
    setLoadingSlug(plan.slug);
    try {
      const res = await fetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug: plan.slug, interval: annual ? "ANNUAL" : "MONTHLY" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("billing.error.generic"));
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setSuccessMessage(t("billing.success"));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("billing.error.generic"));
    } finally {
      setLoadingSlug(null);
    }
  }

  return (
    <div>
      <div>
        <h1 className="font-serif text-2xl font-semibold">{t("billing.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("billing.subtitle")}</p>
      </div>

      {successMessage && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <IconSparkle className="h-4 w-4 shrink-0 text-emerald-500" />
          {successMessage}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Résumé du forfait actuel : nom, statut Stripe, prochaine échéance. */}
      <div className="card mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">{t("billing.current.title")}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-serif text-lg font-semibold">{currentPlan?.name ?? t("billing.current.none")}</span>
            {subscriptionStatus && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TINTS[subscriptionStatus] || "bg-gray-100 text-gray-500"}`}>
                {t(`billing.status.${subscriptionStatus.toLowerCase()}`)}
              </span>
            )}
          </div>
        </div>
        <div className="text-sm text-gray-500">
          {currentPeriodEnd
            ? `${t("billing.current.nextRenewal")} ${dateFormatter.format(new Date(currentPeriodEnd))}`
            : t("billing.current.noRenewal")}
        </div>
      </div>

      {/* Bascule mensuel/annuel — même composant visuel que la page tarifs publique. */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <span className={`text-sm ${!annual ? "font-medium text-gray-900" : "text-gray-500"}`}>{t("billing.toggle.monthly")}</span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          onClick={() => setAnnual((v) => !v)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${annual ? "bg-brand-600" : "bg-gray-300"}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${annual ? "translate-x-5" : "translate-x-0"}`}
          />
        </button>
        <span className={`text-sm ${annual ? "font-medium text-gray-900" : "text-gray-500"}`}>
          {t("billing.toggle.annual")} <span className="text-brand-600">{t("billing.toggle.save")}</span>
        </span>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {plans.map((plan) => {
          const cents = plan.isFree ? 0 : annual ? plan.priceAnnualCents : plan.priceMonthlyCents;
          const isCurrent = plan.id === currentPlanId && (annual ? "ANNUAL" : "MONTHLY") === currentInterval;
          const isLoading = loadingSlug === plan.slug;
          const storageInsufficient = plan.storageLimitGB !== null && storageUsedBytes > plan.storageLimitGB * GB;
          const galleryInsufficient = plan.galleryLimit !== null && galleryCount > plan.galleryLimit;
          const insufficientForUsage = storageInsufficient || galleryInsufficient;

          return (
            <div key={plan.id} className={`card flex flex-col ${isCurrent ? "border-2 border-brand-600" : ""}`}>
              {isCurrent && (
                <span className="mb-3 inline-block w-fit rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800">
                  {t("billing.plan.current")}
                </span>
              )}
              <h3 className="font-serif text-lg font-semibold">{plan.name}</h3>
              {plan.description && <p className="mt-1 text-sm text-gray-500">{plan.description}</p>}
              <p className="mt-4">
                <span className="text-3xl font-bold">{currencyFormatter.format(cents / 100)}</span>
                <span className="text-sm text-gray-500">{t("billing.plan.perMonth")}</span>
              </p>
              {!plan.isFree && annual && (
                <p className="text-xs text-gray-400">
                  {t("billing.plan.billedAnnually")} ({currencyFormatter.format((cents * 12) / 100)}
                  {t("overview.plan.perYear")})
                </p>
              )}

              <ul className="mt-6 flex-1 space-y-2 text-sm text-gray-600">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 text-brand-600">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* Grisé (pas seulement au clic) si l'usage actuel du studio dépasse déjà les
                  limites de CE forfait — évite de choisir une configuration insuffisante pour
                  les données déjà stockées. Le détail (Go / galeries en trop) s'affiche en
                  dessous pour que ce ne soit pas juste "grisé sans explication". */}
              <button
                type="button"
                disabled={isCurrent || !plan.synced || isLoading || insufficientForUsage}
                onClick={() => handleChange(plan)}
                title={insufficientForUsage ? t("billing.plan.insufficientForUsage") : undefined}
                className={`mt-6 text-center ${isCurrent ? "btn-secondary cursor-default opacity-60" : "btn-primary"} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {isLoading
                  ? "…"
                  : isCurrent
                    ? t("billing.plan.current")
                    : !plan.synced
                      ? t("billing.plan.notSynced")
                      : insufficientForUsage
                        ? t("billing.plan.insufficient")
                        : plan.isFree
                          ? t("billing.plan.downgradeFree")
                          : t("billing.plan.switch")}
              </button>
              {insufficientForUsage && (
                <p className="mt-2 text-xs text-red-500">
                  {t("billing.plan.insufficientForUsage")}
                  {storageInsufficient && ` (${formatGB(storageUsedBytes)} / ${plan.storageLimitGB} GB)`}
                  {galleryInsufficient && ` (${galleryCount} / ${plan.galleryLimit})`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <Modal
        open={pendingDowngrade !== null}
        onClose={() => setPendingDowngrade(null)}
        title={t("billing.confirmDowngrade.title")}
        footer={
          <>
            <button type="button" onClick={() => setPendingDowngrade(null)} className="btn-secondary">
              {t("billing.confirmDowngrade.cancel")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (pendingDowngrade) performChange(pendingDowngrade);
                setPendingDowngrade(null);
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {t("billing.confirmDowngrade.confirm")}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">{t("billing.confirmDowngrade")}</p>
      </Modal>
    </div>
  );
}
