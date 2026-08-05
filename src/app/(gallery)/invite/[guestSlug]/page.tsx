import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { checkGuestAccess } from "@/lib/access";
import { EmailGate } from "@/components/gallery/EmailGate";
import { GalleryView } from "@/components/gallery/GalleryView";
import { GuestPendingScreen, GuestRejectedScreen } from "@/components/gallery/GuestStatusScreens";
import { sortPhotos, resolvePhotoSortKey } from "@/lib/photoSort";

export const dynamic = "force-dynamic";

/**
 * Lien "invité" (/invite/[guestSlug]) : accès public sans mot de passe, protégé par un
 * simple email (voir EmailGate + /api/guest-access). Contrairement au lien client
 * (/g/[slug]), il ne montre que les photos des sets marqués "Invité" (Collection.visibility)
 * et n'affiche jamais l'icône de remarque (allowRemarks reste à false).
 */
export default async function GuestGalleryPage({
  params,
}: {
  params: { guestSlug: string };
}) {
  const gallery = await prisma.gallery.findUnique({
    where: { guestSlug: params.guestSlug },
    include: {
      photos: { orderBy: { position: "asc" } },
      collections: true,
      studio: { select: { name: true, slug: true, logoUrl: true, settings: true } },
      // Nom/email du client principal, affichés sur l'écran "en attente" ci-dessous (demande
      // d'Adriel, 05/08/2026 : préciser QUI doit valider, pas juste "le propriétaire").
      client: { select: { name: true, email: true } },
    },
  });

  if (!gallery || gallery.status === "DRAFT") notFound();

  if (gallery.expiresAt && gallery.expiresAt < new Date()) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-serif text-2xl font-semibold">Galerie expirée</h1>
        <p className="mt-2 text-sm text-gray-600">
          Cette sélection n&apos;est plus disponible. Contactez le photographe pour plus
          d&apos;informations.
        </p>
      </div>
    );
  }

  const access = await checkGuestAccess(gallery);
  if (!access.granted) {
    // `status` n'est présent que si une session invité existe déjà (email déjà saisi une
    // fois) — sans ça (première visite), on retombe sur le formulaire email normal.
    if (access.status === "PENDING") {
      return <GuestPendingScreen galleryTitle={gallery.title} client={gallery.client} />;
    }
    if (access.status === "REJECTED") {
      return <GuestRejectedScreen />;
    }
    return <EmailGate guestSlug={params.guestSlug} title={gallery.title} />;
  }

  // Seuls les sets explicitement marqués "Invité" sont visibles ici — les photos non
  // rattachées à un set (ou rattachées à un set uniquement Client/Portfolio) restent
  // masquées, le lien invité étant une sélection volontaire du studio. Tant qu'aucun set
  // n'a été créé dans la galerie, c'est la visibilité par défaut choisie à la création
  // (Gallery.defaultVisibility) qui décide à la place : toutes les photos sont montrées
  // si "Invités" en fait partie, aucune sinon.
  // Sets à proposer dans le filtre par set (voir GalleryView) : uniquement ceux marqués
  // "Invité" — un set Client/Portfolio-only n'a aucune photo dans `guestPhotos` de toute
  // façon, l'y proposer comme filtre ne ferait que montrer une case toujours vide.
  let guestPhotos: typeof gallery.photos;
  let guestCollections: { id: string; title: string }[] = [];
  // access.allSetsAccess === false : ce visiteur précis a reçu un accès limité à certains
  // sets choisis par le client au moment de l'approbation (voir /approve-guest/[token]) —
  // ça remplace entièrement la logique GUEST habituelle (le client peut ainsi autoriser un
  // set qui n'est pas globalement marqué "Invité"), plutôt que de la restreindre davantage.
  if (access.allSetsAccess === false) {
    const allowedIds = new Set(access.allowedCollectionIds ?? []);
    const allowedSets = gallery.collections.filter((c: { id: string }) => allowedIds.has(c.id));
    guestCollections = allowedSets.map((c: { id: string; title: string }) => ({ id: c.id, title: c.title }));
    guestPhotos = gallery.photos.filter(
      (p: { id: string; collectionId: string | null }) => p.collectionId && allowedIds.has(p.collectionId)
    );
  } else if (gallery.collections.length === 0) {
    guestPhotos = gallery.defaultVisibility.includes("GUEST") ? gallery.photos : [];
  } else {
    const guestSets = gallery.collections.filter(
      (c: { id: string; visibility: string[]; isPortfolioDefault: boolean }) =>
        c.visibility.includes("GUEST") && !c.isPortfolioDefault
    );
    guestCollections = guestSets.map((c: { id: string; title: string }) => ({ id: c.id, title: c.title }));
    const guestCollectionIds = new Set(guestSets.map((c: { id: string }) => c.id));
    guestPhotos = gallery.photos.filter(
      (p: { id: string; collectionId: string | null }) =>
        p.collectionId && guestCollectionIds.has(p.collectionId)
    );
  }

  const coverPhotoId =
    gallery.coverPhotoId && guestPhotos.some((p: { id: string }) => p.id === gallery.coverPhotoId)
      ? gallery.coverPhotoId
      : guestPhotos[0]?.id ?? null;

  return (
    <GalleryView
      gallery={{
        id: gallery.id,
        slug: gallery.slug,
        title: gallery.title,
        allowDownload: gallery.allowGuestDownload,
        allowFavorites: gallery.allowFavorites,
        coverPhotoId,
        design: gallery.design,
        studioName: gallery.studio.name,
        studioSlug: gallery.studio.slug,
        studioLogoUrl: gallery.studio.logoUrl,
        studioContactEmail: gallery.studio.settings?.contactEmail || null,
        studioContactPhone: gallery.studio.settings?.contactPhone || null,
        studioInstagramUrl: gallery.studio.settings?.instagramUrl || null,
        studioFacebookUrl: gallery.studio.settings?.facebookUrl || null,
        eventDate: gallery.eventDate ? gallery.eventDate.toISOString() : null,
      }}
      studioId={gallery.studioId}
      photos={sortPhotos(guestPhotos, resolvePhotoSortKey(gallery.photoSortOrder)).map((p) => ({
        id: p.id,
        filename: p.filename,
        width: p.width,
        height: p.height,
        updatedAt: p.updatedAt.toISOString(),
        collectionId: p.collectionId,
      }))}
      collections={guestCollections}
      initialFavorites={[]}
      initialPrintSelection={[]}
      printProducts={[]}
      allowRemarks={false}
    />
  );
}
