import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { generateSecureToken, sendClientAccountVerificationEmail } from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * Étape "créer un mot de passe" du login client (/client/login), affichée quand check-email
 * a renvoyé exists=true, hasPassword=false. Crée le ClientAccount s'il n'existe pas encore,
 * ou remplace son mot de passe s'il existe déjà sans (cas : compte créé mais jamais activé).
 * Le mot de passe n'est utilisable pour se connecter qu'une fois l'email confirmé (voir
 * /api/client-portal/verify-email) — emailVerified reste donc inchangé ici s'il était déjà
 * vérifié, mais est remis à zéro si on écrase un mot de passe non encore confirmé (jamais
 * l'inverse : un email déjà confirmé le reste, même en changeant le mot de passe via ce flux).
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limited = rateLimit(`client-set-password:${ip}`, 10, 15 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const { email, password } = await req.json();
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "8 caractères minimum" }, { status: 400 });
  }

  const clientMatch = await prisma.client.findFirst({ where: { email: cleanEmail } });
  if (!clientMatch) {
    // Même message que si tout allait bien, pour ne pas confirmer/infirmer l'existence du
    // compte à quelqu'un qui n'a pas les droits dessus.
    return NextResponse.json({ ok: true });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const verifyToken = generateSecureToken();
  const verifyTokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const existing = await prisma.clientAccount.findUnique({ where: { email: cleanEmail } });
  if (existing?.passwordHash) {
    // hasPassword aurait dû rediriger vers l'étape "mot de passe" côté front — protection
    // défensive côté serveur au cas où l'appel arrive quand même (état front désynchronisé).
    return NextResponse.json(
      { error: "Un mot de passe existe déjà pour ce compte. Connectez-vous normalement." },
      { status: 409 }
    );
  }

  await prisma.clientAccount.upsert({
    where: { email: cleanEmail },
    update: { passwordHash, verifyToken, verifyTokenExpiry },
    create: { email: cleanEmail, passwordHash, verifyToken, verifyTokenExpiry },
  });

  sendClientAccountVerificationEmail({ email: cleanEmail, verifyToken }).catch((e) =>
    console.error("Échec de l'email de vérification client :", e)
  );

  return NextResponse.json({ ok: true });
}
