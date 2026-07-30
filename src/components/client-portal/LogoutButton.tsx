"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-secondary text-sm"
      onClick={async () => {
        await fetch("/api/client-portal/logout", { method: "POST" });
        router.push("/client/login");
        router.refresh();
      }}
    >
      Se déconnecter
    </button>
  );
}
