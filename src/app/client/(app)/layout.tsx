import { redirect } from "next/navigation";
import { getClientPortalSession } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { ClientPortalSidebar } from "@/components/client-portal/ClientPortalSidebar";

export const dynamic = "force-dynamic";

/**
 * Layout des pages authentifiées de l'espace Client (Mes galeries, Paramètres, Mes
 * impressions) — /client/login reste EN DEHORS de ce groupe de routes (sibling direct de
 * (app) sous /client/) pour ne jamais être concerné par cette redirection : sans quoi un
 * visiteur sans session redirigé vers /client/login se retrouverait lui-même dans une boucle
 * (le layout s'appliquerait aussi à la page de connexion et la redirigerait sur elle-même).
 */
export default async function ClientPortalAppLayout({ children }: { children: React.ReactNode }) {
  const session = getClientPortalSession();
  if (!session) redirect("/client/login");

  // Bulle "nombre de galeries" affichée à côté de "Mes galeries" dans le sidebar (demandé par
  // Adriel le 30/07/2026, déplacée depuis le titre de /client/page.tsx) — comptée ici plutôt
  // que dans la page elle-même pour être disponible sur TOUTES les pages du groupe (app), pas
  // seulement /client.
  const galleryCount = await prisma.gallery.count({
    where: { client: { email: session.email } },
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl">
      <ClientPortalSidebar email={session.email} galleryCount={galleryCount} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
