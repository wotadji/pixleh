"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Équivalent de PasswordGate pour le lien invité (/invite/[guestSlug]) : demande un email
 * (jamais un mot de passe) et enregistre le visiteur dans GalleryGuest via /api/guest-access.
 */
export function EmailGate({ guestSlug, title }: { guestSlug: string; title: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/guest-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestSlug, email, marketingOptIn }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Une erreur est survenue");
      return;
    }
    // Que la demande soit immédiatement approuvée ou mise en attente (voir
    // Gallery.requireGuestApproval), la page se recharge : checkGuestAccess (côté serveur)
    // décide ensuite d'afficher la galerie ou l'écran d'attente à partir du statut en base.
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-serif text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-gray-600">
        Cette sélection vous a été partagée par le photographe. Indiquez votre email pour y
        accéder.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          type="email"
          required
          autoFocus
          className="input"
          placeholder="Votre email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="flex items-start gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
          />
          <span>J&apos;accepte de recevoir des actualités du photographe par email (facultatif).</span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Vérification..." : "Accéder à la galerie"}
        </button>
      </form>
    </div>
  );
}
