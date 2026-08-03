"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * En-tête du site public d'un studio : se fixe en haut au défilement (sticky), et met
 * en évidence l'entrée de menu correspondant à la page/section affichée. "Portfolio"
 * mène désormais vers la page dédiée /portfolio (grille complète + pagination) plutôt
 * que l'accueil — seul "À propos" reste une ancre scrollspy sur la page d'accueil
 * (#about) ; les autres (Réserver, Contact, Portfolio) sont de vraies sous-pages, mises
 * en évidence par simple correspondance d'URL. Le lien "Blog" a été retiré de ce menu
 * (demande d'Adriel) ; la page /s/[slug]/blog reste accessible en URL directe.
 */
export function PublicSiteHeader({
  studioName,
  studioSlug,
  studioLogoUrl,
}: {
  studioName: string;
  studioSlug: string;
  studioLogoUrl: string | null;
}) {
  const pathname = usePathname();
  const isHome = pathname === `/s/${studioSlug}`;
  const [aboutInView, setAboutInView] = useState(false);

  useEffect(() => {
    if (!isHome) return;
    const target = document.getElementById("about");
    if (!target) return;
    // Déclenche dès que la section #about atteint le haut de l'écran (sous l'en-tête
    // fixe), plutôt qu'au premier pixel visible en bas — sinon "À propos" s'allumerait
    // trop tôt, bien avant que la section ne soit réellement à l'écran.
    const observer = new IntersectionObserver(
      ([entry]) => setAboutInView(entry.isIntersecting),
      { rootMargin: "-72px 0px -60% 0px", threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isHome]);

  const links = [
    {
      href: `/s/${studioSlug}/portfolio`,
      label: "Portfolio",
      active: pathname === `/s/${studioSlug}/portfolio`,
    },
    { href: `/s/${studioSlug}#about`, label: "À propos", active: isHome && aboutInView },
    { href: `/s/${studioSlug}/book`, label: "Réserver", active: pathname === `/s/${studioSlug}/book` },
    { href: `/s/${studioSlug}/contact`, label: "Contact", active: pathname === `/s/${studioSlug}/contact` },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href={`/s/${studioSlug}`} className="flex items-center gap-2.5 font-serif text-xl font-semibold">
          {studioLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={studioLogoUrl} alt={studioName} className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600">
              {studioName.trim()?.[0]?.toUpperCase() || "?"}
            </span>
          )}
          {studioName}
        </Link>
        <nav className="flex gap-6 text-sm">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={`transition-colors ${
                link.active ? "font-medium text-gray-900" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
