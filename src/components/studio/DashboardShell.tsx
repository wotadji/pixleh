"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PixlehLogo } from "@/components/marketing/PixlehLogo";
import { DashboardSidebar } from "@/components/studio/DashboardSidebar";
import { ThemeProvider } from "@/components/studio/ThemeProvider";
import { BreadcrumbProvider } from "@/components/studio/BreadcrumbContext";

/**
 * Coquille cliente du dashboard : porte l'état ouvert/fermé du tiroir mobile (useState),
 * absent du layout.tsx serveur (qui fait des requêtes Prisma et ne peut pas être client).
 * Sur desktop (>= md), rend la sidebar exactement comme avant — statique, toujours visible,
 * pas de barre du haut. En dessous de md, la sidebar devient un tiroir masqué par défaut,
 * ouvert via une barre du haut (logo + bouton hamburger) ajoutée UNIQUEMENT sous md.
 */
export function DashboardShell({
  children,
  ...sidebarProps
}: {
  children: React.ReactNode;
  studioName: string;
  studioSlug: string;
  isPlatformAdmin?: boolean;
  unreadClientsCount?: number;
  profileIncomplete?: boolean;
  missingLogo?: boolean;
  missingContactEmail?: boolean;
}) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Bouton manuel d'affichage/masquage de la sidebar en mode icônes (demande d'Adriel le
  // 18/09/2026 : "on dois mettre un bouton d'affichage et de masquage du sidebar"), en plus
  // du repli automatique désormais actif sur toutes les pages du dashboard (voir `collapsed`
  // dans DashboardSidebar). `null` = pas de préférence manuelle, on suit le comportement
  // automatique de la page courante ; `true`/`false` = l'utilisateur a explicitement basculé
  // et ce choix prime sur l'automatique — mais SEULEMENT le temps de rester sur cette page.
  //
  // Corrigé le 18/09/2026 (retour d'Adriel : "quand je clique sur Clients par exemple la
  // sidebar ne se masque pas") : la version précédente persistait ce choix en localStorage
  // indéfiniment, sur toutes les pages — un seul clic sur "déplier" restait donc collé pour
  // toujours, masquant complètement le nouveau repli automatique par page et donnant
  // l'impression que celui-ci ne fonctionnait plus du tout. Le choix manuel est maintenant
  // remis à zéro à chaque navigation (voir l'effet ci-dessous, déclenché par `pathname`) :
  // il permet de déplier/replier ponctuellement la page affichée, sans jamais figer le
  // comportement des autres pages.
  const [manualCollapsed, setManualCollapsed] = useState<boolean | null>(null);

  useEffect(() => {
    setManualCollapsed(null);
  }, [pathname]);

  function toggleCollapsed(next: boolean) {
    setManualCollapsed(next);
  }

  // Ferme le tiroir automatiquement à chaque changement de page (navigation via un lien de
  // la sidebar) — évite de devoir refermer soi-même le tiroir après avoir cliqué un lien.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Échap ferme le tiroir — même convention que InfoBubble/Modal (voir ces composants).
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    // ThemeProvider (mode sombre du panel, 18/09/2026) et BreadcrumbProvider (fil d'Ariane de
    // DashboardTopBar) doivent englober toute l'ossature du dashboard — sidebar, barre du
    // haut ET contenu des pages — pour que la classe "dark" posée sur <html> et le segment
    // dynamique du fil d'Ariane (ex: titre de galerie, voir GalleryManager) soient visibles
    // partout, pas seulement dans un sous-arbre.
    <ThemeProvider>
      <BreadcrumbProvider>
        {/* Barre du haut mobile/tablette — masquée à partir de md, où la sidebar statique
            suffit (logo déjà dedans). */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3 md:hidden dark:border-gray-800 dark:bg-gray-900">
          {/* Logo à l'extrême droite, bouton menu à gauche — demande d'Adriel le 12/08/2026
              ("mettre le logo a l'extreme droite"), inverse l'ordre précédent (logo gauche /
              menu droite). */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t("nav.openMenu")}
            title={t("nav.openMenu")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <IconMenu />
          </button>
          <PixlehLogo size={22} />
        </div>

        {/* Fond semi-transparent — uniquement affiché (et cliquable pour fermer) quand le
            tiroir est ouvert, sous md ; au-dessus de md la sidebar est statique donc `open`
            n'a aucun effet visuel là-bas (voir classes md: sur DashboardSidebar). */}
        {open && (
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}

        <DashboardSidebar
          {...sidebarProps}
          open={open}
          onClose={() => setOpen(false)}
          manualCollapsed={manualCollapsed}
          onToggleCollapsed={toggleCollapsed}
        />

        {children}
      </BreadcrumbProvider>
    </ThemeProvider>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" strokeLinecap="round" />
    </svg>
  );
}
