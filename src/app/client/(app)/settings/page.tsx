import { redirect } from "next/navigation";
import { getClientPortalSession } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { ClientSettingsPageView } from "@/components/client-portal/ClientSettingsPageView";

export const dynamic = "force-dynamic";

/**
 * Paramètres de l'espace Client — nom + mot de passe (voir ClientSettingsForm). L'email est
 * affiché en lecture seule : c'est la clé qui relie ce compte aux Client CRM de chaque studio
 * (voir /client/page.tsx), le rendre éditable casserait ce lien silencieusement.
 */
export default async function ClientSettingsPage() {
  const session = getClientPortalSession();
  if (!session) redirect("/client/login");

  const account = await prisma.clientAccount.findUnique({ where: { id: session.clientAccountId } });
  if (!account) redirect("/client/login");

  // `name` a été ajouté au schéma après la dernière génération du client Prisma dans cet
  // environnement — voir la note dans /api/client-portal/account/route.ts : on le lit donc
  // via $queryRaw ici aussi, en attendant qu'Adriel relance `npx prisma generate`.
  const rows = await prisma.$queryRaw<{ name: string | null }[]>`
    SELECT "name" FROM "ClientAccount" WHERE "id" = ${account.id}
  `;

  return (
    <ClientSettingsPageView
      email={session.email}
      initialName={rows[0]?.name ?? null}
      hasPassword={!!account.passwordHash}
    />
  );
}
