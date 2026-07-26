import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { rateLimit } from "@/lib/rateLimit";
import { generateSecureToken, sendVerificationEmail } from "@/lib/notifications";

export const runtime = "nodejs";

/** Renvoie l'email de confirmation — bouton "Renvoyer" du bandeau EmailVerificationBanner
 * (dashboard) pour un compte qui n'a jamais cliqué le lien de bienvenue, ou dont le premier
 * jeton a expiré (48h). */
export async function POST() {
  try {
    const session = await requireStudioSession();

    const limited = rateLimit(`resend-verification:${session.user.id}`, 5, 60 * 60 * 1000);
    if (!limited.allowed) {
      throw new AccessError("Trop de demandes. Réessayez plus tard.", 429);
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) throw new AccessError("Utilisateur introuvable.", 404);
    if (user.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }

    const verifyToken = generateSecureToken();
    await prisma.user.update({
      where: { id: user.id },
      data: { verifyToken, verifyTokenExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) },
    });

    await sendVerificationEmail({ ownerName: user.name, ownerEmail: user.email, verifyToken });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
