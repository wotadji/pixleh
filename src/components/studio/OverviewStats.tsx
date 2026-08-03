"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { SimpleBarChart } from "@/components/studio/SimpleBarChart";
import { GalleryRankingList } from "@/components/studio/GalleryRankingList";
import {
  IconGallery,
  IconUsers,
  IconBag,
  IconCalendar,
  IconDatabase,
  IconImage,
  IconVideo,
  IconTrendingUp,
  IconUpload,
  IconSparkle,
  IconHeart,
  IconDownloadArrow,
} from "@/components/studio/OverviewIcons";

interface PlanSummary {
  name: string;
  isFree: boolean;
  priceMonthlyCents: number;
  priceAnnualCents: number;
  /** null = illimité. */
  storageLimitGB: number | null;
  /** null = illimité. */
  galleryLimit: number | null;
}

interface StorageByGallery {
  id: string;
  title: string;
  bytes: number;
}

interface PopularGallery {
  id: string;
  title: string;
  likes: number;
  downloads: number;
}

const GB = 1024 ** 3;

function formatGB(bytes: number) {
  const gb = bytes / GB;
  return gb >= 10 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;
}

function StatCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tint: "brand" | "blue" | "emerald" | "amber";
}) {
  const tints: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600",
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="card transition-shadow hover:shadow-md">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tints[tint]}`}>
        <span className="h-5 w-5">{icon}</span>
      </div>
      <p className="mt-3 text-sm text-gray-500">{label}</p>
      <p className="mt-0.5 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

export function OverviewStats({
  galleryCount,
  clientCount,
  paidOrders,
  upcomingBookings,
  plan,
  billingInterval,
  currency,
  storageUsedBytes,
  photoCount,
  videoCount,
  storageByGallery,
  popularGalleries,
  revenueByMonth,
  uploadsByMonth,
  checkoutStatus,
  currentPeriodEnd,
}: {
  galleryCount: number;
  clientCount: number;
  paidOrders: number;
  upcomingBookings: number;
  plan: PlanSummary | null;
  billingInterval: "MONTHLY" | "ANNUAL";
  currency: string;
  storageUsedBytes: number;
  photoCount: number;
  videoCount: number;
  /** Top galeries par espace occupé (photos + vidéos), triées desc. */
  storageByGallery: StorageByGallery[];
  /** Top galeries par favoris + téléchargements, triées desc. */
  popularGalleries: PopularGallery[];
  /** Un total par mois, index 0 = janvier, jusqu'au mois en cours inclus. */
  revenueByMonth: number[];
  uploadsByMonth: number[];
  checkoutStatus?: string;
  /** Date de fin de la période Stripe en cours (prochain prélèvement) — null si gratuit ou
   * pas encore synchronisé. Format ISO (sérialisable depuis un Server Component). */
  currentPeriodEnd?: string | null;
}) {
  const { t, locale } = useLanguage();

  const stats: { label: string; value: number; icon: React.ReactNode; tint: "brand" | "blue" | "emerald" | "amber" }[] = [
    { label: t("overview.stat.galleries"), value: galleryCount, icon: <IconGallery className="h-full w-full" />, tint: "brand" },
    { label: t("overview.stat.clients"), value: clientCount, icon: <IconUsers className="h-full w-full" />, tint: "blue" },
    { label: t("overview.stat.paidOrders"), value: paidOrders, icon: <IconBag className="h-full w-full" />, tint: "emerald" },
    { label: t("overview.stat.upcomingBookings"), value: upcomingBookings, icon: <IconCalendar className="h-full w-full" />, tint: "amber" },
  ];

  const monthLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: "short" });
    return revenueByMonth.map((_, i) => formatter.format(new Date(2000, i, 1)));
  }, [locale, revenueByMonth.length]);

  // maximumFractionDigits: 2 (au lieu de 0) — sinon un prix sous l'unité (ex: 0,02 € pour un
  // plan de test Stripe, ou un petit chiffre d'affaires) s'arrondissait silencieusement à
  // "0 €", ce qui donnait l'impression d'un forfait/CA gratuit ou nul à tort.
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: currency || "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    [locale, currency]
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }),
    [locale]
  );
  const renewalDateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "long" }), [locale]);

  const storageUsedGB = storageUsedBytes / GB;
  const storageLimitGB = plan?.storageLimitGB ?? null;
  const storageRemainingGB = storageLimitGB !== null ? Math.max(0, storageLimitGB - storageUsedGB) : null;
  const storagePct = storageLimitGB ? Math.min(100, (storageUsedGB / storageLimitGB) * 100) : 0;

  const planPriceCents = plan ? (billingInterval === "ANNUAL" ? plan.priceAnnualCents : plan.priceMonthlyCents) : 0;

  const totalRevenueCents = revenueByMonth.reduce((sum, v) => sum + v, 0);
  const totalUploads = uploadsByMonth.reduce((sum, v) => sum + v, 0);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 pb-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">{t("overview.title")}</h1>
          <p className="mt-1 text-sm capitalize text-gray-400">
            {t("overview.periodLabel")} · {dateFormatter.format(new Date())}
          </p>
        </div>
      </div>

      {checkoutStatus === "success" && (
        <div
          className={`mt-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            plan ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-gray-50 text-gray-600"
          }`}
        >
          {plan ? (
            <IconSparkle className="h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
          )}
          {plan
            ? plan.isFree
              ? t("overview.checkout.successFree")
              : `${t("overview.checkout.successPaid")} ${plan.name}.`
            : t("overview.checkout.pending")}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* État du forfait : nom + prix du plan choisi, puis usage (stockage, photos, vidéos) —
          toujours visible ici, y compris juste après l'inscription/le paiement (voir le
          bandeau de confirmation ci-dessus). */}
      <div className="card mt-6 overflow-hidden !p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-brand-50/60 to-transparent px-6 py-4">
          <h2 className="font-serif text-lg font-semibold">{t("overview.plan.title")}</h2>
          {plan ? (
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white">{plan.name}</span>
              {!plan.isFree && (
                <span className="text-sm text-gray-600">
                  {currencyFormatter.format(planPriceCents / 100)}
                  <span className="text-gray-400">{t("overview.plan.perMonth")}</span>
                  {billingInterval === "ANNUAL" && (
                    // planPriceCents pour l'annuel est un prix MENSUEL ÉQUIVALENT (voir
                    // Plan.priceAnnualCents) — Stripe prélève en réalité ce montant x12 une
                    // seule fois par an, jamais tous les mois. Sans cette précision, deux
                    // studios au même prix "par mois" affiché (l'un mensuel, l'autre annuel)
                    // semblent facturés pareil alors que le rythme réel de prélèvement est
                    // complètement différent — voir le montant total ci-dessous.
                    <span className="ml-1 text-gray-400">
                      · {t("billing.plan.billedAnnually")} ({currencyFormatter.format((planPriceCents * 12) / 100)}
                      {t("overview.plan.perYear")})
                    </span>
                  )}
                  {/* Date de fin de période Stripe en cours — surtout utile pour l'annuel :
                      "0,02 €/mois" seul ne dit pas QUAND tombe le prochain prélèvement de
                      0,24 €. Affiché aussi en mensuel pour rester cohérent avec la page
                      Facturation (BillingPlans), qui montre déjà cette date. */}
                  {currentPeriodEnd && (
                    <span className="ml-1 text-gray-400">
                      · {t("billing.current.nextRenewal")} {renewalDateFormatter.format(new Date(currentPeriodEnd))}
                    </span>
                  )}
                </span>
              )}
              <Link href="/dashboard/billing" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                {t("overview.plan.change")} →
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">{t("overview.plan.none")}</span>
              <Link href="/dashboard/billing" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                {t("overview.plan.choose")} →
              </Link>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-gray-500">
              <IconDatabase className="h-4 w-4" />
              <span className="text-sm">{t("overview.plan.storageUsed")}</span>
            </div>
            <p className="mt-2 text-xl font-semibold">
              {storageUsedGB.toFixed(1)} GB
              {storageLimitGB !== null && <span className="text-sm font-normal text-gray-400"> / {storageLimitGB} GB</span>}
            </p>
            {storageLimitGB !== null ? (
              <>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all ${
                      storagePct >= 100 ? "bg-red-500" : storagePct >= 80 ? "bg-amber-500" : "bg-brand-500"
                    }`}
                    style={{ width: `${storagePct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  {t("overview.plan.storageRemaining")} : {storageRemainingGB?.toFixed(1)} GB
                </p>
              </>
            ) : (
              <span className="mt-2.5 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                {t("overview.plan.unlimited")}
              </span>
            )}
          </div>

          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-gray-500">
              <IconImage className="h-4 w-4" />
              <span className="text-sm">{t("overview.plan.photos")}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{photoCount.toLocaleString(locale)}</p>
          </div>

          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-gray-500">
              <IconVideo className="h-4 w-4" />
              <span className="text-sm">{t("overview.plan.videos")}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{videoCount.toLocaleString(locale)}</p>
          </div>
        </div>
      </div>

      {/* BI studio : évolution du chiffre d'affaires et de l'activité d'upload sur l'année
          en cours — deux graphiques en barres légers (voir SimpleBarChart), pas de
          dépendance de charting externe. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <IconTrendingUp className="h-4 w-4" />
              </span>
              <h2 className="font-serif text-lg font-semibold">{t("overview.revenue.title")}</h2>
            </div>
            {totalRevenueCents > 0 && (
              <span className="text-sm font-semibold text-gray-900">{currencyFormatter.format(totalRevenueCents / 100)}</span>
            )}
          </div>
          <div className="mt-5">
            <SimpleBarChart
              data={revenueByMonth.map((cents, i) => ({ label: monthLabels[i], value: cents }))}
              formatValue={(cents) => currencyFormatter.format(cents / 100)}
              emptyLabel={t("overview.revenue.empty")}
              emptyHint={t("overview.revenue.emptyHint")}
              emptyIcon={<IconTrendingUp className="h-full w-full" />}
              barColorClassName="bg-brand-600"
            />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <IconUpload className="h-4 w-4" />
              </span>
              <h2 className="font-serif text-lg font-semibold">{t("overview.uploads.title")}</h2>
            </div>
            {totalUploads > 0 && <span className="text-sm font-semibold text-gray-900">{totalUploads.toLocaleString(locale)}</span>}
          </div>
          <div className="mt-5">
            <SimpleBarChart
              data={uploadsByMonth.map((count, i) => ({ label: monthLabels[i], value: count }))}
              formatValue={(count) => count.toLocaleString(locale)}
              emptyLabel={t("overview.uploads.empty")}
              emptyHint={t("overview.uploads.emptyHint")}
              emptyIcon={<IconUpload className="h-full w-full" />}
              barColorClassName="bg-brand-600"
            />
          </div>
        </div>
      </div>

      {/* Classements galeries : espace occupé et popularité (favoris + téléchargements) —
          top 6 chacun, voir GalleryRankingList. Cliquable vers la galerie concernée. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <IconDatabase className="h-4 w-4" />
            </span>
            <h2 className="font-serif text-lg font-semibold">{t("overview.storage.title")}</h2>
          </div>
          <div className="mt-5">
            <GalleryRankingList
              hrefBase="/dashboard/galleries"
              items={storageByGallery.map((g) => ({
                id: g.id,
                title: g.title,
                value: g.bytes,
                meta: formatGB(g.bytes),
              }))}
              emptyLabel={t("overview.storage.empty")}
              emptyHint={t("overview.storage.emptyHint")}
              emptyIcon={<IconDatabase className="h-full w-full" />}
              barGradientClassName="from-brand-600 to-brand-600"
            />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <IconHeart className="h-4 w-4" />
            </span>
            <h2 className="font-serif text-lg font-semibold">{t("overview.popularity.title")}</h2>
          </div>
          <div className="mt-5">
            <GalleryRankingList
              hrefBase="/dashboard/galleries"
              items={popularGalleries.map((g) => ({
                id: g.id,
                title: g.title,
                value: g.likes + g.downloads,
                meta: (
                  <>
                    <span className="flex items-center gap-1">
                      <IconHeart className="h-3.5 w-3.5" />
                      {g.likes.toLocaleString(locale)}
                    </span>
                    <span className="flex items-center gap-1">
                      <IconDownloadArrow className="h-3.5 w-3.5" />
                      {g.downloads.toLocaleString(locale)}
                    </span>
                  </>
                ),
              }))}
              emptyLabel={t("overview.popularity.empty")}
              emptyHint={t("overview.popularity.emptyHint")}
              emptyIcon={<IconHeart className="h-full w-full" />}
              barGradientClassName="from-brand-600 to-brand-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
