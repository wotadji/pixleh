"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { AdminSidebarNav, AdminBadgeLabel, AdminBackToStudioLabel } from "@/components/admin/AdminSidebarNav";
import { PixlehLogo } from "@/components/marketing/PixlehLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/**
 * Sidebar admin — extraite d'admin/layout.tsx (12/08/2026, demande d'Adriel : "applique le
 * meme comportement de sidebar du panel du studio a celui de l'administrateur") pour devenir
 * un tiroir mobile, comme DashboardSidebar.tsx côté studio : même classes de positionnement
 * (fixed + -translate-x-full en dessous de md, sticky + translate-x-0 à partir de md), même
 * bouton de fermeture dans l'en-tête sous md.
 */
export function AdminSidebar({
  nav,
  open = false,
  onClose,
}: {
  nav: { href: string; label: string }[];
  open?: boolean;
  onClose?: () => void;
}) {
  const { t } = useLanguage();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 -translate-x-full flex-col overflow-y-auto border-r border-gray-100 bg-gray-50 p-4 transition-transform duration-200 ease-in-out md:sticky md:top-0 md:translate-x-0 ${
        open ? "translate-x-0" : ""
      }`}
    >
      <div className="mb-5 flex items-center justify-between px-1">
        <PixlehLogo size={24} />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("nav.closeMenu")}
          title={t("nav.closeMenu")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 md:hidden"
        >
          <IconClose />
        </button>
      </div>

      <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-900 px-3 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
          <IconShield />
        </div>
        <p className="truncate text-sm font-medium text-white">
          <AdminBadgeLabel />
        </p>
      </div>

      <div className="flex-1">
        <AdminSidebarNav items={nav} />
      </div>

      <div className="mt-5 border-t border-gray-200 pt-4">
        <Link
          href="/dashboard"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          <IconArrowLeft />
          <AdminBackToStudioLabel />
        </Link>
      </div>

      <div className="mt-3 border-t border-gray-200 pt-3">
        <LanguageSwitcher />
      </div>
    </aside>
  );
}

function IconClose() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" strokeLinecap="round" />
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

function IconArrowLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
