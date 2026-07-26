import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";

/**
 * Change le mot de passe du compte connecté (dashboard studio). Exige le mot de passe
 * actuel (vérifié via bcrypt) pour éviter qu'une session laissée ouverte sur un poste
 * partagé permette de changer le mot de passe sans le connaître.
 */
export async function PATCH(req: Request) {
  try {
    const session = await requireStudioSession();
    const { currentPassword, newPassword } = await req.json();

    if (!newPassword) {
      throw new AccessError("Nouveau mot de passe requis.", 400);
    }
    if (String(newPassword).length < 8) {
      throw new AccessError("Le nouveau mot de passe doit contenir au moins 8 caractères.", 400);
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) throw new AccessError("Utilisateur introuvable.", 404);

    // user.passwordHash === null : compte créé uniquement via Social Login (Google,
    // GitHub...), qui n'a jamais eu de mot de passe — on le définit ici pour la première
    // fois (ex: pour pouvoir aussi se connecter par email en secours), sans rien à vérifier.
    // Sinon (compte "classique" ou déjà doté d'un mot de passe), on exige l'actuel.
    if (user.passwordHash) {
      if (!currentPassword) {
        throw new AccessError("Mot de passe actuel requis.", 400);
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) throw new AccessError("Mot de passe actuel incorrect.", 403);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
