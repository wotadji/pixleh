import type { Config } from "tailwindcss";

const config: Config = {
  // Mode sombre du panel studio (18/09/2026, demande d'Adriel : bouton "apparence" dans la
  // nouvelle barre du haut fixe) — piloté par une classe "dark" posée sur <html> par
  // ThemeProvider (src/components/studio/ThemeProvider.tsx), plutôt que le défaut "media" qui
  // suivrait uniquement les préférences OS sans bouton pour l'utilisateur.
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    // Certaines classes Tailwind (grille de la galerie, etc.) sont construites dans des
    // fonctions utilitaires sous src/lib (ex: galleryDesign.ts) plutôt que directement
    // dans un composant : sans ce glob, le JIT ne les détecte jamais et ne génère pas
    // le CSS correspondant (classes "manquantes" en production comme en dev).
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Redesign "Minimal contemporain" (24/08/2026, choisi par Adriel parmi 3 directions
        // proposées) : accent indigo (auparavant violet) — reprend la palette indigo standard
        // de Tailwind, dont le 600 correspond exactement à la couleur validée (#4F46E5).
        // Comme "brand" est le seul point d'entrée couleur utilisé dans tout le produit (51
        // usages), ce changement recolore l'ensemble du panel studio, de l'admin et du site
        // marketing sans avoir à toucher chaque fichier individuellement.
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
      },
      fontFamily: {
        // 12/09/2026 : alignement de la typographie de TOUT le chrome pixleh (site marketing,
        // panel studio, panel admin, habillage des galeries publiques) sur celle du concurrent
        // Pixieset. Inspection live de pixieset.com (getComputedStyle) : leur police déclarée
        // est `proxima-nova, Lato, ...` — proxima-nova étant une police payante (Adobe), Lato
        // est leur propre fallback officiel et gratuit (Google Fonts) : c'est le choix le plus
        // fidèle et légitime. Une seule famille "Lato" couvre maintenant sans/serif (comme chez
        // Pixieset qui n'utilise qu'une seule police pour tout), via --font-lato (layout.tsx).
        // NB : Lato n'a pas de graisse 600 native (seulement 100/300/400/700/900) ; les titres
        // Pixieset (weight 600) sont donc approximés par le poids 700 le plus proche.
        // --font-inter et --font-playfair restent chargés séparément (voir layout.tsx) car
        // src/lib/galleryDesign.ts les utilise encore comme polices que les studios peuvent
        // choisir pour LEUR PROPRE galerie publique — indépendant du chrome pixleh lui-même.
        sans: ["var(--font-lato)", "system-ui", "sans-serif"],
        serif: ["var(--font-lato)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
