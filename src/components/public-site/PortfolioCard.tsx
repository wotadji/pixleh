import Link from "next/link";

export interface PortfolioGalleryItem {
  id: string;
  slug: string;
  title: string;
  categoryTag: string | null;
  eventDate: string | null;
  coverUrl: string | null;
  /** Nom du studio propriétaire — affiché uniquement dans un contexte multi-studios
   * (voir /exemples, la vitrine pixleh), absent sur le portfolio d'UN studio où c'est
   * déjà évident. */
  studioName?: string;
  /** Requis pour construire le lien vers /[studioSlug]/portfolio/[gallerySlug] — voir cette
   * route, qui montre uniquement les photos marquées "Portfolio" sans aucun gate, contrairement
   * à /g/[slug] (lien client complet, protégé). */
  studioSlug: string;
}

/**
 * Carte d'une galerie dans une grille "portfolio" (aperçu sur la page d'accueil ET page
 * /portfolio complète) : image de couverture + titre + date, sans overlay — même rendu
 * dans les deux endroits pour que la page complète soit la continuité visuelle naturelle
 * du bouton "Voir le portfolio complet" affiché sur la page d'accueil.
 */
export function PortfolioCard({ gallery }: { gallery: PortfolioGalleryItem }) {
  return (
    <Link href={`/${gallery.studioSlug}/portfolio/${gallery.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-gray-100">
        {gallery.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gallery.coverUrl}
            alt={gallery.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
      </div>
      <div className="mt-3 text-center">
        {gallery.studioName && (
          <p className="text-xs uppercase tracking-widest text-brand-600">{gallery.studioName}</p>
        )}
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-900">{gallery.title}</p>
        {gallery.eventDate && (
          <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
            {formatEventDate(gallery.eventDate)}
          </p>
        )}
      </div>
    </Link>
  );
}

export function formatEventDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
