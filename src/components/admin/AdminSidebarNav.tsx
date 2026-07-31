"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Une icône par route admin, choisie par href plutôt que passée en prop depuis le layout
// (Server Component) — évite de fabriquer des éléments JSX côté serveur juste pour les
// re-sérialiser ; le mapping vit entièrement ici, à côté du composant qui l'affiche.
const ICONS: Record<string, JSX.Element> = {
  "/admin": <IconGrid />,
  "/admin/studios": <IconBuilding />,
  "/admin/site": <IconLayout />,
  "/admin/plans": <IconTag />,
  "/admin/print-catalog": <IconPrinter />,
  "/admin/features": <IconToggle />,
};

export function AdminSidebarNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  // "/admin" (Vue d'ensemble) ne doit s'allumer que sur la page exacte, sinon il
  // resterait actif sur toutes les sous-pages (/admin/plans, /admin/features...).
  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  return (
    <nav className="space-y-0.5">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
            isActive(item.href)
              ? "border-brand-600 bg-white font-medium text-gray-900 shadow-sm"
              : "border-transparent text-gray-600 hover:bg-gray-100"
          }`}
        >
          <span className={isActive(item.href) ? "text-brand-600" : "text-gray-400"}>
            {ICONS[item.href] ?? <IconDot />}
          </span>
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </nav>
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

function IconBuilding() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="3" width="11" height="18" rx="1" />
      <rect x="15" y="9" width="5" height="12" rx="1" />
      <path d="M7 7h1M11 7h1M7 11h1M11 11h1M7 15h1M11 15h1" strokeLinecap="round" />
    </svg>
  );
}

function IconLayout() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 9h17" strokeLinecap="round" />
      <path d="M8.5 9v11" strokeLinecap="round" />
    </svg>
  );
}

function IconTag() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12.5 3H5a1 1 0 0 0-1 1v7.5a1 1 0 0 0 .3.7l9 9a1 1 0 0 0 1.4 0l7.5-7.5a1 1 0 0 0 0-1.4l-9-9a1 1 0 0 0-.7-.3Z" strokeLinejoin="round" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </svg>
  );
}

function IconPrinter() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 9V3h12v6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 13h12v8H6z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 16h8" strokeLinecap="round" />
    </svg>
  );
}

function IconToggle() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2.5" y="7" width="19" height="10" rx="5" />
      <circle cx="16.5" cy="12" r="3.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconDot() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
