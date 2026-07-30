import { redirect } from "next/navigation";
import Link from "next/link";
import { getClientPortalSession } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "@/components/client-portal/LogoutButton";

export const dynamic = "force-dynamic";

/**
 * Tableau de bord de l'espace Client (/client) — toutes les galeries dont un Client CRM
 * (potentiellement dans plusieurs studios différents) partage l'email de la session en
 * cours, groupées par studio. Voir prisma/schema.prisma (ClientAccount) et
 * src/lib/clientSession.ts pour le mécanisme de session, distinct du dashboard studio.
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
        select: { id: true, title: true, status: true, slug: true, eventDate: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Mon espace</h1>
          <p className="mt-1 text-sm text-gray-600">{session.email}</p>
        </div>
        <LogoutButton />
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
                {row.galleries.map((g) => (
                  <li key={g.id}>
                    <Link
                      href={`/client/galleries/${g.id}`}
                      className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50"
                    >
                      <span>
                        {g.title}
                        {g.status !== "PUBLISHED" && (
                          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            {g.status === "DRAFT" ? "Brouillon" : "Archivée"}
                          </span>
                        )}
                      </span>
                      <span className="text-gray-400">Gérer →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
