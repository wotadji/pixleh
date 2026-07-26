"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { IconWarning } from "@/components/studio/OverviewIcons";

/**
 * Bandeau "confirmez votre email" — même emplacement/style que QuotaAlertBanner (montée
 * globalement dans dashboard/layout.tsx). N'apparaît que pour les comptes email/mot de passe
 * jamais confirmés (les comptes Social Login sont vérifiés dès la création, voir
 * provisionStudioWithOwner) : on ne bloque jamais l'accès au dashboard pour ça (voir
 * /api/auth/resend-verification), juste un rappel discret et actionnable.
 */
export function EmailVerificationBanner({ verified }: { verified: boolean }) {
  const { t } = useLanguage();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (verified || sent || dismissed) return null;

  async function handleResend() {
    setSending(true);
    await fetch("/api/auth/resend-verification", { method: "POST" }).catch(() => null);
    setSending(false);
    setSent(true);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <div className="flex items-center gap-2">
        <IconWarning className="h-4 w-4 shrink-0 text-amber-500" />
        <span>{t("verifyEmail.message")}</span>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <button onClick={handleResend} disabled={sending} className="font-medium underline hover:no-underline">
          {sending ? t("verifyEmail.sending") : t("verifyEmail.resend")}
        </button>
        <button onClick={() => setDismissed(true)} className="text-amber-500 hover:text-amber-700" aria-label="Fermer">
          ✕
        </button>
      </div>
    </div>
  );
}
