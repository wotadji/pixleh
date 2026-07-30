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
          guests: { select: { status: true } },
          photos: { orderBy: { position: "asc" }, take: 1, select: { id: true, updatedAt: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // `coverPhotoId` n'est pas une relation Prisma : on va chercher les photos de couverture
  // choisies explicitement en une seule requête à part (même patron que /dashboard/galleries).
  const coverIds = clientRows
    .flatMap((row) => row.galleries.map((g) => g.coverPhotoId))
    .filter((id): id is string => Boolean(id));
  const coverPhotos = coverIds.length
    ? await prisma.photo.findMany({ where: { id: { in: coverIds } }, select: { id: true, updatedAt: true } })
    : [];
  const coverById = new Map(coverPhotos.map((p) => [p.id, p]));

  const rows = clientRows.map((row) => ({
    id: row.id,
    studioId: row.studio.id,
    studioName: row.studio.name,
    studioLogoUrl: row.studio.logoUrl,
    galleries: row.galleries.map((g) => {
      const cover = (g.coverPhotoId && coverById.get(g.coverPhotoId)) || g.photos[0] || null;
      return {
        id: g.id,
        title: g.title,
        status: g.status,
        slug: g.slug,
        coverPhotoId: cover?.id || null,
        coverUpdatedAt: cover?.updatedAt.toISOString() || null,
        approvedCount: g.guests.filter((x) => x.status === "APPROVED").length,
        pendingCount: g.guests.filter((x) => x.status === "PENDING").length,
      };
    }),
  }));

  return <ClientGalleriesView rows={rows} />;
}
