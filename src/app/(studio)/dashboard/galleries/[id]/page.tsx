import { notFound } from "next/navigation";
import { getStudioSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { GalleryManager } from "@/components/studio/GalleryManager";

export default async function GalleryDetailPage({ params }: { params: { id: string } }) {
  const session = await getStudioSession();
  const gallery = await prisma.gallery.findFirst({
    where: { id: params.id, studioId: session!.user.studioId },
    include: {
      photos: { orderBy: { position: "asc" } },
      collections: { orderBy: { position: "asc" } },
    },
  });
  if (!gallery) notFound();

  // Clients additionnels déjà accordés (voir modèle GalleryClientAccess) — $queryRaw plutôt
  // que l'API Prisma typée : ce modèle est trop récent pour le Prisma Client généré du
  // sandbox (voir le commentaire sur ce modèle dans schema.prisma), même limitation que
  // Gallery.publishedAt. Édité depuis l'onglet Réglages (demandé par Adriel le 11/08/2026),
  // pas seulement à la création (voir NewGalleryForm).
  const additionalClientRows = await prisma.$queryRaw<{ clientId: string }[]>`
    SELECT "clientId" FROM "GalleryClientAccess" WHERE "galleryId" = ${gallery.id}
  `;
  const additionalClientIds = additionalClientRows.map((r) => r.clientId);

  // isSocialDefault (set "Réseaux sociaux" auto-créé, voir POST /api/galleries) : trop récent
  // pour le Prisma Client généré du sandbox (voir le commentaire sur ce champ dans
  // schema.prisma), donc lu à part via $queryRaw et fusionné dans gallery.collections plus
  // bas, même workaround qu'additionalClientIds ci-dessus.
  const socialDefaultRows = await prisma.$queryRaw<{ id: string; isSocialDefault: boolean }[]>`
    SELECT "id", "isSocialDefault" FROM "Collection" WHERE "galleryId" = ${gallery.id}
  `;
  const socialDefaultById = new Map(socialDefaultRows.map((r) => [r.id, r.isSocialDefault]));

  // portfolioTagged/socialTagged (Photo) : même limitation/workaround que isSocialDefault
  // ci-dessus (voir le commentaire sur ces deux champs dans schema.prisma).
  const photoTagRows = await prisma.$queryRaw<
    { id: string; portfolioTagged: boolean; socialTagged: boolean }[]
  >`SELECT "id", "portfolioTagged", "socialTagged" FROM "Photo" WHERE "galleryId" = ${gallery.id}`;
  const photoTagsById = new Map(photoTagRows.map((r) => [r.id, r]));

  // Tags déjà utilisés sur d'autres galeries du studio, pour l'autocomplétion du champ
  // "Catégorie / tag" (créer = taper un nom nouveau, réutiliser = choisir dans la liste).
  const tagRows = await prisma.gallery.findMany({
    where: { studioId: session!.user.studioId, categoryTag: { not: null } },
    select: { categoryTag: true },
    distinct: ["categoryTag"],
  });
  const existingTags = tagRows
    .map((r) => r.categoryTag)
    .filter((tag): tag is string => !!tag && tag.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));

  // Nouveaux champs Gallery du chantier refonte Réglages (12/09/2026) : trop récents pour le
  // Prisma Client généré du sandbox (voir schema.prisma sur ces champs) — même workaround
  // $queryRaw que additionalClientIds/isSocialDefault ci-dessus, en un seul aller-retour.
  const extraFieldsRows = await prisma.$queryRaw<
    {
      description: string | null;
      tags: string[];
      projectName: string | null;
      allowComments: boolean;
      containsPortraits: boolean;
      selectionLimit: number | null;
      showMetadata: boolean;
      downloadWebOptimized: boolean;
      downloadSocialFormats: boolean;
    }[]
  >`SELECT "description", "tags", "projectName", "allowComments", "containsPortraits",
      "selectionLimit", "showMetadata", "downloadWebOptimized", "downloadSocialFormats"
    FROM "Gallery" WHERE "id" = ${gallery.id}`;
  const extraFields = extraFieldsRows[0] ?? {
    description: null,
    tags: [],
    projectName: null,
    allowComments: false,
    containsPortraits: false,
    selectionLimit: null,
    showMetadata: false,
    downloadWebOptimized: false,
    downloadSocialFormats: false,
  };

  // Crédits prestataires (voir modèle GalleryCredit) — même workaround $queryRaw, table trop
  // récente pour le Prisma Client généré du sandbox.
  const creditRows = await prisma.$queryRaw<
    { id: string; role: string; name: string; url: string | null }[]
  >`SELECT "id", "role", "name", "url" FROM "GalleryCredit" WHERE "galleryId" = ${gallery.id} ORDER BY "position" ASC`;

  // Presets de réglages du studio (voir modèle GalleryPreset), proposés dans l'onglet
  // Présentation ("Réutiliser cette mise en scène") — mêmes limitations $queryRaw.
  const presetRows = await prisma.$queryRaw<
    { id: string; name: string; design: unknown }[]
  >`SELECT "id", "name", "design" FROM "GalleryPreset" WHERE "studioId" = ${session!.user.studioId} ORDER BY "createdAt" DESC`;

  return (
    <GalleryManager
      existingTags={existingTags}
      presets={presetRows}
      gallery={{
        id: gallery.id,
        studioId: gallery.studioId,
        slug: gallery.slug,
        title: gallery.title,
        clientId: gallery.clientId,
        additionalClientIds,
        status: gallery.status,
        eventDate: gallery.eventDate ? gallery.eventDate.toISOString() : null,
        password: gallery.password,
        coverPhotoId: gallery.coverPhotoId,
        allowDownload: gallery.allowDownload,
        downloadLimit: gallery.downloadLimit,
        guestSlug: gallery.guestSlug,
        allowGuestDownload: gallery.allowGuestDownload,
        requireGuestApproval: gallery.requireGuestApproval,
        allowFavorites: gallery.allowFavorites,
        showWatermark: gallery.showWatermark,
        expiresAt: gallery.expiresAt ? gallery.expiresAt.toISOString() : null,
        categoryTag: gallery.categoryTag,
        starred: gallery.starred,
        defaultVisibility: gallery.defaultVisibility,
        design: gallery.design,
        photoSortOrder: gallery.photoSortOrder,
        description: extraFields.description,
        tags: extraFields.tags,
        projectName: extraFields.projectName,
        allowComments: extraFields.allowComments,
        containsPortraits: extraFields.containsPortraits,
        selectionLimit: extraFields.selectionLimit,
        showMetadata: extraFields.showMetadata,
        downloadWebOptimized: extraFields.downloadWebOptimized,
        downloadSocialFormats: extraFields.downloadSocialFormats,
        credits: creditRows,
        photos: gallery.photos.map((p) => ({
          id: p.id,
          filename: p.filename,
          collectionId: p.collectionId,
          updatedAt: p.updatedAt.toISOString(),
          createdAt: p.createdAt.toISOString(),
          sizeBytes: p.sizeBytes,
          portfolioTagged: photoTagsById.get(p.id)?.portfolioTagged ?? false,
          socialTagged: photoTagsById.get(p.id)?.socialTagged ?? false,
        })),
        collections: gallery.collections.map((c) => ({
          id: c.id,
          title: c.title,
          visibility: c.visibility,
          isPortfolioDefault: c.isPortfolioDefault,
          isSocialDefault: socialDefaultById.get(c.id) ?? false,
        })),
      }}
    />
  );
}
