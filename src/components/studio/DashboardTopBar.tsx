"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/locales";
import { useTheme } from "@/components/studio/ThemeProvider";
import { useBreadcrumbExtra } from "@/components/studio/BreadcrumbContext";

/**
 * Barre du haut fixe du dashboard (18/09/2026, demande d'Adriel : "une bar top fix ou on a
 * l'arborescence de navigation, [...] la recherche global sur le site + le boutton de
 * l'apparence + le changemnt de langue"). `sticky top-0` (pas `fixed`) : la sidebar est déjà
 * `md:sticky` dans ce layout en `flex-row`, donc `sticky` sur cette barre — à l'intérieur de
 * la colonne de contenu, à droite de la sidebar — reproduit le même effet "toujours visible
 * au scroll" sans avoir à recalculer un décalage de largeur sidebar/collapsed en CSS pur.
 *
 * Disposition (confirmée par Adriel) : fil d'Ariane à gauche, recherche + apparence + langue
 * groupés à droite.
 */
const SECTION_LABEL_KEYS: Record<string, string> = {
  galleries: "nav.galleries",
  clients: "nav.clients",
  guests: "nav.guests",
  orders: "nav.orders",
  bookings: "nav.bookings",
  contracts: "nav.contracts",
  invoices: "nav.invoices",
  billing: "nav.billing",
  website: "nav.website",
  settings: "nav.settings",
};

// Seules ces 3 sections ont une page "new" avec une clé i18n dédiée (voir dictionaries.ts) —
// pas la peine de generaliser à toutes les sections, aucune autre n'a de route .../new.
const NEW_LABEL_KEYS: Record<string, string> = {
  galleries: "galleries.new",
  contracts: "contracts.new",
  invoices: "invoices.new",
};

type SearchGroupKey = "galleries" | "clients" | "contracts" | "invoices" | "orders" | "bookings";

interface SearchResultItem {
  id: string;
  label: string;
  sublabel: string | null;
}

const SEARCH_GROUPS: { key: SearchGroupKey; labelKey: string; href: (id: string) => string }[] = [
  { key: "galleries", labelKey: "nav.galleries", href: (id) => `/dashboard/galleries/${id}` },
  { key: "clients", labelKey: "nav.clients", href: (id) => `/dashboard/clients?client=${id}` },
  { key: "contracts", labelKey: "nav.contracts", href: (id) => `/dashboard/contracts/${id}` },
  { key: "invoices", labelKey: "nav.invoices", href: (id) => `/dashboard/invoices/${id}` },
  { key: "orders", labelKey: "nav.orders", href: () => `/dashboard/orders` },
  { key: "bookings", labelKey: "nav.bookings", href: () => `/dashboard/bookings` },
];

export function DashboardTopBar() {
  const { t, locale, setLocale } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const breadcrumbExtra = useBreadcrumbExtra();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<SearchGroupKey, SearchResultItem[]> | null>(null);
  const [searching, setSearching] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const langBoxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Débounce (300ms) : évite une requête à chaque frappe, comme les autres recherches déjà
  // en place dans ce panel (galeries, clients).
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => r.json())
        .then((d) => setResults(d))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Ferme les menus ouverts (résultats de recherche, langue) au clic en dehors — même
  // convention que le reste du panel (voir filtersRowRef dans GalleriesListView).
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (langBoxRef.current && !langBoxRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function openSearch() {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function goToResult(href: string) {
    setSearchOpen(false);
    setQuery("");
    setResults(null);
    router.push(href);
  }

  // ---- Fil d'Ariane ----
  const segments = (pathname || "").split("/").filter(Boolean); // ["dashboard", "galleries", "abc123"]
  const crumbs: { label: string; href: string }[] = [{ label: t("nav.overview"), href: "/dashboard" }];
  if (segments.length > 1) {
    const sectionKey = segments[1];
    const sectionLabelKey = SECTION_LABEL_KEYS[sectionKey];
    crumbs.push({
      label: sectionLabelKey ? t(sectionLabelKey) : sectionKey,
      href: `/dashboard/${sectionKey}`,
    });
    if (segments.length > 2) {
      const third = segments[2];
      if (breadcrumbExtra) {
        crumbs.push({ label: breadcrumbExtra, href: pathname || "" });
      } else if (third === "new" && NEW_LABEL_KEYS[sectionKey]) {
        crumbs.push({ label: t(NEW_LABEL_KEYS[sectionKey]).replace(/^\+\s*/, ""), href: pathname || "" });
      }
    }
  }
  const hasResults =
    results && SEARCH_GROUPS.some((g) => (results[g.key] || []).length > 0);

  return (
    <div className="sticky top-0 z-30 hidden items-center justify-between gap-4 border-b border-gray-100 bg-white/95 px-6 py-3 backdrop-blur md:flex dark:border-gray-800 dark:bg-gray-900/95">
      {/* Fil d'Ariane */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={`${crumb.href}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">
                  /
                </span>
              )}
              {isLast ? (
                <span className="truncate font-medium text-gray-900 dark:text-gray-100" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {crumb.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      {/* Outils : recherche, apparence, langue */}
      <div className="flex shrink-0 items-center gap-1">
        <div ref={searchBoxRef} className="relative">
          {searchOpen ? (
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("topbar.searchPlaceholder")}
                className="h-8 w-64 rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              {query.trim().length >= 2 && (
                <div className="absolute right-0 top-9 z-40 max-h-96 w-80 overflow-y-auto rounded-lg border border-gray-200 bg-white py-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                  {searching && !results ? (
                    <p className="px-3 py-2 text-sm text-gray-400">{t("gm.loading")}</p>
                  ) : !hasResults ? (
                    <p className="px-3 py-2 text-sm text-gray-400">{t("topbar.noResults")}</p>
                  ) : (
                    SEARCH_GROUPS.map((group) => {
                      const items = results?.[group.key] || [];
                      if (items.length === 0) return null;
                      return (
                        <div key={group.key} className="px-1 py-1">
                          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                            {t(group.labelKey)}
                          </p>
                          {items.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => goToResult(group.href(item.id))}
                              className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                              <span className="text-gray-900 dark:text-gray-100">{item.label}</span>
                              {item.sublabel && (
                                <span className="ml-1.5 text-xs text-gray-400">· {item.sublabel}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={openSearch}
              aria-label={t("topbar.searchAriaLabel")}
              title={t("topbar.searchAriaLabel")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <SearchIcon />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? t("topbar.disableDarkMode") : t("topbar.enableDarkMode")}
          title={theme === "dark" ? t("topbar.disableDarkMode") : t("topbar.enableDarkMode")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <AppearanceIcon dark={theme === "dark"} />
        </button>

        <div ref={langBoxRef} className="relative">
          <button
            type="button"
            onClick={() => setLangOpen((v) => !v)}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <span className="uppercase">{locale}</span>
            <span className="text-xs">▾</span>
          </button>
          {langOpen && (
            <div className="absolute right-0 top-9 z-40 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    setLocale(l);
                    setLangOpen(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    l === locale ? "font-medium text-brand-600" : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

/** Soleil/lune — même paire visuelle que le bouton d'apparence de GalleryManager (voir
 * IconAppearanceToggle), pour rester cohérent dans tout le panel. */
function AppearanceIcon({ dark }: { dark: boolean }) {
  if (dark) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4.5" />
      <path
        d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
