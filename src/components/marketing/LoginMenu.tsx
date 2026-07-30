"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/**
 * Remplace le simple lien "Connexion" (→ /login) de l'en-tête marketing par un menu
 * déroulant proposant les deux espaces distincts de la plateforme : le dashboard
 * Professionnel (studio, /login, NextAuth) et l'espace Client (/client/login, session
 * séparée, voir clientSession.ts) — deux publics et deux mécanismes d'authentification
 * différents, voir la spec "accès invités/visibilité" du 29/07/2026. Même patron de menu
 * déroulant que MarketingLanguageSwitcher, pour rester cohérent visuellement.
 */
export function LoginMenu({ transparent = false }: { transparent?: boolean }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 text-sm ${
          transparent ? "text-white/85 hover:text-white" : "text-gray-600 hover:text-gray-900"
        }`}
      >
        {t("marketing.nav.login")}
        <span className="text-xs">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {/* Ancré à gauche (sous la flèche du déclencheur) plutôt qu'à droite : le menu
              s'étend ainsi vers la droite, en direction du bouton "Créer mon studio" juste à
              côté, plutôt que de partir vers la gauche sous "Connexion". */}
          <div className="absolute left-0 top-full z-20 mt-2 min-w-[13rem] rounded-lg border border-gray-200 bg-white py-1.5 text-gray-900 shadow-lg">
            <Link
              href="/login"
              className="block px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => setOpen(false)}
            >
              <span className="block font-medium">{t("marketing.nav.loginStudio")}</span>
              <span className="block text-xs text-gray-500">{t("marketing.nav.loginStudioHint")}</span>
            </Link>
            <Link
              href="/client/login"
              className="block px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => setOpen(false)}
            >
              <span className="block font-medium">{t("marketing.nav.loginClient")}</span>
              <span className="block text-xs text-gray-500">{t("marketing.nav.loginClientHint")}</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
