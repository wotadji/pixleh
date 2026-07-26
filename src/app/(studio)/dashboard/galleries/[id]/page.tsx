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

  return (
    <GalleryManager
      existingTags={existingTags}
      gallery={{
        id: gallery.id,
        studioId: gallery.studioId,
        slug: gallery.slug,
        title: gallery.title,
        clientId: gallery.clientId,
        status: gallery.status,
        eventDate: gallery.eventDate ? gallery.eventDate.toISOString() : null,
        password: gallery.password,
        coverPhotoId: gallery.coverPhotoId,
        allowDownload: gallery.allowDownload,
        downloadLimit: gallery.downloadLimit,
        guestSlug: gallery.guestSlug,
        allowGuestDownload: gallery.allowGuestDownload,
        allowFavorites: gallery.allowFavorites,
        showWatermark: gallery.showWatermark,
        expiresAt: gallery.expiresAt ? gallery.expiresAt.toISOString() : null,
        categoryTag: gallery.categoryTag,
        starred: gallery.starred,
        defaultVisibility: gallery.defaultVisibility,
        design: gallery.design,
        photoSortOrder: gallery.photoSortOrder,
        photos: gallery.photos.map((p) => ({
          id: p.id,
          filename: p.filename,
          collectionId: p.collectionId,
          updatedAt: p.updatedAt.toISOString(),
          createdAt: p.createdAt.toISOString(),
          sizeBytes: p.sizeBytes,
        })),
        collections: gallery.collections.map((c) => ({ id: c.id, title: c.title, visibility: c.visibility })),
      }}
    />
  );
}
