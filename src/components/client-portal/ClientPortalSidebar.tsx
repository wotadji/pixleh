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
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-100 bg-gray-50/50 px-4 py-6">
      <div className="px-2">
        <p className="font-serif text-lg font-semibold">{t("client.sidebar.title")}</p>
        <p className="mt-0.5 truncate text-xs text-gray-500">{email}</p>
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-white font-medium text-gray-900 shadow-sm" : "text-gray-600 hover:bg-white/70"
              }`}
            >
              <span>{item.label}</span>
              {!!item.count && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
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
