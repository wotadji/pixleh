import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudioSession, checkGuestAccess } from "@/lib/access";
import { getGallerySession } from "@/lib/gallery-session";
import { GalleryEntryChooser } from "@/components/gallery/GalleryEntryChooser";
import { GalleryView } from "@/components/gallery/GalleryView";
import { GuestPendingScreen, GuestRejectedScreen } from "@/components/gallery/GuestStatusScreens";
import { sortPhotos, resolvePhotoSortKey } from "@/lib/photoSort";
import { resolveGalleryDesign } from "@/lib/galleryDesign";
import { getActivePrintCatalog } from "@/lib/printCatalog";

export const dynamic = "force-dynamic";

/**
 * Lien UNIQUE de galerie (partagé tel quel par le studio, quel que soit le visiteur) :
 * affiche d'abord un écran de choix "Entrer en tant qu'invité / en tant que client" (voir
 * GalleryEntryChooser) tant qu'aucune session n'est déjà établie pour l'un ou l'autre mode,
 * puis bascule sur la vue adaptée. Remplace l'ancien fonctionnement où le lien client
 * (/g/[slug], mot de passe) et le lien invité (/invite/[guestSlug], email) étaient deux URLs
 * distinctes à partager séparément — /invite/[guestSlug] reste fonctionnel en direct (accès
 * immédiat sans passer par ce chooser) pour un studio qui préfère partager un lien "invité"
 * pur, mais n'est plus le parcours mis en avant.
 */
