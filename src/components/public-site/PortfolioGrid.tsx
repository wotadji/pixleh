import Link from "next/link";
import { PortfolioCard, type PortfolioGalleryItem } from "./PortfolioCard";

export type { PortfolioGalleryItem };

/**
 * Aperçu "Portfolio" sur la page d'accueil du studio : un nombre limité de galeries
 * (voir `take` dans page.tsx), suivi d'un bouton vers la page /portfolio complète — qui,
 * elle, propose le filtre par tag et la pagination (voir portfolio/page.tsx). Pas de
 * filtre ici : avec seulement quelques galeries affichées, une barre de filtres n'aurait
 * pas grand intérêt et ferait doublon avec la page complète.
 */
export function PortfolioGrid({
  galleries,
  ctaHref,
  ctaLabel,
}: {
  galleries: PortfolioGalleryItem[];
  /** Lien vers la page /portfolio complète, affiché sous la grille. */
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div>
      <section className="mx-auto grid max-w-6xl grid-cols-2 gap-x-2 gap-y-10 px-6 pb-14 pt-10 sm:grid-cols-3">
        {galleries.map((gallery) => (
          <PortfolioCard key={gallery.id} gallery={gallery} />
        ))}
        {galleries.length === 0 && (
          <p className="col-span-full text-center text-sm text-gray-500">
            Aucune galerie publiée pour le moment.
          </p>
        )}
      </section>

      {ctaHref && galleries.length > 0 && (
        <div className="flex justify-center pb-20">
          <Link
            href={ctaHref}
            className="rounded-full border border-gray-300 px-6 py-2.5 text-sm font-medium uppercase tracking-widest text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900"
          >
            {ctaLabel || "Voir le portfolio complet"}
          </Link>
        </div>
      )}
    </div>
  );
}
