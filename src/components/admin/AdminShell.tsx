"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { PixlehLogo } from "@/components/marketing/PixlehLogo";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

/**
 * Coquille cliente du panel admin — même patron que DashboardShell.tsx côté studio
 * (12/08/2026, demande d'Adriel : "applique le meme comportement de sidebar du panel du
 * studio a celui de l'administrateur"). Porte l'état ouvert/fermé du tiroir mobile, absent
 * d'admin/layout.tsx (Server Component qui fait l'auth + les requêtes Prisma). Sur desktop
 * (>= md), la sidebar reste statique comme avant. En dessous de md, elle devient un tiroir
 * masqué par défaut, ouvert via une barre du haut (logo + bouton hamburger) ajoutée
 * uniquement sous md.
 */
export function AdminShell({
  nav,
  children,
}: {
  nav: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Ferme le tiroir automatiquement à chaque changement de page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Échap ferme le tiroir — même convention que côté studio.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Barre du haut mobile/tablette — masquée à partir de md, où la sidebar statique
          suffit (logo déjà dedans). */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("nav.openMenu")}
          title={t("nav.openMenu")}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
        >
          <IconMenu />
        </button>
        <PixlehLogo size={22} />
      </div>

      {/* Fond semi-transparent — uniquement affiché (et cliquable pour fermer) quand le
          tiroir est ouvert, sous md. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <AdminSidebar nav={nav} open={open} onClose={() => setOpen(false)} />

      <main className="flex-1 p-4 sm:p-6 md:p-8">{children}</main>
    </div>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" strokeLinecap="round" />
    </svg>
  );
}
