"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminSidebarNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  // "/admin" (Vue d'ensemble) ne doit s'allumer que sur la page exacte, sinon il
  // resterait actif sur toutes les sous-pages (/admin/plans, /admin/features...).
  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  return (
    <nav className="space-y-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`block rounded-lg border px-3 py-2 text-sm ${
            isActive(item.href)
              ? "border-brand-600 bg-white font-medium text-gray-900 shadow-sm"
              : "border-transparent text-gray-700 hover:bg-gray-100"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
