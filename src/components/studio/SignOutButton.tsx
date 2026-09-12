"use client";

import { signOut } from "next-auth/react";
import type { ReactNode } from "react";

export function SignOutButton({
  label = "Déconnexion",
  icon,
  title,
  className,
}: {
  /** ReactNode (pas juste string) pour permettre au libellé de se masquer en CSS selon la
   * largeur d'écran — voir DashboardSidebar.tsx, mode icônes seules dans une galerie. */
  label?: ReactNode;
  /** Icône optionnelle affichée avant le libellé (redesign sidebar, 01/08/2026). */
  icon?: ReactNode;
  /** Tooltip natif (title HTML) — utile quand le libellé texte est masqué (mode icônes). */
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      title={title}
      className={
        className ??
        "mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100"
      }
    >
      {icon}
      {label}
    </button>
  );
}
