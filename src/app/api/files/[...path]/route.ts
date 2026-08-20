import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { checkGalleryOrGuestAccess } from "@/lib/access";
import { applyWatermarkIfNeeded, resolveWatermarkText } from "@/lib/image";

export const runtime = "nodejs";
export const maxDuration = 60;
// Sans ça, Next.js peut mettre en cache la réponse de cette route GET côté serveur (Full
// Route Cache) en production, indépendamment du Cache-Control envoyé au navigateur — la
// première réponse générée (avec ou sans filigrane) resterait alors servie indéfiniment à
// TOUT le monde, même après un changement du réglage en base.
export const dynamic = "force-dynamic";

/**
 * Sert les miniatures et aperçus des photos depuis le storage (SFTP ou local) après
 * vérification d'accès à la galerie.
 * Les fichiers "original" HD ne transitent JAMAIS par cette route : voir
 * /api/galleries/[id]/photos/[photoId]/download (qui vérifie les quotas).
 *
 * Le filigrane n'est plus stocké dans le fichier : pour la variante "preview", il est
 * composité à la volée ici selon la valeur LIVE de gallery.showWatermark. Ainsi,
 * activer/désactiver le filigrane a un effet immédiat, sans régénération de fichier.
 *
 * Format attendu : /api/files/studios/{studioId}/galleries/{galleryId}/{photoId}/{variant}.{ext}
 */
