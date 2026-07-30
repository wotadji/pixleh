import { redirect, notFound } from "next/navigation";
import { getClientPortalSession } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { ClientGalleryDetailView } from "@/components/client-portal/ClientGalleryDetailView";

export const dynamic = "force-dynamic";

/** Ne fait plus que la requête + l'aplatissement : le rendu (traduit) vit dans
 * ClientGalleryDetailView (useLanguage/t() n'est pas accessible ici). */
export default async function ClientGalleryPage({ params }: { params: { id: string } }) {
  const session = getClientPortalSession();
  if (!session) redirect("/client/login");

  const gallery = await prisma.gallery.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      collections: { orderBy: { position: "asc" } },
      guests: { orderBy: { createdAt: "desc" } },
    },
  });

  // Vérification d'appartenance : la galerie doit être rattachée à un Client dont l'email
  // correspond à la session — jamais par studioId (l'espace client n'a pas de studio
  // "courant", potentiellement plusieurs galeries de studios différents pour cet email).
  if (!gallery || gallery.client?.email !== session.email) notFound();

  return (
    <ClientGalleryDetailView
      galleryId={gallery.id}
      galleryTitle={gallery.title}
      // Le set "Portfolio" auto-créé (isPortfolioDefault) est exclu : sa visibilité reste
      // gérée exclusivement par le studio, jamais par le client — demandé par Adriel le
      // 29/07/2026.
      collections={gallery.collections
        .filter((c) => !c.isPortfolioDefault)
        .map((c) => ({
          id: c.id,
          title: c.title,
          visibility: c.visibility,
          isPortfolioDefault: c.isPortfolioDefault,
        }))}
      guests={gallery.guests.map((g) => ({
        id: g.id,
        email: g.email,
        status: g.status,
        approvalToken: g.approvalToken,
      }))}
    />
  );
}
