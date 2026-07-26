"use client";

import { signOut } from "next-auth/react";

export function SignOutButton({ label = "Déconnexion" }: { label?: string }) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100"
    >
      {label}
    </button>
  );
}
