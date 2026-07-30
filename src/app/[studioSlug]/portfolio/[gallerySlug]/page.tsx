import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PublicPortfolioGallery } from "@/components/public-site/PublicPortfolioGallery";

export const dynamic = "force-dynamic";

/**
 * Vue publique d'UNE galerie sur le portfolio du studio — aucun mot de passe, aucun email,
 * accessible à n'importe qui. Contrairement à /g/[gallerySlug] (lien partagé au client, qui
 * mène à la galerie COMPLÈTE une fois le gate passé), cette page ne montre QUE les photos
 * appartenant à un set marqué "Portfolio" (ou, tant qu'aucun set n'existe, si
 * Gallery.defaultVisibility inclut PORTFOLIO) : jamais les sets Client/Invité, même si la
 * galerie n'a pas de mot de passe. Voir /api/files/[...path]/route.ts (isPublicPortfolioPhoto)
 * pour la même règle appliquée à la diffusion des fichiers eux-mêmes.
 *
 * URL choisie par Adriel le 30/07/2026 : /[studioSlug]/portfolio/[gallerySlug] — un studio ne
 * peut jamais obtenir le slug "portfolio" pour lui-même (voir RESERVED_STUDIO_SLUGS), mais
 * cette route n'en a de toute façon pas besoin : c'est le DEUXIÈME segment ("portfolio") qui
 * est statique ici, pas le premier, donc aucun risque de collision avec une autre route
 * système à la racine (toutes à un seul segment).
 */
export default async function PublicPortfolioGalleryPage({
  params,
}: {
  params: { studioSlug: string; gallerySlug: string };
}) {
  const studio = await prisma.studio.findUnique({ where: { slug: params.studioSlug } });
  if (!studio) notFound();

  const gallery = await prisma.gallery.findFirst({
    where: { slug: params.gallerySlug, studioId: studio.id, status: "PUBLISHED" },
    include: {
      photos: { orderBy: { position: "asc" } },
      collections: { select: { id: true, visibility: true } },
    },
  });
  if (!gallery) notFound();

  const portfolioPhotos =
    gallery.collections.length > 0
      ? (() => {
          const portfolioCollectionIds = new Set(
            gallery.collections.filter((c) => c.visibility.includes("PORTFOLIO")).map((c) => c.id)
          );
          return gallery.photos.filter((p) => p.collectionId && portfolioCollectionIds.has(p.collectionId));
        })()
      : gallery.defaultVisibility.includes("PORTFOLIO")
        ? gallery.photos
        : [];

  // Rien à montrer publiquement (studio n'a pas encore activé de set Portfolio, ou l'a
  // désactivé depuis) : on ne laisse pas deviner que la galerie existe malgré tout.
  if (portfolioPhotos.length === 0) notFound();

  const photos = portfolioPhotos.map((p) => ({
    id: p.id,
    width: p.width,
    height: p.height,
    thumbUrl: `/api/files/studios/${studio.id}/galleries/${gallery.id}/${p.id}/thumb.jpg?v=${p.updatedAt.getTime()}`,
    previewUrl: `/api/files/studios/${studio.id}/galleries/${gallery.id}/${p.id}/preview.jpg?v=${p.updatedAt.getTime()}`,
  }));

  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl flex-col items-center px-6 pb-8 pt-14 text-center">
        <Link
          href={`/s/${studio.slug}/portfolio`}
          className="mb-6 flex items-center gap-2 text-xs uppercase tracking-widest text-gray-400 hover:text-gray-700"
        >
          {studio.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={studio.logoUrl} alt={studio.name} className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600">
              {studio.name.trim()[0]?.toUpperCase() || "?"}
            </span>
          )}
          {studio.name}
        </Link>
        <h1 className="font-serif text-2xl font-semibold sm:text-3xl">{gallery.title}</h1>
        {gallery.eventDate && (
          <p className="mt-2 text-xs uppercase tracking-wide text-gray-400">
            {new Date(gallery.eventDate).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}
      </header>

      <PublicPortfolioGallery photos={photos} />

      <footer className="mt-16 border-t border-gray-100 py-8 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} {studio.name} — Propulsé par pixleh
      </footer>
    </div>
  );
}
