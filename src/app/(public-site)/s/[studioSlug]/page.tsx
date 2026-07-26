import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PortfolioGrid, type PortfolioGalleryItem } from "@/components/public-site/PortfolioGrid";
import { HeroCarousel, type HeroCarouselSlide } from "@/components/public-site/HeroCarousel";

export const dynamic = "force-dynamic";

interface HeroSection {
  type: "hero";
  title?: string;
  subtitle?: string;
}

export default async function PublicHomePage({ params }: { params: { studioSlug: string } }) {
  const studio = await prisma.studio.findUnique({
    where: { slug: params.studioSlug },
    include: {
      pages: { where: { slug: "", type: "HOME" } },
      settings: true,
    },
  });
  if (!studio) notFound();

  // Le portail public du studio ("Portfolio") ne montre que les galeries qui ont au moins
  // un set marqué "Portfolio" (Collection.visibility) — une galerie purement client ou
  // invité ne doit jamais apparaître ici, même publiée. Tant qu'aucun set n'a été créé,
  // c'est la visibilité par défaut choisie à la création de la galerie
  // (Gallery.defaultVisibility) qui gouverne à la place.
  const portfolioWhere = {
    studioId: studio.id,
    status: "PUBLISHED" as const,
    OR: [
      { collections: { some: { visibility: { has: "PORTFOLIO" as const } } } },
      { collections: { none: {} }, defaultVisibility: { has: "PORTFOLIO" as const } },
    ],
  };

  const teaserInclude = {
    // Pas de `take` ici : il faut pouvoir retrouver la photo choisie comme couverture
    // (coverPhotoId), pas juste la première par position — seuls id et updatedAt sont
    // nécessaires pour construire l'URL de la miniature.
    photos: { orderBy: { position: "asc" as const }, select: { id: true, updatedAt: true } },
  };

  // Aperçu limité à 3 galeries sur l'accueil (voir bouton "Voir le portfolio complet"
  // ci-dessous) — la liste complète, avec filtre par tag et pagination, vit sur
  // /s/[studioSlug]/portfolio. Les 3 galeries mises en avant (`featuredHome`, choisies par
  // le studio depuis /dashboard/galleries — icône "maison") priment ; si aucune n'a encore
  // été choisie (studio tout juste créé), on retombe sur les 3 plus récentes.
  let featuredGalleries = await prisma.gallery.findMany({
    where: { ...portfolioWhere, featuredHome: true },
    orderBy: { createdAt: "desc" },
    take: 3,
    include: teaserInclude,
  });
  if (featuredGalleries.length === 0) {
    featuredGalleries = await prisma.gallery.findMany({
      where: portfolioWhere,
      orderBy: { createdAt: "desc" },
      take: 3,
      include: teaserInclude,
    });
  }

  const homePage = studio.pages[0];
  const hero = (homePage?.sections as unknown as HeroSection[])?.find((s) => s.type === "hero");

  // Carrousel configuré dans Réglages > Carrousel — voir HeroCarousel. Affiché tout en
  // haut de la page d'accueil, juste sous le header (défini dans layout.tsx). Le champ
  // est un Json libre en base, on le valide donc avant de le passer au composant.
  const carouselSlides: HeroCarouselSlide[] = Array.isArray(studio.settings?.carouselSlides)
    ? (studio.settings!.carouselSlides as unknown as HeroCarouselSlide[]).filter(
        (s) => s && typeof s === "object" && typeof s.id === "string"
      )
    : [];

  // Le nom du studio est déjà affiché dans l'en-tête (logo + nom) : plus besoin de le
  // répéter en grand titre ici. On garde uniquement un sous-titre optionnel s'il existe,
  // puis directement la barre de filtres par tag + la grille (voir PortfolioGrid).
  const galleryItems: PortfolioGalleryItem[] = featuredGalleries.map((gallery) => {
    // La couverture choisie dans le panel (Design > Couverture) prime sur la première
    // photo par position — c'est elle qui doit apparaître dans la grille "Portfolio".
    const cover =
      gallery.photos.find((p) => p.id === gallery.coverPhotoId) || gallery.photos[0];
    return {
      id: gallery.id,
      slug: gallery.slug,
      title: gallery.title,
      categoryTag: gallery.categoryTag,
      eventDate: gallery.eventDate ? gallery.eventDate.toISOString() : null,
      coverUrl: cover
        ? `/api/files/studios/${studio.id}/galleries/${gallery.id}/${cover.id}/thumb.jpg?v=${cover.updatedAt.getTime()}`
        : null,
    };
  });

  return (
    <div>
      <HeroCarousel slides={carouselSlides} />

      {hero?.subtitle && (
        <section className="mx-auto max-w-4xl px-6 pt-16 text-center">
          <p className="text-lg text-gray-600">{hero.subtitle}</p>
        </section>
      )}

      <PortfolioGrid
        galleries={galleryItems}
        ctaHref={`/s/${studio.slug}/portfolio`}
        ctaLabel="Voir le portfolio complet"
      />

      {/* Section "À propos" : photo à droite, texte à gauche — pensée pour que le site
          studio reste "one-page" (on descend jusqu'ici plutôt que de changer de page).
          La photo réutilise le logo/photo de profil du studio (voir Réglages > Profil,
          avec son outil de recadrage) ; le texte vient de aboutTitle/aboutBody
          (StudioSettings), aboutBody étant du HTML saisi via l'éditeur enrichi. */}
      {(studio.settings?.aboutTitle || studio.settings?.aboutBody || studio.logoUrl) && (
        <section id="about" className="border-t border-gray-100">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 py-20 md:grid-cols-2 md:gap-16">
            <div>
              <h2 className="font-serif text-3xl font-bold sm:text-4xl">
                {studio.settings?.aboutTitle || `Pourquoi ${studio.name} ?`}
              </h2>
              {studio.settings?.aboutBody && (
                <div
                  className="mt-6 space-y-4 leading-relaxed text-gray-700 [&_a]:underline [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-4 [&_ul]:ml-5 [&_ul]:list-disc"
                  dangerouslySetInnerHTML={{ __html: studio.settings.aboutBody }}
                />
              )}
              {(studio.settings?.instagramUrl || studio.settings?.facebookUrl) && (
                <div className="mt-4 flex justify-end gap-3">
                  {studio.settings?.instagramUrl && (
                    <a
                      href={studio.settings.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Instagram"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200"
                    >
                      <IconInstagram />
                    </a>
                  )}
                  {studio.settings?.facebookUrl && (
                    <a
                      href={studio.settings.facebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Facebook"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200"
                    >
                      <IconFacebook />
                    </a>
                  )}
                </div>
              )}
            </div>
            {studio.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={studio.logoUrl}
                alt={studio.name}
                className="aspect-[4/5] w-full rounded-lg object-cover md:aspect-auto md:h-[560px]"
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function IconInstagram() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconFacebook() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.99 3.66 9.13 8.44 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99C18.34 21.13 22 16.99 22 12z" />
    </svg>
  );
}
