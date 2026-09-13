import type { Metadata } from "next";
import { Inter, Lato, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { CookieConsent } from "@/components/CookieConsent";

// Police de TOUTE l'interface pixleh (site marketing, panel studio, panel admin, habillage
// des galeries publiques) — voir tailwind.config.ts, clés "sans"/"serif". Alignée le
// 12/09/2026 sur la typographie du concurrent Pixieset (leur fallback officiel de
// `proxima-nova`, police payante). 300/400/700 couvrent les graisses réellement utilisées
// dans le produit (Lato n'a pas de 600 natif : les titres "font-semibold" retombent sur 700).
const lato = Lato({ subsets: ["latin"], weight: ["300", "400", "700"], variable: "--font-lato" });
// Toujours chargée : src/lib/galleryDesign.ts l'utilise comme option de police que les
// studios peuvent choisir pour LEUR PROPRE galerie publique (choix du photographe, distinct
// du chrome pixleh lui-même) — ne pas retirer sous peine de casser ces galeries.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Idem : option "Serif"/"Intemporelle" du sélecteur de police des galeries studio.
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "pixleh — Galeries, boutique et site pour photographes",
  description:
    "Plateforme tout-en-un pour photographes : galeries clients, proofing, vente de tirages, réservation, contrats et site vitrine.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${lato.variable} ${inter.variable} ${playfair.variable}`}>
      <body>
        <Providers>
          {children}
          <CookieConsent />
        </Providers>
      </body>
    </html>
  );
}