export default async function GalleryEntryPage({
  params,
}: {
  params: { gallerySlug: string };
}) {
  const gallery = await prisma.gallery.findUnique({
    where: { slug: params.gallerySlug },
    include: {
      photos: { orderBy: { position: "asc" } },
      // Tous les sets sont chargés ici (contrairement à /invite/[guestSlug], qui ne
      // s'intéresse qu'à ceux marqués "Invité") : ce chargement sert aussi bien le mode
      // client (tous les sets) que le mode invité (filtré ensuite, voir plus bas).
      collections: { orderBy: { position: "asc" } },
      // Vidéos externes (Vimeo/YouTube) — mode client uniquement, comme avant.
      videos: { orderBy: { position: "asc" } },
      studio: { select: { name: true, slug: true, logoUrl: true, settings: true } },
      // "products: true" retiré le 31/07/2026 — plus lu nulle part dans ce fichier depuis que
      // les tarifs d'impression viennent du catalogue plateforme (voir printProducts plus bas,
      // getActivePrintCatalog) plutôt que de Product rattachés à la galerie via GalleryProducts.
      // Nom/email du client principal — affichés sur l'écran "en attente" si le mode invité
      // est soumis à validation (voir plus bas, GuestPendingScreen).
      client: { select: { name: true, email: true } },
    },
  });

  if (!gallery || gallery.status === "DRAFT") notFound();

  if (gallery.expiresAt && gallery.expiresAt < new Date()) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-serif text-2xl font-semibold">Galerie expirée</h1>
        <p className="mt-2 text-sm text-gray-600">
          Cette galerie n&apos;est plus disponible. Contactez votre photographe pour plus
          d&apos;informations.
        </p>
      </div>
    );
  }

  // Décision volontairement DIFFÉRENTE de checkGalleryAccess() (utilisée ailleurs, ex:
  // /api/files) : celle-ci accorde l'accès automatiquement dès qu'aucun mot de passe n'est
  // configuré, sans jamais exiger de cookie — ce qui, ici, sauterait carrément l'écran de
  // choix pour toute galerie sans mot de passe. On exige donc explicitement une session
  // (posée uniquement après un clic sur un des deux boutons, voir GalleryEntryChooser et
  // /api/gallery-access, qui pose désormais un cookie même à mot de passe vide).
  const studioSession = await getStudioSession();
  const asStudio = Boolean(studioSession && studioSession.user.studioId === gallery.studioId);

  let mode: "client" | "guest" | null = null;
  let clientRef: string | undefined;
  let guestAllSetsAccess = true;
  let guestAllowedCollectionIds: string[] = [];

  if (!asStudio) {
    const clientSession = getGallerySession(gallery.slug);
    if (clientSession && clientSession.galleryId === gallery.id) {
      mode = "client";
      clientRef = clientSession.clientRef;
    } else if (gallery.guestSlug && getGallerySession(gallery.guestSlug)?.galleryId === gallery.id) {
      // Une session invité existe déjà (email déjà saisi une fois via GalleryEntryChooser,
      // même si la demande est encore en attente — voir POST /api/guest-access, qui pose le
      // cookie quel que soit le statut) : on relit le statut réel en base plutôt que de se
      // fier au cookie, qui ne prouve que l'identité (clientRef), jamais l'état d'approbation
      // courant (peut changer après coup via /approve-guest/[token]). Corrige un bug remonté
      // par Adriel le 05/08/2026 : un invité PENDING atterrissait ici sur une galerie sans
      // aucune photo (page blanche) plutôt que de voir un message explicite, faute de ce
      // contrôle — même logique que /invite/[guestSlug]/page.tsx.
      const guestAccess = await checkGuestAccess(gallery);
      if (guestAccess.status === "PENDING") {
        return <GuestPendingScreen galleryTitle={gallery.title} client={gallery.client} />;
      }
      if (guestAccess.status === "REJECTED") {
        return <GuestRejectedScreen />;
      }
      if (guestAccess.granted) {
        mode = "guest";
        clientRef = guestAccess.clientRef;
        guestAllSetsAccess = guestAccess.allSetsAccess ?? true;
        guestAllowedCollectionIds = guestAccess.allowedCollectionIds ?? [];
      }
    }
  }

  if (!asStudio && !mode) {
    const coverPhotoId = gallery.coverPhotoId ?? gallery.photos[0]?.id ?? null;
    const cover = coverPhotoId ? gallery.photos.find((p) => p.id === coverPhotoId) : null;
    const coverUrl =
      cover && gallery.coverPhotoId
        ? `/api/files/studios/${gallery.studioId}/galleries/${gallery.id}/${gallery.coverPhotoId}/preview.jpg?v=${new Date(
            cover.updatedAt
          ).getTime()}`
        : null;
    // Même point focal que sur la page galerie une fois entré (voir GalleryCover dans
    // GalleryView.tsx) — repositionné par le studio via CoverFocalPointModal, pour que la
    // zone importante de la photo (un visage, par ex.) reste cadrée dès cet écran de choix,
    // pas seulement après avoir passé le gate.
    const { coverFocalX, coverFocalY } = resolveGalleryDesign(gallery.design);

    return (
      <GalleryEntryChooser
        title={gallery.title}
        studioName={gallery.studio.name}
        coverUrl={coverUrl}
        coverFocalX={coverFocalX}
        coverFocalY={coverFocalY}
        gallerySlug={gallery.slug}
        guestSlug={gallery.guestSlug}
        requiresPassword={Boolean(gallery.password)}
      />
    );
  }

  // Mode invité : mêmes règles de filtrage que /invite/[guestSlug] (sets marqués "Invité"
  // uniquement, ou visibilité par défaut de la galerie tant qu'aucun set n'existe) — voir
  // ce fichier pour le détail commenté de cette logique.
  // Le set "Portfolio" auto-créé (isPortfolioDefault) ne doit jamais apparaître comme onglet
  // de filtre ici, ni côté client ni côté invité : sa visibilité publique se gère uniquement
  // depuis le panneau studio (voir GalleryManager > togglePortfolioVisibility), et il a sa
  // propre vue dédiée (/[studioSlug]/portfolio/[gallerySlug]) — demandé par Adriel le
  // 30/07/2026 après avoir vu "PORTFOLIO" listé à côté des vrais sets sur /g/[slug].
  // isSocialDefault exclu ici aussi (21/08/2026, retour d'Adriel) : le set "Réseaux sociaux"
  // est un dossier de curation privé du photographe, jamais un onglet client/invité — même
  // règle que isPortfolioDefault ci-dessus. Défensif : depuis ce même correctif, ajouter une
  // photo à ces deux sets ne passe plus par collectionId (voir Photo.portfolioTagged/
  // socialTagged dans schema.prisma), donc aucune photo ne devrait plus s'y trouver, mais on
  // garde ce filtre au cas où d'anciennes données n'auraient pas encore été migrées.
  let visiblePhotos = gallery.photos;
  let visibleCollections = gallery.collections
    .filter((c) => !c.isPortfolioDefault && !c.isSocialDefault)
    .map((c) => ({ id: c.id, title: c.title }));
  let coverPhotoId = gallery.coverPhotoId;
  let allowDownload = gallery.allowDownload;
  let allowRemarks = true;

  if (!asStudio && mode === "guest") {
    // access.allSetsAccess === false : ce visiteur précis a reçu un accès limité à certains
    // sets choisis par le client au moment de l'approbation (voir /approve-guest/[token]) —
    // ça remplace entièrement la logique GUEST habituelle, même traitement que
    // /invite/[guestSlug]/page.tsx (ces deux pages doivent rester cohérentes).
    if (guestAllSetsAccess === false) {
      const allowedIds = new Set(guestAllowedCollectionIds);
      const allowedSets = gallery.collections.filter((c) => allowedIds.has(c.id));
      visibleCollections = allowedSets.map((c) => ({ id: c.id, title: c.title }));
      visiblePhotos = gallery.photos.filter((p) => p.collectionId && allowedIds.has(p.collectionId));
    } else if (gallery.collections.length === 0) {
      visiblePhotos = gallery.defaultVisibility.includes("GUEST") ? gallery.photos : [];
      visibleCollections = [];
    } else {
      const guestSets = gallery.collections.filter(
        (c) => c.visibility.includes("GUEST") && !c.isPortfolioDefault && !c.isSocialDefault
      );
      visibleCollections = guestSets.map((c) => ({ id: c.id, title: c.title }));
      const guestCollectionIds = new Set(guestSets.map((c) => c.id));
      visiblePhotos = gallery.photos.filter((p) => p.collectionId && guestCollectionIds.has(p.collectionId));
    }
    coverPhotoId =
      gallery.coverPhotoId && visiblePhotos.some((p) => p.id === gallery.coverPhotoId)
        ? gallery.coverPhotoId
        : visiblePhotos[0]?.id ?? null;
    allowDownload = gallery.allowGuestDownload;
    allowRemarks = false;
  }

  const selections = await prisma.selection.findMany({
    where: {
      galleryId: gallery.id,
      type: "FAVORITE",
      clientRef: asStudio ? undefined : clientRef,
    },
  });

  // Panier "Sélection impression" (icône imprimante sur chaque vignette) : même mécanisme
  // que les favoris (Selection + clientRef), distingué par `type: "PRINT"`, pour que la
  // sélection survive à un rechargement de page au lieu de disparaître.
  const printSelections = await prisma.selection.findMany({
    where: {
      galleryId: gallery.id,
      type: "PRINT",
      clientRef: asStudio ? undefined : clientRef,
    },
  });

  // Tarif(s) d'impression : depuis le 31/07/2026 (chantier "impression pixleh/Prodigi",
  // demande d'Adriel), ce n'est plus un Product du studio mais le catalogue plateforme
  // (/admin/print-catalog, géré par pixleh) — automatiquement proposé dans TOUTES les
  // galeries, sans affectation par le studio. Sert au panneau "Sélection impression" (icône
  // imprimante sur chaque vignette) pour calculer le total. Non proposé en mode invité (comme
  // avant, voir /invite/[guestSlug]).
  const printProducts = mode === "guest" ? [] : await getActivePrintCatalog();

  return (
    <GalleryView
      gallery={{
        id: gallery.id,
        slug: gallery.slug,
        title: gallery.title,
        allowDownload,
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
      photos={sortPhotos(visiblePhotos, resolvePhotoSortKey(gallery.photoSortOrder)).map((p) => ({
        id: p.id,
        filename: p.filename,
        width: p.width,
        height: p.height,
        updatedAt: p.updatedAt.toISOString(),
        collectionId: p.collectionId,
      }))}
      collections={visibleCollections}
      videos={
        mode === "guest"
          ? []
          : gallery.videos.map((v) => ({
              id: v.id,
              title: v.title,
              provider: v.provider as "vimeo" | "youtube" | null,
              externalId: v.externalId,
              thumbnailUrl: v.thumbnailUrl,
              duration: v.duration,
              storageKey: v.storageKey,
              mimeType: v.mimeType,
            }))
      }
      initialFavorites={selections.map((s) => s.photoId)}
      initialPrintSelection={printSelections.map((s) => ({ photoId: s.photoId, productId: s.productId }))}
      printProducts={printProducts.map((p) => ({
        id: p.id,
        name: p.name,
        priceCents: p.priceCents,
        currency: p.currency,
      }))}
      allowRemarks={allowRemarks}
      // Collections privées (12/08/2026, demande d'Adriel) : même périmètre qu'allowRemarks
      // ci-dessus — mode "client" uniquement (jamais invité), voir GalleryView.tsx.
      enableClientCollections={mode === "client"}
    />
  );
}
