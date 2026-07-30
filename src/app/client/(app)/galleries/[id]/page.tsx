import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getClientPortalSession } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { SetVisibilityManager } from "@/components/client-portal/SetVisibilityManager";
import { GuestListManager } from "@/components/client-portal/GuestListManager";

export const dynamic = "force-dynamic";

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
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/client" className="text-sm text-gray-500 hover:underline">
        ← Mon espace
      </Link>
      <h1 className="mt-2 font-serif text-2xl font-semibold">{gallery.title}</h1>

      <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Vous êtes seul responsable des droits de diffusion et des accès que vous accordez sur
        la visibilité de ces images.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gray-900">Visibilité des sets</h2>
        <p className="mt-1 text-xs text-gray-500">
          Choisissez qui peut voir chaque set de cette galerie.
        </p>
        <div className="mt-3">
          <SetVisibilityManager
            galleryId={gallery.id}
            // Le set "Portfolio" auto-créé (isPortfolioDefault) est exclu : sa visibilité
            // reste gérée exclusivement par le studio, jamais par le client — demandé par
            // Adriel le 29/07/2026.
            initialCollections={gallery.collections
              .filter((c) => !c.isPortfolioDefault)
              .map((c) => ({
                id: c.id,
                title: c.title,
                visibility: c.visibility,
                isPortfolioDefault: c.isPortfolioDefault,
              }))}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gray-900">Invités</h2>
        <p className="mt-1 text-xs text-gray-500">
          Recherchez un invité et activez ou désactivez son accès à tout moment.
        </p>
        <div className="mt-3">
          <GuestListManager
            galleryId={gallery.id}
            initialGuests={gallery.guests.map((g) => ({
              id: g.id,
              email: g.email,
              status: g.status,
              approvalToken: g.approvalToken,
            }))}
          />
        </div>
      </section>
    </div>
  );
}
