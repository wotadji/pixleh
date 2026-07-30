"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/** Pied de page de l'espace Client (/client/*) — même contenu que DashboardFooter côté panel
 * studio (voir src/components/studio/DashboardFooter.tsx), mais rendu en pleine largeur d'écran
 * (demande d'Adriel du 30/07/2026) : ce composant est placé en dehors du conteneur mx-auto
 * max-w-5xl (sidebar + contenu) dans client/(app)/layout.tsx, donc la bordure/le fond du
 * <footer> couvrent toute la largeur ; seul le contenu (texte + liens) reste centré à
 * max-w-5xl pour s'aligner visuellement avec la colonne de contenu au-dessus. */
export function ClientPortalFooter() {
  const { t } = useLanguage();
  return (
    <footer className="w-full border-t border-gray-100">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-gray-400 sm:flex-row sm:px-10">
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
