import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getClientPortalSession } from "@/lib/clientSession";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Page Paramètres de l'espace Client (/client/settings) : lire/modifier le nom affiché et,
 * optionnellement, changer le mot de passe. L'email n'est PAS modifiable ici — c'est la clé
 * qui relie ce ClientAccount aux Client CRM de chaque studio (voir /client/page.tsx), le
 * changer casserait ce lien silencieusement ; un studio devrait plutôt être contacté pour
 * mettre à jour l'adresse côté Client CRM si besoin.
 *
 * Le champ `name` a été ajouté au modèle ClientAccount (voir schema.prisma) après la dernière
 * génération du client Prisma dans cet environnement (le sandbox ne peut pas télécharger le
 * moteur — voir la note sur la tâche #145) : on passe donc par $queryRaw/$executeRaw pour ce
 * seul champ plutôt que par prisma.clientAccount.{find,update}, qui ignoreraient `name` tant
 * qu'`npx prisma generate` n'a pas été relancé (à faire par Adriel). Une fois régénéré, ces
 * deux endroits pourront repasser par l'API Prisma normale sans changement de comportement.
 */
export async function GET() {
  const session = getClientPortalSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const rows = await prisma.$queryRaw<{ name: string | null }[]>`
    SELECT "name" FROM "ClientAccount" WHERE "id" = ${session.clientAccountId}
  `;
  return NextResponse.json({ email: session.email, name: rows[0]?.name ?? null });
}

export async function PATCH(req: Request) {
  const session = getClientPortalSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const ip = getClientIp(req);
  const limited = rateLimit(`client-account-update:${ip}`, 10, 15 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { name, currentPassword, newPassword } = body as {
    name?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  if (name !== undefined) {
    const cleanName = typeof name === "string" ? name.trim().slice(0, 100) : "";
    await prisma.$executeRaw`
      UPDATE "ClientAccount" SET "name" = ${cleanName || null} WHERE "id" = ${session.clientAccountId}
    `;
  }

  if (newPassword !== undefined) {
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json({ error: "8 caractères minimum" }, { status: 400 });
    }
    const account = await prisma.clientAccount.findUnique({ where: { id: session.clientAccountId } });
    if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

    // Un compte peut ne pas encore avoir de mot de passe (créé uniquement via le flux
    // "galerie prête" côté studio, jamais connecté à /client/login) — dans ce cas on ne
    // redemande pas l'ancien mot de passe, il n'y en a pas à vérifier.
    if (account.passwordHash) {
      const valid =
        typeof currentPassword === "string" && (await bcrypt.compare(currentPassword, account.passwordHash));
      if (!valid) {
        return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 401 });
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.clientAccount.update({ where: { id: account.id }, data: { passwordHash } });
  }

  return NextResponse.json({ ok: true });
}
