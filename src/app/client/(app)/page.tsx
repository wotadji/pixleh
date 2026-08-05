import { redirect } from "next/navigation";
import { getClientPortalSession } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { ClientGalleriesView } from "@/components/client-portal/ClientGalleriesView";

export const dynamic = "force-dynamic";

/**
 * Tableau de bord de l'espace Client (/client) — toutes les galeries dont un Client CRM
 * (potentiellement dans plusieurs studios différents) partage l'email de la session en
 * cours, groupées par studio. Voir prisma/schema.prisma (ClientAccount) et
 * src/lib/clientSession.ts pour le mécanisme de session, distinct du dashboard studio.
 * Titre/email/déconnexion vivent désormais dans la barre latérale (voir layout.tsx du
 * groupe (app)), qui gère aussi la redirection si la session est absente. Ne fait plus que la
 * requête + l'aplatissement des données : le rendu (traduit) vit dans ClientGalleriesView,
 * un composant client (useLanguage/t() n'est pas accessible depuis un Server Component).
 *
 * Depuis le redesign du 30/07/2026, on résout aussi la vraie couverture de chaque galerie
 * (coverPhotoId choisi explicitement, ou 1ère photo par position) — même logique que
 * /dashboard/galleries côté studio — pour afficher une vignette au lieu d'une simple ligne de
 * texte. Le fichier de couverture est servi sans authentification (voir isPublicCoverPreview
 * dans /api/files/[...path]/route.ts), donc affichable ici sans session galerie.
 *
 * Toujours le 30/07/2026 : ClientGalleriesView aplatit lui-même ces groupes par studio pour
 * proposer recherche/filtres/pagination sur l'ensemble des galeries du client (voir ce fichier
 * pour le détail) — `downloadLimit` est donc remonté ici pour permettre le filtre "Limité /
 * Illimité" (le nombre réellement consommé n'est PAS affiché : chaque clic sur "Voir galerie"
 * émet un nouveau clientRef, voir /client/galleries/[id]/view/route.ts, donc un décompte par
 * client stable façon Studio n'est pas fiable ici).
 *
 * `publishedAt` (date de publication, affichée sur chaque carte) est un champ trop récent pour
 * le Prisma Client généré du sandbox (voir le commentaire sur Gallery.publishedAt dans
 * schema.prisma) : il n'existe donc pas dans le `select` typé ci-dessous et est récupéré à part
 * via $queryRaw, comme le fait déjà /api/client-portal/account pour ClientAccount.name.
 *
 * Repéré par Adriel le 30/07/2026 : `publishedAt` ne se stamp que sur les FUTURES transitions
 * vers PUBLISHED (voir PATCH /api/galleries/[id]) — les galeries déjà publiées avant l'ajout de
 * ce champ n'ont donc aucune date et n'affichaient rien. Repli sur la date d'upload la plus
 * récente (Photo.createdAt, déjà utilisée par le graphique d'activité d'upload de la Vue
 * d'ensemble studio) comme meilleure approximation disponible tant que ces galeries n'ont pas
 * été republiées ; `null` uniquement si la galerie n'a ni date de publication ni aucune photo.
 */
