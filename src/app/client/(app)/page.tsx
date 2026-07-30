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
          guests: { select: { status: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = clientRows.map((row) => ({
    id: row.id,
    studioName: row.studio.name,
    studioLogoUrl: row.studio.logoUrl,
    galleries: row.galleries.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      slug: g.slug,
      approvedCount: g.guests.filter((x) => x.status === "APPROVED").length,
      pendingCount: g.guests.filter((x) => x.status === "PENDING").length,
    })),
  }));

  return <ClientGalleriesView rows={rows} />;
}
