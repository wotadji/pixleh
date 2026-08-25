import type { Config } from "tailwindcss";

const config: Config = {
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
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        // "serif" reste le nom de la clé Tailwind (repris dans 66 fichiers via `font-serif`
        // pour les titres/en-têtes de TOUTE l'interface pixleh) mais pointe maintenant vers
        // Space Grotesk plutôt que Playfair — direction "Minimal contemporain" : plus aucun
        // serif dans le chrome du produit. Playfair Display reste chargé séparément (voir
        // layout.tsx) car src/lib/galleryDesign.ts l'utilise encore comme option de police
        // "Serif"/"Intemporelle" que les studios peuvent choisir pour LEUR PROPRE galerie
        // publique — un choix esthétique du photographe, indépendant du redesign de pixleh.
        serif: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
