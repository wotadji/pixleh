"use client";

import { useEffect, useState } from "react";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const nav = [
    { href: "/exemples", label: t("marketing.nav.exemples") },
    { href: "/tarifs", label: t("marketing.nav.tarifs") },
    { href: "/a-propos", label: t("marketing.nav.apropos") },
  ];

  // Le tiroir mobile regroupe les 3 liens de nav + les 2 espaces de connexion (Professionnel/
  // Client) — demande d'Adriel, 12/08/2026 : "mettre l'icone du menu et a l'interieur mettre
  // exemples, tarifs, apropos, espace professionnel et espace client". Remplace l'ancienne
  // rangée de liens en dessous du header qui débordait sur deux lignes en mobile.
  const mobileMenuLinks = [
    ...nav,
    { href: "/login", label: t("marketing.nav.loginStudio") },
    { href: "/client/login", label: t("marketing.nav.loginClient") },
  ];

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileMenuOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mobileMenuOpen]);

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
          <Link href="/tarifs" className="btn-primary hidden sm:inline-flex">
            {t("marketing.nav.cta")}
          </Link>
          {/* Icône menu — mobile uniquement, placée à droite du header — demande d'Adriel,
              12/08/2026. Ouvre un tiroir avec les 3 liens de nav + Espace Professionnel/Client
              (auparavant sur une rangée séparée sous le header, qui débordait sur mobile). */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            title={mobileMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            className={`flex h-9 w-9 items-center justify-center rounded-lg sm:hidden ${
              transparent ? "text-white hover:bg-white/10" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {mobileMenuOpen ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-10 sm:hidden" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
          <nav
            className={`relative z-20 flex flex-col gap-0.5 border-t px-4 py-3 text-sm sm:hidden ${
              transparent ? "border-white/10 bg-black/70 text-white/90 backdrop-blur" : "border-gray-100 bg-white text-gray-700"
            }`}
          >
            {mobileMenuLinks.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-lg px-3 py-2.5 font-medium transition-colors ${
                    active
                      ? transparent
                        ? "bg-white/10 text-white"
                        : "bg-brand-50 text-brand-700"
                      : transparent
                        ? "hover:bg-white/10"
                        : "hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/tarifs"
              onClick={() => setMobileMenuOpen(false)}
              className="btn-primary mt-2 justify-center"
            >
              {t("marketing.nav.cta")}
            </Link>
          </nav>
        </>
      )}
    </header>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" strokeLinecap="round" />
    </svg>
  );
}
