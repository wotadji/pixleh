import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

/**
 * Session de l'espace Client unifié (/client/...) — indépendante de NextAuth (réservé aux
 * comptes studio, voir src/lib/auth.ts) et du cookie par-galerie (voir gallery-session.ts).
 * Un seul cookie, scoppé par email (ClientAccount), qui donne accès à TOUTES les galeries
 * dont un Client CRM (potentiellement dans plusieurs studios différents) partage cet email —
 * voir /client/page.tsx.
 */

interface ClientTokenPayload {
  clientAccountId: string;
  email: string;
}

const SECRET = process.env.NEXTAUTH_SECRET || "dev-secret-change-me";
export const CLIENT_SESSION_COOKIE = "client_portal_session";

export function issueClientToken(payload: ClientTokenPayload) {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifyClientToken(token: string): ClientTokenPayload | null {
  try {
    return jwt.verify(token, SECRET) as ClientTokenPayload;
  } catch {
    return null;
  }
}

export function getClientPortalSession(): ClientTokenPayload | null {
  const raw = cookies().get(CLIENT_SESSION_COOKIE)?.value;
  if (!raw) return null;
  return verifyClientToken(raw);
}
