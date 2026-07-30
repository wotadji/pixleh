"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
 */
export function ClientPortalSidebar({ email, galleryCount }: { email: string; galleryCount: number }) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useLanguage();
  const [langOpen, setLangOpen] = useState(false);

  const NAV = [
    { href: "/client", label: t("client.nav.myGalleries"), count: galleryCount },
    { href: "/client/orders", label: t("client.nav.myOrders") },
    { href: "/client/settings", label: t("client.nav.settings") },
  ];

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-gray-100 bg-gray-50/50 px-4 py-6">
      <div className="flex items-center gap-2.5 px-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 font-serif text-sm font-semibold text-white">
          {email.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="font-serif text-base font-semibold leading-tight">{t("client.sidebar.title")}</p>
          <p className="truncate text-xs text-gray-500">{email}</p>
        </div>
      </div>

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
    </aside>
  );
}
