import { redirect } from "next/navigation";
import Link from "next/link";
import { getClientPortalSession } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { ShareGalleryButton } from "@/components/client-portal/ShareGalleryButton";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  ARCHIVED: "Archivée",
};

/**
 * Tableau de bord de l'espace Client (/client) — toutes les galeries dont un Client CRM
 * (potentiellement dans plusieurs studios différents) partage l'email de la session en
 * cours, groupées par studio. Voir prisma/schema.prisma (ClientAccount) et
 * src/lib/clientSession.ts pour le mécanisme de session, distinct du dashboard studio.
 * Titre/email/déconnexion vivent désormais dans la barre latérale (voir layout.tsx du
 * groupe (app)), qui gère aussi la redirection si la session est absente.
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
          // Sert uniquement à compter les invités approuvés/en attente (bulles à côté du
          // titre) — pas de détail nécessaire ici, voir /client/galleries/[id] pour la
          // liste complète avec recherche + activation/désactivation.
          guests: { select: { status: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalGalleries = clientRows.reduce((sum, row) => sum + row.galleries.length, 0);

  return (
    <div className="px-6 py-10">
      <div className="flex items-center gap-2">
        <h1 className="font-serif text-2xl font-semibold">Mes galeries</h1>
        {totalGalleries > 0 && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-600">
            {totalGalleries}
          </span>
        )}
      </div>

      {clientRows.length === 0 && (
        <p className="mt-8 text-sm text-gray-600">Aucune galerie ne vous a encore été partagée.</p>
      )}

      <div className="mt-8 space-y-8">
        {clientRows.map((row) => (
          <div key={row.id}>
            <div className="flex items-center gap-2">
              {row.studio.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.studio.logoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
              )}
              <h2 className="text-sm font-semibold text-gray-900">{row.studio.name}</h2>
            </div>
            {row.galleries.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Aucune galerie pour l&apos;instant.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
                {row.galleries.map((g) => {
                  const approvedCount = g.guests.filter((x) => x.status === "APPROVED").length;
                  const pendingCount = g.guests.filter((x) => x.status === "PENDING").length;
                  return (
                  <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{g.title}</span>
                      {g.status !== "PUBLISHED" && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          {STATUS_LABELS[g.status]}
                        </span>
                      )}
                      {/* Bulles invités : accès accordé (vert) et en attente de validation
                          (ambre) — demandé par Adriel le 30/07/2026 pour voir d'un coup
                          d'œil s'il reste des demandes à traiter sans ouvrir "Gérer". */}
                      {approvedCount > 0 && (
                        <span
                          title={`${approvedCount} invité${approvedCount > 1 ? "s" : ""} avec accès`}
                          className="flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
                        >
                          {approvedCount}
                        </span>
                      )}
                      {pendingCount > 0 && (
                        <span
                          title={`${pendingCount} invité${pendingCount > 1 ? "s" : ""} en attente de validation`}
                          className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                        >
                          {pendingCount}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {g.status !== "DRAFT" && (
                        <>
                          <a
                            href={`/client/galleries/${g.id}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary px-3 py-1.5 text-xs"
                          >
                            Voir galerie
                          </a>
                          <ShareGalleryButton gallerySlug={g.slug} />
                        </>
                      )}
                      <Link href={`/client/galleries/${g.id}`} className="btn-secondary px-3 py-1.5 text-xs">
                        Gérer
                      </Link>
                    </span>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