export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const segments = params.path;
  if (segments.length !== 6 || segments[0] !== "studios" || segments[2] !== "galleries") {
    return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
  }
  const [, , , galleryId, photoId, filenameWithExt] = segments;
  const [variant] = filenameWithExt.split(".");

  if (variant === "original") {
    return NextResponse.json(
      { error: "Utilisez la route de téléchargement dédiée pour les fichiers originaux." },
      { status: 403 }
    );
  }

  const gallery = await prisma.gallery.findUnique({
    where: { id: galleryId },
    include: {
      studio: { include: { settings: true } },
      // Nécessaire pour isPublicPortfolioPhoto ci-dessous — seuls id/visibility/isPortfolioDefault
      // comptent.
      collections: { select: { id: true, visibility: true, isPortfolioDefault: true } },
    },
  });
  if (!gallery) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo || photo.galleryId !== galleryId) {
    return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });
  }

  // La photo de couverture fait exception : elle sert de fond à l'écran de choix
  // client/invité (voir GalleryEntryChooser, /g/[gallerySlug], variante `preview`) ET de
  // vignette sur le Portfolio public du studio (voir PortfolioCard/page d'accueil, variante
  // `thumb`) — deux endroits qui s'affichent AVANT tout gate (mot de passe ou email), voire
  // sans jamais passer par un gate pour une galerie en portfolio pur. Comme une affiche de
  // film, elle est donc visible sans accès accordé, contrairement au reste de la galerie.
  // Uniquement LA photo explicitement désignée comme couverture, pas les autres.
  const isPublicCoverPreview = gallery.coverPhotoId === photoId && (variant === "preview" || variant === "thumb");

  // Toute photo appartenant à un set marqué PORTFOLIO (ou, tant qu'aucun set n'existe, si
  // Gallery.defaultVisibility inclut PORTFOLIO) est elle aussi publique sans aucun gate —
  // c'est précisément le contenu affiché sur /[studioSlug]/portfolio/[gallerySlug] (page
  // publique dédiée, sans mot de passe ni email, voir cette route). Sans cette exception,
  // cette page ne pourrait jamais afficher la moindre image puisque checkGalleryOrGuestAccess
  // exige toujours une session — demandé par Adriel le 30/07/2026 pour que le portfolio
  // public ne fuite QUE ces photos-là, jamais les sets Client/Invité.
  // Le set "Portfolio" auto-créé (isPortfolioDefault) fonctionne différemment des sets
  // "normaux" depuis le 21/08/2026 (retour d'Adriel) : ses photos ne quittent plus leur set
  // client d'origine (collectionId inchangé), donc pas d'appartenance via collectionId à
  // vérifier pour lui — on lit portfolioTagged à la place, seulement si ce set précis est
  // activé (visibility PORTFOLIO). Les autres sets qu'un studio marque PORTFOLIO restent
  // inchangés (vraie appartenance via collectionId).
  let isPortfolioVisible = false;
  if (gallery.status === "PUBLISHED") {
    if (gallery.collections.length > 0) {
      const isRegularPortfolioMember = Boolean(
        photo.collectionId &&
          gallery.collections.some(
            (c) => c.id === photo.collectionId && c.visibility.includes("PORTFOLIO") && !c.isPortfolioDefault
          )
      );
      const defaultPortfolioActive = gallery.collections.some(
        (c) => c.isPortfolioDefault && c.visibility.includes("PORTFOLIO")
      );
      if (isRegularPortfolioMember) {
        isPortfolioVisible = true;
      } else if (defaultPortfolioActive) {
        const [{ portfolioTagged }] = await prisma.$queryRaw<{ portfolioTagged: boolean }[]>`
          SELECT "portfolioTagged" FROM "Photo" WHERE id = ${photo.id}
        `;
        isPortfolioVisible = portfolioTagged;
      }
    } else {
      isPortfolioVisible = gallery.defaultVisibility.includes("PORTFOLIO");
    }
  }
  const isPublicPortfolioPhoto = isPortfolioVisible && (variant === "preview" || variant === "thumb");

  if (!isPublicCoverPreview && !isPublicPortfolioPhoto) {
    // Un visiteur peut être autorisé via le lien CLIENT (mot de passe / cookie `slug`) OU
    // via le lien INVITÉ (email / cookie `guestSlug`) — voir checkGalleryOrGuestAccess, qui
    // combine les deux car ils s'ignorent mutuellement. Sans ce OR, un invité qui passe le
    // gate email sur une galerie protégée par mot de passe se voyait refuser TOUTES les
    // photos (checkGalleryAccess seul exige le cookie client, que l'invité n'a jamais).
    const access = await checkGalleryOrGuestAccess(gallery);
    if (!access.granted) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
  }

  const key = variant === "thumb" ? photo.thumbKey : photo.previewKey;
  if (!key) return NextResponse.json({ error: "Variante indisponible" }, { status: 404 });

  // "thumb" ne change jamais sans régénération explicite (qui bump `updatedAt` et donc
  // l'URL ?v=...) : cache long + immutable, sans risque de servir une version périmée.
  // "preview" en revanche peut changer de contenu (filigrane ajouté/retiré) SANS que
  // l'URL ne change, puisque le filigrane est composité à la volée à partir de la valeur
  // live de gallery.showWatermark plutôt que d'être stocké dans le fichier. Avec un cache
  // "immutable", le navigateur ne revaliderait jamais et continuerait de servir l'ancienne
  // version (avec ou sans filigrane) indéfiniment après un changement de réglage — d'où
  // "no-cache" ici : le navigateur peut garder une copie mais doit toujours revalider
  // auprès du serveur avant de l'utiliser.
  //
  // Cette revalidation était auparavant "aveugle" (pas d'ETag), donc chaque revisite d'une
  // photo déjà vue (retour arrière dans la visionneuse, rechargement...) retéléchargeait et
  // recomposait le filigrane en entier — d'où la latence perçue à l'ouverture du zoom.
  // Avec un ETag dérivé de `updatedAt` + de l'état du filigrane, une requête conditionnelle
  // (If-None-Match) renvoie un 304 quasi instantané, sans relire le fichier ni recompositer.
  const watermarkText =
    variant === "preview" ? resolveWatermarkText(gallery.showWatermark, gallery.studio) : null;
  const etag = `"${photo.updatedAt.getTime()}-${variant}-${watermarkText ? "wm" : "raw"}"`;
  const cacheControl =
    variant === "thumb" ? "private, max-age=31536000, immutable" : "private, no-cache";

  if (_req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { "Cache-Control": cacheControl, ETag: etag },
    });
  }

  try {
    const storage = getStorage();
    let buffer = await storage.get(key);

    if (variant === "preview") {
      buffer = await applyWatermarkIfNeeded(buffer, watermarkText);
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": cacheControl,
        ETag: etag,
      },
    });
  } catch {
    return NextResponse.json({ error: "Fichier introuvable sur le stockage" }, { status: 404 });
  }
}
