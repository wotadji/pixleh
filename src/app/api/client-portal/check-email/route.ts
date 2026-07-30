import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Étape 1 du login client (/client/login) : à partir de l'email seul, indique au front quelle
 * étape afficher ensuite (mot de passe existant, création de mot de passe, ou aucun compte).
 * Ne révèle jamais directement si l'email est un Client CRM connu — seulement les deux
 * booléens nécessaires à l'UI, ce qui limite (sans l'éliminer complètement, un email de test
 * suffit à distinguer les deux) l'énumération d'adresses.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limited = rateLimit(`client-check-email:${ip}`, 20, 15 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const { email } = await req.json();
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  // Un espace client n'a de sens que pour une adresse déjà connue comme Client (CRM) d'AU
  // MOINS un studio — pas de création "à froid" d'un espace pour n'importe qui.
  const clientMatch = await prisma.client.findFirst({ where: { email: cleanEmail } });
  if (!clientMatch) {
    return NextResponse.json({ exists: false, hasPassword: false });
  }

  const account = await prisma.clientAccount.findUnique({ where: { email: cleanEmail } });
  return NextResponse.json({ exists: true, hasPassword: !!account?.passwordHash });
}
