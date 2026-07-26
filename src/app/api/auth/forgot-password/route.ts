import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { generateSecureToken, sendPasswordResetEmail } from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * Demande de réinitialisation de mot de passe (voir /forgot-password). Répond TOUJOURS le
 * même message générique, que l'email existe ou non — révéler qu'un email n'est associé à
 * aucun compte permettrait à un attaquant d'énumérer les comptes existants (même principe
 * que le message "Email ou mot de passe incorrect" générique de /login, voir auth.ts).
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  // Double limite (IP + email) : empêche à la fois le bombardement d'un email précis (un
  // tiers malveillant qui spamme la boîte d'un studio avec des emails de réinitialisation)
  // et l'énumération de comptes en masse depuis une seule IP.
  const limitedIp = rateLimit(`forgot-password-ip:${ip}`, 10, 60 * 60 * 1000);
  if (!limitedIp.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(limitedIp.retryAfterSeconds) } }
    );
  }

  const { email } = await req.json().catch(() => ({ email: "" }));
  const generic = NextResponse.json({
    ok: true,
    message: "Si un compte existe avec cet email, un lien de réinitialisation vient de lui être envoyé.",
  });

  if (!email || typeof email !== "string") return generic;
  const normalized = email.toLowerCase().trim();

  const limitedEmail = rateLimit(`forgot-password-email:${normalized}`, 5, 60 * 60 * 1000);
  if (!limitedEmail.allowed) return generic;

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  // Compte Social Login sans mot de passe : rien à réinitialiser — même réponse générique,
  // ne révèle pas non plus ce détail (cohérent avec authorize() dans auth.ts).
  if (!user || !user.passwordHash) return generic;

  const resetToken = generateSecureToken();
  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  await sendPasswordResetEmail({ ownerName: user.name, ownerEmail: user.email, resetToken }).catch((e) =>
    console.error("Échec de l'email de réinitialisation :", e)
  );

  return generic;
}
