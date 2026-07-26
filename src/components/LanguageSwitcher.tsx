"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/locales";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100"
      >
        <span>
          {t("common.language")} · {LOCALE_LABELS[locale]}
        </span>
        <span className="text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-1 w-full min-w-[10rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {LOCALES.map((l) => (
            <button
              key={l}
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
      )}
    </div>
  );
}
