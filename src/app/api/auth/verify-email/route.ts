import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Confirme l'adresse email d'un compte, via le lien envoyé par sendWelcomeEmail /
 * sendVerificationEmail (voir src/lib/notifications.ts). Route GET simple (pas de session
 * requise : le lien doit fonctionner même si l'utilisateur clique depuis un autre appareil
 * ou n'est plus connecté) — le jeton lui-même fait office de preuve de possession de l'email.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

  if (!token) {
    return NextResponse.redirect(`${appUrl}/login?verify=invalid`);
  }

  const user = await prisma.user.findUnique({ where: { verifyToken: token } });
  if (!user || !user.verifyTokenExpiresAt || user.verifyTokenExpiresAt < new Date()) {
    return NextResponse.redirect(`${appUrl}/login?verify=expired`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date(), verifyToken: null, verifyTokenExpiresAt: null },
  });

  return NextResponse.redirect(`${appUrl}/login?verify=success`);
}
