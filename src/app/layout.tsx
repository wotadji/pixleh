import type { Metadata } from "next";
import { Inter, Playfair_Display, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { CookieConsent } from "@/components/CookieConsent";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Police des titres de TOUTE l'interface pixleh (voir tailwind.config.ts, clé "serif" —
// redesign "Minimal contemporain" du 24/08/2026).
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });
// Toujours chargée : src/lib/galleryDesign.ts l'utilise comme option de police que les
// studios peuvent choisir pour LEUR PROPRE galerie publique (choix du photographe, distinct
// du redesign de pixleh lui-même) — ne pas retirer sous peine de casser ces galeries.
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "pixleh — Galeries, boutique et site pour photographes",
  description:
    "Plateforme tout-en-un pour photographes : galeries clients, proofing, vente de tirages, réservation, contrats et site vitrine.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${spaceGrotesk.variable} ${playfair.variable}`}>
      <body>
        <Providers>
          {children}
          <CookieConsent />
        </Providers>
      </body>
    </html>
  );
}
