"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PixlehLogo } from "@/components/marketing/PixlehLogo";
import { DashboardSidebar } from "@/components/studio/DashboardSidebar";

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
    <>
      {/* Barre du haut mobile/tablette — masquée à partir de md, où la sidebar statique
          suffit (logo déjà dedans). */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3 md:hidden">
        <PixlehLogo size={22} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("nav.openMenu")}
          title={t("nav.openMenu")}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
        >
          <IconMenu />
        </button>
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

      <DashboardSidebar {...sidebarProps} open={open} onClose={() => setOpen(false)} />

      {children}
    </>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" strokeLinecap="round" />
    </svg>
  );
}
