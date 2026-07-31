"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SignOutButton } from "@/components/studio/SignOutButton";

export function DashboardSidebar({
  studioName,
  studioSlug,
  isPlatformAdmin,
  unreadClientsCount = 0,
}: {
  /** Nom du studio (Studio.name), affiché sous "pixleh" — remplace le nom de l'utilisateur
   * connecté (30/07/2026, demande d'Adriel) : le studio peut avoir plusieurs membres (OWNER/
   * TEAM), donc le nom du studio identifie mieux "où on est" que celui de la personne connectée. */
  studioName: string;
  studioSlug: string;
  isPlatformAdmin?: boolean;
  /** Nombre de clients/prospects avec un message de contact non lu — bulle rouge sur le
   * lien "Clients" (même style que le badge Remarques dans GalleryManager). */
  unreadClientsCount?: number;
}) {
  const { t } = useLanguage();
  const pathname = usePathname();

  // "/dashboard" (Vue d'ensemble) ne doit s'allumer que sur la page exacte, sinon il
  // resterait actif sur toutes les sous-pages (/dashboard/galleries, etc.) puisqu'elles
  // commencent toutes par le même préfixe.
  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  // `onboarding` : identifiant ciblé par OnboardingGuide (voir data-onboarding-target
  // ci-dessous) pour dessiner une flèche vers CE lien précis pendant l'étape correspondante
  // du guide de bienvenue — undefined pour les liens non couverts par le guide.
  const nav: { href: string; label: string; onboarding?: string }[] = [
    { href: "/dashboard", label: t("nav.overview"), onboarding: "overview" },
    { href: "/dashboard/galleries", label: t("nav.galleries"), onboarding: "galleries" },
    { href: "/dashboard/clients", label: t("nav.clients"), onboarding: "clients" },
    // "Boutique" et "Blog" masqués temporairement du menu studio (31/07/2026, demande
    // d'Adriel : "pour un début masquer le bouton boutique et blog dans le panel du studio,
    // nous le ferons après") — dans le cadre du chantier "impression pixleh/Prodigi" : la
    // gestion des produits d'impression va basculer vers le panel Admin plateforme, donc
    // "Boutique" n'a plus vocation à rester une page studio en l'état. Les pages/routes ne
    // sont PAS supprimées, juste retirées de la nav — à réactiver ou retravailler plus tard.
    { href: "/dashboard/orders", label: t("nav.orders") },
    { href: "/dashboard/bookings", label: t("nav.bookings") },
    { href: "/dashboard/contracts", label: t("nav.contracts") },
    { href: "/dashboard/invoices", label: t("nav.invoices") },
    { href: "/dashboard/billing", label: t("nav.billing") },
    { href: "/dashboard/website", label: t("nav.website"), onboarding: "website" },
    { href: "/dashboard/settings", label: t("nav.settings") },
  ];

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-gray-100 bg-gray-50 p-4">
      <div className="mb-6 px-2">
        <p className="font-serif text-lg font-semibold">pixleh</p>
        <p className="text-xs text-gray-500">{studioName}</p>
      </div>
      <nav className="space-y-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-onboarding-target={item.onboarding}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
              isActive(item.href)
                ? "border-brand-600 bg-white font-medium text-gray-900 shadow-sm"
                : "border-transparent text-gray-700 hover:bg-gray-100"
            }`}
          >
            {item.label}
            {item.href === "/dashboard/clients" && unreadClientsCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
                {unreadClientsCount}
              </span>
            )}
          </Link>
        ))}
      </nav>
      {isPlatformAdmin && (
        <div className="mt-6 border-t border-gray-200 pt-4">
          <Link href="/admin" className="btn-secondary block w-full text-center">
            Administration pixleh
          </Link>
        </div>
      )}
      <div className="mt-6 border-t border-gray-200 pt-4">
        <Link
          href={`/s/${studioSlug}`}
          target="_blank"
          className="block px-3 py-2 text-sm text-brand-600 hover:underline"
        >
          {t("nav.viewPublicSite")}
        </Link>
        <SignOutButton label={t("nav.signOut")} />
      </div>
      <div className="mt-auto border-t border-gray-200 pt-3">
        <LanguageSwitcher />
      </div>
    </aside>
  );
}
