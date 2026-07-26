"use client";

import { useEffect, useState } from "react";
import { getProviders, signIn, type ClientSafeProvider } from "next-auth/react";
import { GoogleIcon, GitHubIcon, MicrosoftIcon, FacebookIcon, LinkedInIcon, AppleIcon } from "./SocialIcons";

const PROVIDER_ORDER = ["google", "linkedin", "facebook", "github", "azure-ad", "apple"];

const PROVIDER_META: Record<string, { label: string; icon: React.ReactNode }> = {
  google: { label: "Continuer avec Google", icon: <GoogleIcon /> },
  linkedin: { label: "Continuer avec LinkedIn", icon: <LinkedInIcon /> },
  facebook: { label: "Continuer avec Facebook", icon: <FacebookIcon /> },
  github: { label: "Continuer avec GitHub", icon: <GitHubIcon /> },
  "azure-ad": { label: "Continuer avec Microsoft", icon: <MicrosoftIcon /> },
  apple: { label: "Continuer avec Apple", icon: <AppleIcon /> },
};

/**
 * Liste verticale des boutons "Continuer avec ..." pour /login et /register — n'affiche
 * que les fournisseurs réellement configurés côté serveur (variables d'env renseignées,
 * voir src/lib/auth.ts), via l'endpoint standard NextAuth /api/auth/providers
 * (getProviders()). Ne rend rien tant qu'aucun fournisseur n'est actif — pas de séparateur
 * "ou" intégré ici : c'est la page appelante qui l'affiche, pour pouvoir aussi l'utiliser
 * entre les boutons et l'option "Créer un compte avec email" (voir register/page.tsx).
 *
 * `intent` : posé dans un cookie juste avant de lancer le flux OAuth, lu côté serveur dans
 * le callback signIn() (voir src/lib/auth.ts) pour décider si un compte peut être créé
 * automatiquement à la volée quand aucun compte n'existe pour cet email :
 * - "register" (par défaut) : comportement historique, un tout nouveau Studio est créé.
 * - "login" : refuse la connexion (redirige vers /login?error=NoAccount) plutôt que de
 *   silencieusement recréer un compte — sinon, juste après avoir supprimé son compte
 *   (droit à l'effacement), un simple clic sur "Continuer avec Google" en redonnait
 *   immédiatement un nouveau avec la même adresse, donnant l'illusion trompeuse que le
 *   compte supprimé "fonctionnait encore".
 */
export function SocialLoginButtons({
  callbackUrl = "/dashboard",
  intent = "register",
}: {
  callbackUrl?: string;
  intent?: "login" | "register";
}) {
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProviders().then((p) => {
      if (!cancelled) setProviders(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const oauthProviders = providers
    ? Object.values(providers)
        .filter((p) => p.id !== "credentials")
        .sort((a, b) => PROVIDER_ORDER.indexOf(a.id) - PROVIDER_ORDER.indexOf(b.id))
    : [];

  if (oauthProviders.length === 0) return null;

  return (
    <div className="space-y-2">
      {oauthProviders.map((p) => {
        const meta = PROVIDER_META[p.id];
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              // Cookie de très courte durée (30s, largement suffisant pour l'aller-retour
              // OAuth) — voir le commentaire au-dessus de ce composant.
              document.cookie = `pixleh_oauth_intent=${intent}; path=/; max-age=30; SameSite=Lax`;
              signIn(p.id, { callbackUrl });
            }}
            className="flex w-full items-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {meta?.icon}
            <span>{meta?.label ?? `Continuer avec ${p.name}`}</span>
          </button>
        );
      })}
    </div>
  );
}
