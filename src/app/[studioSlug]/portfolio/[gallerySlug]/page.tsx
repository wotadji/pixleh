import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GalleryView } from "@/components/gallery/GalleryView";
import { sortPhotos, resolvePhotoSortKey } from "@/lib/photoSort";

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
 * Réutilise GalleryView (même couverture/grille/police/couleurs que la galerie normale, voir
 * Design > Couverture dans le panel studio) plutôt qu'une mise en page maison — demandé par
 * Adriel le 30/07/2026 : "la présentation de la galerie du portfolio doit être comme dans
 * galerie". Le panier impression et le favoris n'ont pas de sens sans session (aucun cookie
 * de galerie n'est jamais posé ici) : `allowDownload`/`allowFavorites` sont donc forcés à
 * false et `allowPrintStore` masque le lien "Print Store" + l'icône panier, quels que soient
 * les réglages réels de la galerie (allowGuestDownload etc.).
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
  const studio = await prisma.studio.findUnique({
    where: { slug: params.studioSlug },
    include: { settings: true },
  });
  if (!studio) notFound();

  const gallery = await prisma.gallery.findFirst({
    where: { slug: params.gallerySlug, studioId: studio.id, status: "PUBLISHED" },
    include: {
      photos: { orderBy: { position: "asc" } },
      collections: { select: { id: true, visibility: true, isPortfolioDefault: true } },
    },
  });
  if (!gallery) notFound();

  // portfolioTagged (Photo) : trop récent pour le Prisma Client généré du sandbox, lu via
  // $queryRaw — voir le commentaire sur ce champ dans schema.prisma.
  const portfolioTaggedRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Photo" WHERE "galleryId" = ${gallery.id} AND "portfolioTagged" = true
  `;
  const portfolioTaggedIds = new Set(portfolioTaggedRows.map((r) => r.id));

  const portfolioPhotos =
    gallery.collections.length > 0
      ? (() => {
          // Un studio peut publier N'IMPORTE quel set sur son portfolio (visibility PORTFOLIO),
          // pas seulement le set "Portfolio" auto-créé — comportement inchangé pour ces sets
          // "normaux" : appartenance réelle via collectionId. Le set auto-créé (isPortfolioDefault)
          // fonctionne différemment depuis le 21/08/2026 : ses photos ne sont plus "dans" ce set
          // via collectionId (elles restent dans leur set client d'origine), donc on se base sur
          // le tag portfolioTagged à la place, uniquement si ce set précis est activé (visibility
          // PORTFOLIO) — voir togglePortfolioVisibility dans GalleryManager.
          const regularPortfolioCollectionIds = new Set(
            gallery.collections
              .filter((c) => c.visibility.includes("PORTFOLIO") && !c.isPortfolioDefault)
              .map((c) => c.id)
          );
          const defaultPortfolioActive = gallery.collections.some(
            (c) => c.isPortfolioDefault && c.visibility.includes("PORTFOLIO")
          );
          return gallery.photos.filter(
            (p) =>
              (p.collectionId && regularPortfolioCollectionIds.has(p.collectionId)) ||
              (defaultPortfolioActive && portfolioTaggedIds.has(p.id))
          );
        })()
      : gallery.defaultVisibility.includes("PORTFOLIO")
        ? gallery.photos
        : [];

  // Rien à montrer publiquement (studio n'a pas encore activé de set Portfolio, ou l'a
  // désactivé depuis) : on ne laisse pas deviner que la galerie existe malgré tout.
  if (portfolioPhotos.length === 0) notFound();

  const coverPhotoId =
    gallery.coverPhotoId && portfolioPhotos.some((p) => p.id === gallery.coverPhotoId)
      ? gallery.coverPhotoId
      : portfolioPhotos[0]?.id ?? null;

  return (
    <GalleryView
      gallery={{
        id: gallery.id,
        slug: gallery.slug,
        title: gallery.title,
        allowDownload: false,
        allowFavorites: false,
        coverPhotoId,
        design: gallery.design,
        studioName: studio.name,
        studioSlug: studio.slug,
        studioLogoUrl: studio.logoUrl,
        studioContactEmail: studio.settings?.contactEmail || null,
        studioContactPhone: studio.settings?.contactPhone || null,
        studioInstagramUrl: studio.settings?.instagramUrl || null,
        studioFacebookUrl: studio.settings?.facebookUrl || null,
        eventDate: gallery.eventDate ? gallery.eventDate.toISOString() : null,
      }}
      studioId={studio.id}
      photos={sortPhotos(portfolioPhotos, resolvePhotoSortKey(gallery.photoSortOrder)).map((p) => ({
        id: p.id,
        filename: p.filename,
        width: p.width,
        height: p.height,
        updatedAt: p.updatedAt.toISOString(),
        collectionId: p.collectionId,
      }))}
      collections={[]}
      initialFavorites={[]}
      initialPrintSelection={[]}
      printProducts={[]}
      allowRemarks={false}
      allowPrintStore={false}
      shareBaseUrl={`/${studio.slug}/portfolio/${gallery.slug}`}
    />
  );
}
