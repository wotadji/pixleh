"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/** Pied de page du panel studio (dashboard) — même esprit que MarketingFooter (site public),
 * ancré en bas de la colonne de contenu (pas de la fenêtre) : voir dashboard/layout.tsx. */
export function DashboardFooter() {
  const { t } = useLanguage();
  return (
    <footer className="border-t border-gray-100 px-4 py-6 md:px-8">
      {/* `px-8` fixe (au lieu de suivre le `p-4 md:p-8` du `<main>`) laissait le pied de
          page moins centré que le contenu au-dessus sur mobile — corrigé pour matcher, et
          `text-center` ajouté au cas où le texte passe sur deux lignes (demande d'Adriel le
          12/08/2026 : "bien centrer le footer"). */}
      <div className="flex flex-col items-center justify-between gap-3 text-center text-xs text-gray-400 sm:flex-row sm:text-left">
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
