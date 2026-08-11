"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/locales";
import { LogoutButton } from "@/components/client-portal/LogoutButton";

/**
 * Barre latérale de l'espace Client (/client/*), affichée par le layout du groupe (app) —
 * pas sur /client/login, en dehors de ce groupe (voir layout.tsx). Demandé par Adriel le
 * 30/07/2026 : navigation entre les galeries, les commandes d'impression passées dans
 * n'importe quel studio (voir /client/orders), le profil (nom/mot de passe, voir
 * /client/settings) et la langue de l'interface — jusqu'ici seule la page /client existait,
 * sans aucune navigation vers autre chose. `galleryCount` (bulle à côté de "Mes galeries",
 * déplacée ici depuis le titre de /client/page.tsx le 30/07/2026) est compté par le layout
 * serveur pour rester disponible sur toutes les pages, pas seulement /client.
 *
 * Refonte responsive du 11/08/2026 (demande d'Adriel : "la galerie en mode invité et client
 * n'est pas responsive et surtout l'entete la barre de menu") — la sidebar était en largeur
 * fixe (w-60) sans aucun repli mobile, ce qui écrasait le contenu sur petit écran. Elle est
 * maintenant :
 * - masquée en dessous de md et remplacée par une barre du haut compacte (logo + bouton
 *   menu) ;
 * - accessible via un tiroir (drawer) plein écran ouvert par ce bouton, avec la même
 *   navigation que la version desktop ;
 * - inchangée à partir de md (aside fixe w-60, comportement historique).
 */
export function ClientPortalSidebar({ email, galleryCount }: { email: string; galleryCount: number }) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useLanguage();
  const [langOpen, setLangOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Ferme le tiroir mobile automatiquement à chaque changement de page (clic sur un lien de
  // nav) plutôt que de dépendre d'un onClick sur chaque <Link> individuellement.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const NAV = [
    { href: "/client", label: t("client.nav.myGalleries"), count: galleryCount },
    { href: "/client/orders", label: t("client.nav.myOrders") },
    { href: "/client/settings", label: t("client.nav.settings") },
  ];

  const identity = (
    <div className="flex items-center gap-2.5 px-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 font-serif text-sm font-semibold text-white">
        {email.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0">
        <p className="font-serif text-base font-semibold leading-tight">{t("client.sidebar.title")}</p>
        <p className="truncate text-xs text-gray-500">{email}</p>
      </div>
    </div>
  );

  const nav = (
    <nav className="mt-6 flex flex-1 flex-col gap-0.5">
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex items-center justify-between rounded-lg py-2 pl-3.5 pr-3 text-sm transition-colors ${
              active ? "bg-white font-medium text-gray-900 shadow-sm" : "text-gray-600 hover:bg-white/70"
            }`}
          >
            {active && (
              <span className="absolute -left-1 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-brand-600" />
            )}
            <span>{item.label}</span>
            {!!item.count && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  active ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-600"
                }`}
              >
                {item.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const languageAndLogout = (
    <div className="relative mt-4 border-t border-gray-100 pt-4">
      <button
        type="button"
        onClick={() => setLangOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-white/70"
      >
        <span>{LOCALE_LABELS[locale]}</span>
        <span className="text-xs text-gray-400">▾</span>
      </button>
      {langOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-1 w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  setLocale(l);
                  setLangOpen(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${
                  l === locale ? "font-medium text-brand-600" : "text-gray-700"
                }`}
              >
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="mt-2">
        <LogoutButton />
      </div>
    </div>
  );

  return (
    <>
      {/* Barre du haut mobile (< md) : identité compacte + bouton menu, remplace la sidebar
          fixe qui n'a plus la place de s'afficher sur petit écran. */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 font-serif text-xs font-semibold text-white">
            {email.slice(0, 1).toUpperCase()}
          </span>
          <p className="truncate font-serif text-sm font-semibold leading-tight">{t("client.sidebar.title")}</p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t("client.nav.menu")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
        >
          <IconMenu />
        </button>
      </div>

      {/* Tiroir mobile (< md) : même navigation que la sidebar desktop, en overlay. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-gray-50/95 px-4 py-6 shadow-xl">
            <div className="flex items-center justify-between">
              {identity}
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t("client.nav.close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
              >
                <IconClose />
              </button>
            </div>
            {nav}
            {languageAndLogout}
          </div>
        </div>
      )}

      {/* Sidebar fixe desktop (à partir de md), comportement historique inchangé. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-100 bg-gray-50/50 px-4 py-6 md:flex">
        {identity}
        {nav}
        {languageAndLogout}
      </aside>
    </>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
