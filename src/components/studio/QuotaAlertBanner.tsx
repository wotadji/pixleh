"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { IconWarning } from "@/components/studio/OverviewIcons";
import type { QuotaStatus } from "@/lib/quotas";

/**
 * Bandeau d'alerte "pensez à passer à un forfait supérieur" — monté globalement dans
 * dashboard/layout.tsx (visible sur toutes les pages du panel, pas seulement Vue d'ensemble)
 * dès que le stockage OU le nombre de galeries atteint 80% de la limite du plan (voir
 * src/lib/quotas.ts). Rouge si la limite est déjà atteinte/dépassée, ambre entre 80 et 100%.
 */
export function QuotaAlertBanner({ quota }: { quota: QuotaStatus }) {
  const { t } = useLanguage();

  const storageAlert = quota.storageLimitGB !== null && (quota.storageNearLimit || quota.storageExceeded);
  const galleryAlert = quota.galleryLimit !== null && (quota.galleryNearLimit || quota.galleryExceeded);
  if (!storageAlert && !galleryAlert) return null;

  const exceeded = quota.storageExceeded || quota.galleryExceeded;

  const messages: string[] = [];
  if (storageAlert) {
    const pct = Math.min(100, Math.round(quota.storagePct ?? 0));
    messages.push(
      t("quota.storage.message").replace("{pct}", String(pct)).replace("{limit}", String(quota.storageLimitGB))
    );
  }
  if (galleryAlert) {
    messages.push(
      t("quota.gallery.message")
        .replace("{count}", String(quota.galleryCount))
        .replace("{limit}", String(quota.galleryLimit))
    );
  }

  return (
    <div
      className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
        exceeded ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <div className="flex items-center gap-2">
        <IconWarning className={`h-4 w-4 shrink-0 ${exceeded ? "text-red-500" : "text-amber-500"}`} />
        <span>{messages.join(" · ")}</span>
      </div>
      <Link href="/dashboard/billing" className="shrink-0 font-medium underline hover:no-underline">
        {t("quota.upgradeCta")} →
      </Link>
    </div>
  );
}
