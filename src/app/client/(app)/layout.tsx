import { redirect } from "next/navigation";
import { getClientPortalSession } from "@/lib/clientSession";
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

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl">
      <ClientPortalSidebar email={session.email} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
