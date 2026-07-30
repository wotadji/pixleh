import { getStudioSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { GalleriesListView } from "@/components/studio/GalleriesListView";

// Toujours recalculée côté serveur (jamais mise en cache statiquement) : combiné aux
// `revalidatePath("/dashboard/galleries")` posés dans les routes qui créent/modifient/
// suppriment des galeries ou des photos, ça garantit que cette liste est à jour dès la
// prochaine navigation, sans avoir à recharger la page manuellement.
export const dynamic = "force-dynamic";

export default async function GalleriesListPage() {
  const session = await getStudioSession();
  const studioId = session!.user.studioId;

  const galleries = await prisma.gallery.findMany({
    where: { studioId },
    include: {
      client: true,
      _count: { select: { photos: true } },
      // Filet de sécurité si `coverPhotoId` n'est pas défini : la première photo par
      // position sert de couverture par défaut (même logique que la page studio publique).
      photos: { orderBy: { position: "asc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  // `coverPhotoId` n'est pas une relation Prisma (juste un String) : impossible de la
  // résoudre dans l'include ci-dessus, donc on va chercher les photos de couverture
  // choisies explicitement en une seule requête à part.
  const coverIds = galleries
    .map((g) => g.coverPhotoId)
    .filter((id): id is string => Boolean(id));
  const coverPhotos = coverIds.length
    ? await prisma.photo.findMany({ where: { id: { in: coverIds } } })
    : [];
  const coverById = new Map(coverPhotos.map((p) => [p.id, p]));

  // `publishedAt` (30/07/2026, demande d'Adriel) est trop récent pour le Prisma Client généré
  // du sandbox (voir le commentaire sur Gallery.publishedAt dans schema.prisma) : récupéré à
  // part via $queryRaw, comme côté espace Client (voir client/(app)/page.tsx).
  const galleryIds = galleries.map((g) => g.id);
  const publishedRows = galleryIds.length
    ? await prisma.$queryRaw<{ id: string; publishedAt: Date | null }[]>`
        SELECT "id", "publishedAt" FROM "Gallery" WHERE "id" = ANY(${galleryIds})
      `
    : [];
  const publishedAtById = new Map(publishedRows.map((r) => [r.id, r.publishedAt]));

  return (
    <GalleriesListView
      studioId={studioId}
      galleries={galleries.map((g) => {
        const cover = (g.coverPhotoId && coverById.get(g.coverPhotoId)) || g.photos[0] || null;
        return {
          id: g.id,
          title: g.title,
          status: g.status,
          clientName: g.client?.name || null,
          photoCount: g._count.photos,
          createdAt: g.createdAt.toISOString(),
          eventDate: g.eventDate ? g.eventDate.toISOString() : null,
          expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
          categoryTag: g.categoryTag,
          starred: g.starred,
          featuredHome: g.featuredHome,
          coverPhotoId: cover?.id || null,
          coverUpdatedAt: cover?.updatedAt.toISOString() || null,
          publishedAt: publishedAtById.get(g.id)?.toISOString() || null,
        };
      })}
    />
  );
}