export default async function ClientPortalPage() {
  const session = getClientPortalSession();
  if (!session) redirect("/client/login");

  const clientRows = await prisma.client.findMany({
    where: { email: session.email },
    include: {
      studio: { select: { id: true, name: true, slug: true, logoUrl: true } },
      galleries: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          slug: true,
          eventDate: true,
          coverPhotoId: true,
          downloadLimit: true,
          guests: { select: { status: true } },
          photos: { orderBy: { position: "asc" }, take: 1, select: { id: true, updatedAt: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Galeries en accès secondaire (lecture seule, voir modèle GalleryClientAccess) : ce Client
  // n'est pas le client principal mais a reçu un accès de consultation depuis /dashboard/galleries
  // > Nouvelle galerie > "Clients additionnels". Requête à part (comme publishedAt plus bas) : ce
  // modèle est trop récent pour le Prisma Client généré du sandbox, pas de relation typée
  // `client.galleryAccess` disponible tant qu'Adriel n'a pas relancé `prisma generate && prisma
  // db push` en local.
  const clientRowIds = clientRows.map((row) => row.id);
  const accessRows = clientRowIds.length
    ? await prisma.$queryRaw<{ clientId: string; galleryId: string }[]>`
        SELECT "clientId", "galleryId" FROM "GalleryClientAccess" WHERE "clientId" = ANY(${clientRowIds})
      `
    : [];
  const additionalGalleryIdsByClientRowId = new Map<string, string[]>();
  for (const r of accessRows) {
    const list = additionalGalleryIdsByClientRowId.get(r.clientId) || [];
    list.push(r.galleryId);
    additionalGalleryIdsByClientRowId.set(r.clientId, list);
  }
  const additionalGalleries = accessRows.length
    ? await prisma.gallery.findMany({
        where: { id: { in: accessRows.map((r) => r.galleryId) } },
        select: {
          id: true,
          title: true,
          status: true,
          slug: true,
          eventDate: true,
          coverPhotoId: true,
          downloadLimit: true,
          guests: { select: { status: true } },
          photos: { orderBy: { position: "asc" }, take: 1, select: { id: true, updatedAt: true } },
        },
      })
    : [];
  const additionalGalleryById = new Map(additionalGalleries.map((g) => [g.id, g]));

  // Chaque ligne Client combine désormais ses galeries "principales" (row.galleries) et ses
  // galeries en accès secondaire — dédupliquées (un client ne devrait normalement pas être à
  // la fois principal et additionnel sur la même galerie, voir POST /api/galleries, mais on
  // reste défensif ici).
  const combinedByRowId = new Map(
    clientRows.map((row) => {
      const seen = new Set(row.galleries.map((g) => g.id));
      const additional = (additionalGalleryIdsByClientRowId.get(row.id) || [])
        .map((id) => additionalGalleryById.get(id))
        .filter((g): g is NonNullable<typeof g> => Boolean(g) && !seen.has(g!.id));
      return [row.id, [...row.galleries, ...additional]];
    })
  );

  // `coverPhotoId` n'est pas une relation Prisma : on va chercher les photos de couverture
  // choisies explicitement en une seule requête à part (même patron que /dashboard/galleries).
  const coverIds = Array.from(combinedByRowId.values())
    .flatMap((galleries) => galleries.map((g) => g.coverPhotoId))
    .filter((id): id is string => Boolean(id));
  const coverPhotos = coverIds.length
    ? await prisma.photo.findMany({ where: { id: { in: coverIds } }, select: { id: true, updatedAt: true } })
    : [];
  const coverById = new Map(coverPhotos.map((p) => [p.id, p]));

  // Voir la note en tête de fichier : `publishedAt` n'est pas encore dans le Prisma Client
  // généré du sandbox, donc récupéré à part via $queryRaw plutôt que dans le `select` ci-dessus.
  const galleryIds = Array.from(combinedByRowId.values()).flatMap((galleries) => galleries.map((g) => g.id));
  const publishedRows = galleryIds.length
    ? await prisma.$queryRaw<{ id: string; publishedAt: Date | null }[]>`
        SELECT "id", "publishedAt" FROM "Gallery" WHERE "id" = ANY(${galleryIds})
      `
    : [];
  const publishedAtById = new Map(publishedRows.map((r) => [r.id, r.publishedAt]));

  // Repli "date d'upload la plus récente" (voir la note en tête de fichier) — champ Prisma
  // ordinaire (Photo.createdAt existe depuis le début), donc requête typée normale, pas de
  // $queryRaw nécessaire ici.
  const latestUploads = galleryIds.length
    ? await prisma.photo.groupBy({ by: ["galleryId"], where: { galleryId: { in: galleryIds } }, _max: { createdAt: true } })
    : [];
  const latestUploadById = new Map(latestUploads.map((r) => [r.galleryId, r._max.createdAt]));

  const rows = clientRows.map((row) => ({
    id: row.id,
    studioId: row.studio.id,
    studioName: row.studio.name,
    studioLogoUrl: row.studio.logoUrl,
    galleries: (combinedByRowId.get(row.id) || []).map((g) => {
      const cover = (g.coverPhotoId && coverById.get(g.coverPhotoId)) || g.photos[0] || null;
      return {
        id: g.id,
        title: g.title,
        status: g.status,
        slug: g.slug,
        coverPhotoId: cover?.id || null,
        coverUpdatedAt: cover?.updatedAt.toISOString() || null,
        downloadLimit: g.downloadLimit,
        // Repli sur la date d'upload uniquement si la galerie n'est plus en DRAFT (voir la
        // note en tête de fichier) : côté client, `g.status !== "DRAFT"` conditionne déjà
        // l'affichage des boutons Voir/Partager (ClientGalleriesView), donc cohérent ici aussi.
        publishedAt:
          (publishedAtById.get(g.id) || (g.status !== "DRAFT" ? latestUploadById.get(g.id) : null) || null)?.toISOString() ||
          null,
        approvedCount: g.guests.filter((x) => x.status === "APPROVED").length,
        pendingCount: g.guests.filter((x) => x.status === "PENDING").length,
      };
    }),
  }));

  return <ClientGalleriesView rows={rows} />;
}
