"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/** Partie présentationnelle de /admin (Vue d'ensemble) — extraite en client component car
 * useLanguage() (Context React) n'est pas appelable depuis page.tsx, un Server Component
 * qui va chercher les stats en base (voir requête Prisma dans page.tsx). i18n ajoutée le
 * 02/08/2026 dans le cadre du chantier "tout traduire" du panel admin (demande d'Adriel). */
export function AdminOverviewView({
  studioCount,
  planCount,
  activeSubscriptions,
}: {
  studioCount: number;
  planCount: number;
  activeSubscriptions: number;
}) {
  const { t } = useLanguage();

  const stats = [
    { label: t("admin.overview.statStudios"), value: studioCount },
    { label: t("admin.overview.statPlans"), value: planCount },
    { label: t("admin.overview.statActiveSubs"), value: activeSubscriptions },
  ];

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">{t("admin.overview.title")}</h1>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <p className="text-2xl font-semibold">{s.value}</p>
            <p className="mt-1 text-sm text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card">
          <h2 className="font-medium">{t("admin.overview.studiosTitle")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("admin.overview.studiosDesc")}</p>
          <Link href="/admin/studios" className="btn-primary mt-4 inline-block">
            {t("admin.overview.studiosLink")}
          </Link>
        </div>
        <div className="card">
          <h2 className="font-medium">{t("admin.overview.plansTitle")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("admin.overview.plansDesc")}</p>
          <Link href="/admin/plans" className="btn-primary mt-4 inline-block">
            {t("admin.overview.plansLink")}
          </Link>
        </div>
      </div>
    </div>
  );
}
