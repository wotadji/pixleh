"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/** Pied de page de l'espace Client (/client/*) — même composant que DashboardFooter côté panel
 * studio (voir src/components/studio/DashboardFooter.tsx), ancré en bas de la colonne de
 * contenu (pas de la fenêtre) : voir client/(app)/layout.tsx. Demandé par Adriel le 30/07/2026. */
export function ClientPortalFooter() {
  const { t } = useLanguage();
  return (
    <footer className="border-t border-gray-100 px-6 py-6 sm:px-10">
      <div className="flex flex-col items-center justify-between gap-3 text-xs text-gray-400 sm:flex-row">
        <p>© {new Date().getFullYear()} pixleh — Groupe Lehwu</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <Link href="/mentions-legales" target="_blank" className="hover:text-gray-600 hover:underline">
            {t("footer.legal")}
          </Link>
          <Link href="/cgu" target="_blank" className="hover:text-gray-600 hover:underline">
            {t("footer.terms")}
          </Link>
          <Link href="/cgv" target="_blank" className="hover:text-gray-600 hover:underline">
            {t("footer.sales")}
          </Link>
          <Link href="/confidentialite" target="_blank" className="hover:text-gray-600 hover:underline">
            {t("footer.privacy")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
