import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validators";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { provisionStudioWithOwner } from "@/lib/provisionStudio";

/**
 * Création d'un nouveau studio (photographe) + premier utilisateur OWNER.
 * Équivalent de l'inscription sur pixieset.com.
 */
export async function POST(req: Request) {
  // Limite volontairement large (création de compte légitime rare mais possible en rafale,
  // ex: une agence qui crée plusieurs studios) tout en bloquant la création automatisée en
  // masse : 10 inscriptions par IP et par heure.
  const ip = getClientIp(req);
  const limited = rateLimit(`register:${ip}`, 10, 60 * 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives d'inscription. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { studioName, name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { studio } = await provisionStudioWithOwner({
    studioName,
    ownerName: name,
    ownerEmail: email,
    passwordHash,
  });

  return NextResponse.json({ studioId: studio.id, slug: studio.slug }, { status: 201 });
}
