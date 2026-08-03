"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SignOutButton } from "@/components/studio/SignOutButton";
import { PixlehLogo } from "@/components/marketing/PixlehLogo";
import { InfoBubble } from "@/components/shared/InfoBubble";

export function DashboardSidebar({
  studioName,
  studioSlug,
  isPlatformAdmin,
  unreadClientsCount = 0,
  profileIncomplete = false,
  missingLogo = false,
  missingContactEmail = false,
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
  /** Profil studio incomplet (logo et/ou email de contact manquants) — affiche une pastille
   * discrète sur l'avatar, avec une bulle expliquant quoi compléter (03/08/2026, demande
   * d'Adriel). Calculé côté layout à partir de Studio.logoUrl / StudioSettings.contactEmail. */
  profileIncomplete?: boolean;
  missingLogo?: boolean;
  missingContactEmail?: boolean;
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
  //
  // Redesign du 01/08/2026 (demande d'Adriel : "design pro et expert de ce sidebar") : la
  // liste plate de 10 liens devient 3 groupes visuels (Principal / Activité / Site & réglages)
  // avec une icône par lien — même logique de regroupement que le dashboard Prodigi vu par
  // Adriel (CATALOGUE / SETTINGS), qui rend un menu long bien plus rapide à scanner qu'une
  // liste continue de libellés texte.
  const groups: { label: string; items: { href: string; label: string; icon: JSX.Element; onboarding?: string }[] }[] = [
    {
      label: t("nav.groupMain"),
      items: [
        { href: "/dashboard", label: t("nav.overview"), icon: <IconGrid />, onboarding: "overview" },
        { href: "/dashboard/galleries", label: t("nav.galleries"), icon: <IconImage />, onboarding: "galleries" },
        { href: "/dashboard/clients", label: t("nav.clients"), icon: <IconUsers />, onboarding: "clients" },
      ],
    },
    {
      label: t("nav.groupActivity"),
      items: [
        // "Boutique" masquée temporairement du menu studio (31/07/2026, demande d'Adriel :
        // "pour un début masquer le bouton boutique et blog dans le panel du studio, nous le
        // ferons après") — dans le cadre du chantier "impression pixleh/Prodigi" : la gestion
        // des produits d'impression bascule vers le panel Admin plateforme. Page/route non
        // supprimée, juste retirée de la nav — à réactiver ou retravailler plus tard.
        { href: "/dashboard/orders", label: t("nav.orders"), icon: <IconBag /> },
        { href: "/dashboard/bookings", label: t("nav.bookings"), icon: <IconCalendar /> },
        { href: "/dashboard/contracts", label: t("nav.contracts"), icon: <IconContract /> },
        { href: "/dashboard/invoices", label: t("nav.invoices"), icon: <IconInvoice /> },
        { href: "/dashboard/billing", label: t("nav.billing"), icon: <IconCard /> },
      ],
    },
    {
      label: t("nav.groupSite"),
      items: [
        { href: "/dashboard/website", label: t("nav.website"), icon: <IconGlobe />, onboarding: "website" },
        { href: "/dashboard/settings", label: t("nav.settings"), icon: <IconSettings /> },
      ],
    },
  ];

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-gray-100 bg-gray-50 p-4">
      <div className="mb-5 px-1">
        <PixlehLogo size={24} />
      </div>

      {/* Identité studio — remplace le simple texte par une carte façon "compte actif",
          plus reconnaissable en un coup d'œil quand on jongle entre plusieurs studios. */}
      <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
        <div className="relative shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
            {studioName.trim().slice(0, 1).toUpperCase() || "?"}
          </div>
          {profileIncomplete && (
            // Le déclencheur doit être positionné directement par CE wrapper (collé sur
            // l'avatar, coin haut-droit) — pas par une classe "absolute" sur le contenu du
            // trigger lui-même, qui serait alors positionnée par rapport au wrapper interne
            // de InfoBubble (relative inline-flex, en flux normal) et finirait décollée de
            // l'avatar (bug repéré le 03/08/2026 sur capture d'Adriel : la pastille flottait
            // en bas de la carte au lieu d'être collée à l'avatar).
            <div className="absolute -right-0.5 -top-0.5">
              <InfoBubble
                trigger={
                  <span className="block h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-500" />
                }
                triggerLabel={t("studio.sidebar.incompleteProfile.trigger")}
              >
                <p className="text-xs font-semibold text-gray-900">{t("studio.sidebar.incompleteProfile.title")}</p>
                <ul className="mt-1.5 space-y-1 text-xs text-gray-600">
                  {missingLogo && (
                    <li className="flex items-center gap-1.5">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                      {t("studio.sidebar.incompleteProfile.missingLogo")}
                    </li>
                  )}
                  {missingContactEmail && (
                    <li className="flex items-center gap-1.5">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                      {t("studio.sidebar.incompleteProfile.missingContactEmail")}
                    </li>
                  )}
                </ul>
                <Link
                  href="/dashboard/settings"
                  className="mt-2 block text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  {t("studio.sidebar.incompleteProfile.cta")}
                </Link>
              </InfoBubble>
            </div>
          )}
        </div>
        <p className="truncate text-sm font-medium text-gray-900">{studioName}</p>
      </div>

      <nav className="flex-1 space-y-5">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  data-onboarding-target={item.onboarding}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    isActive(item.href)
                      ? "border-brand-600 bg-white font-medium text-gray-900 shadow-sm"
                      : "border-transparent text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <span className={isActive(item.href) ? "text-brand-600" : "text-gray-400"}>{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.href === "/dashboard/clients" && unreadClientsCount > 0 && (
                    <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
                      {unreadClientsCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {isPlatformAdmin && (
        <div className="mt-5 border-t border-gray-200 pt-4">
          <Link
            href="/admin"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <IconShield />
            Administration pixleh
          </Link>
        </div>
      )}

      <div className="mt-4 space-y-0.5 border-t border-gray-200 pt-4">
        <Link
          href={`/s/${studioSlug}`}
          target="_blank"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-600 hover:bg-brand-50"
        >
          <IconExternalLink />
          <span className="truncate">{t("nav.viewPublicSite")}</span>
        </Link>
        <SignOutButton
          label={t("nav.signOut")}
          icon={<IconLogout />}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100"
        />
      </div>
      <div className="mt-3 border-t border-gray-200 pt-3">
        <LanguageSwitcher />
      </div>
    </aside>
  );
}

function IconGrid() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16.5L15.5 11 5 20" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6" strokeLinecap="round" />
      <path d="M16 5.2c1.7.5 3 2.1 3 3.9 0 1.9-1.3 3.4-3 3.9" strokeLinecap="round" />
      <path d="M15 14c2.5.3 4.5 2.6 4.5 6" strokeLinecap="round" />
    </svg>
  );
}

function IconBag() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 8h12l1 12.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20.5L6 8Z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}

function IconContract() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h8l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M15 3v4h4" strokeLinejoin="round" />
      <path d="M8.5 13.5l2 2 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconInvoice() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M7 3h10a1 1 0 0 1 1 1v16l-2.5-1.5L13 20l-2.5-1.5L8 20l-2.5-1.5L3 20V6a1 1 0 0 1 1-1h1"
        strokeLinejoin="round"
      />
      <path d="M8 9h8M8 13h8M8 17h4" strokeLinecap="round" />
    </svg>
  );
}

function IconCard() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" strokeLinecap="round" />
      <path d="M6 14.5h4" strokeLinecap="round" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-6l-.3 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L4.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.3 2.6h6l.3-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconExternalLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 4h6v6M20 4l-9 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
