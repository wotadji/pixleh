"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

const STORAGE_KEY = "pixleh_cookie_consent";

export type CookieConsentValue = "accepted" | "refused";

/**
 * Choix de consentement déjà enregistré, ou null si le visiteur n'a pas encore répondu.
 * Utilisable par un futur script d'analytics/marketing pour savoir s'il peut se charger
 * (voir Sprint 4 / Sentry par exemple, ou un futur outil d'analytics produit) — aujourd'hui
 * pixleh ne charge aucun cookie non essentiel, ce composant prépare le terrain plutôt
 * que de répondre à un besoin déjà actif.
 */
export function getCookieConsent(): CookieConsentValue | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "accepted" || value === "refused" ? value : null;
}

/**
 * Bandeau de consentement cookies, affiché une seule fois (jusqu'à réponse) en bas de
 * l'écran. Les cookies strictement nécessaires (session studio, session galerie) ne
 * dépendent PAS de ce choix — ils sont indispensables au fonctionnement du service et ne
 * sont donc pas soumis à consentement au sens RGPD. Ce bandeau prépare l'ajout futur de
 * cookies non essentiels (mesure d'audience, etc.).
 */
export function CookieConsent() {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getCookieConsent() === null);
  }, []);

  function respond(value: CookieConsentValue) {
    window.localStorage.setItem(STORAGE_KEY, value);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white px-4 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          {t("cookie.bannerText")}{" "}
          <a href="/confidentialite" className="underline hover:text-gray-900">
            {t("cookie.learnMore")}
          </a>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => respond("refused")} className="btn-secondary text-sm">
            {t("cookie.reject")}
          </button>
          <button type="button" onClick={() => respond("accepted")} className="btn-primary text-sm">
            {t("cookie.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
