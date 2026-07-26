"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/locales";

/** Sélecteur de langue compact pour l'en-tête du site marketing public (pas le même style
 * que LanguageSwitcher, pensé pour une barre latérale du dashboard studio) — un déclencheur
 * "FR ▾" qui ouvre un menu vers le bas. `transparent` bascule le déclencheur en texte clair
 * pour l'en-tête superposé sur une photo (Hero "Plein écran") — le menu déroulant lui-même
 * reste sur fond blanc, lisible dans les deux cas. */
export function MarketingLanguageSwitcher({ transparent = false }: { transparent?: boolean }) {
  const { locale, setLocale } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
          transparent ? "text-white/90 hover:bg-white/10 hover:text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`}
        aria-label="Changer de langue"
      >
        <span className="uppercase">{locale}</span>
        <span className="text-xs">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  setLocale(l);
                  setOpen(false);
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
    </div>
  );
}
