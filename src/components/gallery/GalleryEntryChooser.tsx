"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Écran d'accueil d'une galerie (/g/[gallerySlug]) affiché tant que le visiteur n'a choisi
 * ni "client" ni "invité" pour cette galerie (voir la page, qui décide côté serveur si ce
 * chooser doit s'afficher via getGallerySession). Remplace les deux anciens gates séparés
 * (PasswordGate seul sur /g/[slug], EmailGate seul sur /invite/[guestSlug]) par un point
 * d'entrée UNIQUE : un même lien à partager, quel que soit le visiteur — demandé par Adriel
 * après avoir remarqué qu'un visiteur "invité" tombait directement dans la galerie sans
 * qu'on lui demande son email dès lors qu'il utilisait le lien client (comportement normal
 * de PasswordGate seul, mais pas le parcours voulu).
 *
 * Le mode "client" pose un vrai cookie de session même si la galerie n'a pas de mot de
 * passe (voir /api/gallery-access, qui accepte un mot de passe vide quand
 * `gallery.password` est null) — corrige au passage la limite historique où tous les
 * visiteurs sans mot de passe partageaient un même `clientRef` "anonymous" (voir
 * checkGalleryAccess) : chacun obtient désormais son propre identifiant de visite.
 */
export function GalleryEntryChooser({
  title,
  studioName,
  coverUrl,
  coverFocalX = 0.5,
  coverFocalY = 0.5,
  gallerySlug,
  guestSlug,
  requiresPassword,
}: {
  title: string;
  studioName: string;
  coverUrl: string | null;
  /** Point focal (0 à 1) réglé par le studio pour cette couverture — voir
   * CoverFocalPointModal et GalleryCover dans GalleryView.tsx, même mécanisme ici. */
  coverFocalX?: number;
  coverFocalY?: number;
  gallerySlug: string;
  guestSlug: string | null;
  requiresPassword: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"choice" | "client" | "guest">("choice");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function enterAsClient(password: string) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/gallery-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: gallerySlug, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Mot de passe incorrect");
      return;
    }
    router.refresh();
  }

  function handleClientClick() {
    if (requiresPassword) {
      setMode("client");
      return;
    }
    // Pas de mot de passe configuré : on entre directement, sans rien demander de plus
    // (voir enterAsClient, qui pose quand même un cookie de session propre au visiteur).
    enterAsClient("");
  }

  async function handleGuestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guestSlug) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/guest-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestSlug, email: value }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Une erreur est survenue");
      return;
    }
    router.refresh();
  }

  async function handleClientSubmit(e: React.FormEvent) {
    e.preventDefault();
    await enterAsClient(value);
  }

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gray-900 px-6 text-center"
      style={
        coverUrl
          ? {
              backgroundImage: `url(${coverUrl})`,
              backgroundSize: "cover",
              backgroundPosition: `${coverFocalX * 100}% ${coverFocalY * 100}%`,
            }
          : undefined
      }
    >
      <div className="absolute inset-0 bg-black/55" />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-white">
        <h1 className="font-serif text-2xl font-semibold uppercase tracking-wide">{title}</h1>
        {studioName && <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/70">{studioName}</p>}

        {mode === "choice" && (
          <>
            <p className="mt-8 text-sm text-white/90">
              <span className="font-semibold">Bienvenue</span>. Choisissez l&apos;une des options suivantes pour continuer :
            </p>
            <div className="mt-6 w-full space-y-3">
              <button
                type="button"
                onClick={handleClientClick}
                disabled={loading}
                className="w-full border border-white/70 px-6 py-3 text-xs uppercase tracking-[0.15em] text-white transition hover:bg-white hover:text-gray-900"
              >
                {loading ? "..." : "Entrer en tant que client"}
                <span className="mt-0.5 block text-[10px] normal-case tracking-normal text-white/60">
                  J&apos;ai le mot de passe fourni par le photographe
                </span>
              </button>
              {guestSlug && (
                <button
                  type="button"
                  onClick={() => setMode("guest")}
                  className="w-full border border-white/70 px-6 py-3 text-xs uppercase tracking-[0.15em] text-white transition hover:bg-white hover:text-gray-900"
                >
                  Entrer en tant qu&apos;invité
                  <span className="mt-0.5 block text-[10px] normal-case tracking-normal text-white/60">
                    Mon accès doit être validé par le client
                  </span>
                </button>
              )}
            </div>
          </>
        )}

        {mode === "guest" && (
          <form onSubmit={handleGuestSubmit} className="mt-8 w-full space-y-3 text-left">
            <p className="text-center text-sm text-white/90">
              Indiquez votre email pour accéder à cette sélection.
            </p>
            <input
              type="email"
              required
              autoFocus
              placeholder="Votre email"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-lg border border-white/40 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/60 focus:border-white focus:outline-none"
            />
            {error && <p className="text-center text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Vérification..." : "Accéder à la galerie"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("choice");
                setError(null);
              }}
              className="w-full text-center text-xs uppercase tracking-wide text-white/70 hover:text-white"
            >
              ← Retour
            </button>
          </form>
        )}

        {mode === "client" && (
          <form onSubmit={handleClientSubmit} className="mt-8 w-full space-y-3 text-left">
            <p className="text-center text-sm text-white/90">
              Cette galerie est protégée. Saisissez le mot de passe fourni par le photographe.
            </p>
            <input
              type="password"
              required
              autoFocus
              placeholder="Mot de passe"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-lg border border-white/40 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/60 focus:border-white focus:outline-none"
            />
            {error && <p className="text-center text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Vérification..." : "Accéder à la galerie"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("choice");
                setError(null);
              }}
              className="w-full text-center text-xs uppercase tracking-wide text-white/70 hover:text-white"
            >
              ← Retour
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
