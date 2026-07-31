"use client";

import { signOut } from "next-auth/react";
import type { ReactNode } from "react";

export function SignOutButton({
  label = "Déconnexion",
  icon,
  className,
}: {
  label?: string;
  /** Icône optionnelle affichée avant le libellé (redesign sidebar, 01/08/2026). */
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
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
