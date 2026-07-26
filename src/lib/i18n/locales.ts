export const LOCALES = ["fr", "en", "es", "pt", "zh", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  pt: "Português",
  zh: "中文",
  ar: "العربية",
};

export const RTL_LOCALES: Locale[] = ["ar"];

export const DEFAULT_LOCALE: Locale = "fr";

export const LOCALE_COOKIE = "pixistudio_locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
