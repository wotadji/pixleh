import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";

const userAdminUpdateSchema = z.object({
  isPlatformAdmin: z.boolean(),
});

/**
 * Accorde ou retire l'accès admin plateforme (/admin) à un utilisateur, quel que soit son
 * studio — c'est le seul moyen prévu dans l'UI de le faire (sinon il faut passer par Prisma
 * Studio directement). Un admin ne peut pas se retirer lui-même ce droit ici, pour éviter de
 * se retrouver bloqué hors de /admin par erreur — il faudrait alors repasser par la base.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requirePlatformAdmin();
    const body = await req.json();
    const parsed = userAdminUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) throw new AccessError("Utilisateur introuvable.", 404);

    if (target.id === session.user.id && !parsed.data.isPlatformAdmin) {
      throw new AccessError(
        "Impossible de retirer votre propre accès admin depuis cette page.",
        400
      );
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data: { isPlatformAdmin: parsed.data.isPlatformAdmin },
      select: { id: true, name: true, email: true, isPlatformAdmin: true },
    });
    return NextResponse.json({ user });
  } catch (e) {
    return handleApiError(e);
  }
}
