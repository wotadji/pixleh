"use client";

// Filet de sécurité ultime : capté uniquement quand une erreur survient dans le RootLayout
// lui-même (donc AVANT que error.tsx habituel des sous-routes ne puisse s'afficher) — un cas
// rare mais réel (ex : erreur de rendu dans <Providers> ou <CookieConsent>). Remplace alors
// ENTIÈREMENT le layout, d'où le <html>/<body> complet ci-dessous plutôt qu'un simple
// fragment. Voir la doc Sentry Next.js "Capture React Render Errors".
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Ce fichier remplace ENTIÈREMENT le <html> du RootLayout (voir commentaire plus bas), donc
// les classes de police définies dans RootLayout (variable CSS --font-*) ne sont jamais
// appliquées ici — sans son propre chargement, font-sans/font-serif tomberaient sur les
// polices système par défaut du navigateur.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="font-serif text-2xl font-semibold text-gray-900">
            Une erreur inattendue est survenue
          </h1>
          <p className="max-w-md text-sm text-gray-600">
            L&apos;équipe technique a été automatiquement notifiée. Vous pouvez réessayer, ou
            revenir à l&apos;accueil si le problème persiste.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Réessayer
            </button>
            <a
              href="/"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Retour à l&apos;accueil
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
