"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PixlehLogo } from "@/components/marketing/PixlehLogo";
import { MarketingLanguageSwitcher } from "@/components/marketing/MarketingLanguageSwitcher";
import { LoginMenu } from "@/components/marketing/LoginMenu";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/**
 * En-tête partagé par toutes les pages du site marketing (accueil, exemples, tarifs, à
 * propos) — nav volontairement simple (3 liens) plutôt que le mega-menu multi-produits de
 * Pixieset : pixleh est un seul produit tout-en-un, pas 5 abonnements séparés à lister.
 * Composant client (useLanguage) pour afficher la nav et le sélecteur de langue.
 *
 * `transparent` : quand le tout premier bloc de la page est un Hero en style "Plein écran"
 * (voir firstBlockIsFullBleedHero dans lib/marketingBlocks.ts), l'en-tête se superpose en
 * transparence sur la photo du Hero au lieu d'occuper une bande blanche séparée au-dessus —
 * comme sur pixieset.com. Il devient donc "position: absolute" (ne pousse plus le contenu
 * vers le bas) avec un léger dégradé sombre pour rester lisible sur n'importe quelle photo,
 * et son texte passe en blanc.
 */
export function MarketingHeader({ transparent = false }: { transparent?: boolean }) {
  const { t } = useLanguage();
  const pathname = usePathname();

  const nav = [
    { href: "/exemples", label: t("marketing.nav.exemples") },
    { href: "/tarifs", label: t("marketing.nav.tarifs") },
    { href: "/a-propos", label: t("marketing.nav.apropos") },
  ];

  return (
    <header
      className={
        transparent
          ? "absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/50 via-black/20 to-transparent text-white"
          : "border-b border-gray-100"
      }
    >
      <div className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className={transparent ? "text-white" : undefined}>
          <PixlehLogo size={26} />
        </Link>
        {/* Centrée par rapport à la barre entière (absolute + translate), pas seulement à
            l'espace restant entre le logo et le groupe de boutons à droite — sinon, comme ce
            groupe est plus large que le logo, la nav paraît décalée vers la gauche. */}
        <nav
          className={`absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 text-sm sm:flex ${
            transparent ? "text-white/85" : "text-gray-600"
          }`}
        >
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`border-b-2 pb-1 transition-colors ${
                  active
                    ? transparent
                      ? "border-white text-white"
                      : "border-brand-600 text-gray-900"
                    : transparent
                      ? "border-transparent hover:border-white/50 hover:text-white"
                      : "border-transparent hover:border-gray-300 hover:text-gray-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-4">
          <MarketingLanguageSwitcher transparent={transparent} />
          <LoginMenu transparent={transparent} />
          {/* "Créer mon studio" passe d'abord par la page Tarifs (choix d'un plan) plutôt que
              directement vers l'inscription — "Connexion" reste inchangé (/login) pour un
              utilisateur existant. */}
          <Link href="/tarifs" className="btn-primary">
            {t("marketing.nav.cta")}
          </Link>
        </div>
      </div>
      <nav
        className={`flex items-center justify-center gap-6 px-6 py-2 text-sm sm:hidden ${
          transparent ? "border-t border-white/10 text-white/85" : "border-t border-gray-50 text-gray-600"
        }`}
      >
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`border-b-2 pb-0.5 transition-colors ${
                active
                  ? transparent
                    ? "border-white text-white"
                    : "border-brand-600 text-gray-900"
                  : transparent
                    ? "border-transparent hover:border-white/50 hover:text-white"
                    : "border-transparent hover:border-gray-300 hover:text-gray-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        <Link href="/login" className={transparent ? "hover:text-white" : "hover:text-gray-900"}>
          {t("marketing.nav.loginStudio")}
        </Link>
        <Link href="/client/login" className={transparent ? "hover:text-white" : "hover:text-gray-900"}>
          {t("marketing.nav.loginClient")}
        </Link>
      </nav>
    </header>
  );
}
