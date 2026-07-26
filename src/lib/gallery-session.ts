import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

/**
 * Session légère pour les CLIENTS qui consultent une galerie (pas de compte NextAuth).
 * Un cookie JWT signé, scoppé à une galerie précise, est posé après vérification
 * du mot de passe de la galerie (ou accès direct si la galerie n'a pas de mot de passe).
 */

interface GalleryTokenPayload {
  galleryId: string;
  clientRef: string; // identifiant anonyme stable pour cette visite (sert pour les favoris)
}

const SECRET = process.env.NEXTAUTH_SECRET || "dev-secret-change-me";
const COOKIE_PREFIX = "gallery_session_";

export function cookieNameFor(gallerySlug: string) {
  return `${COOKIE_PREFIX}${gallerySlug}`;
}

export function issueGalleryToken(payload: GalleryTokenPayload) {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifyGalleryToken(token: string): GalleryTokenPayload | null {
  try {
    return jwt.verify(token, SECRET) as GalleryTokenPayload;
  } catch {
    return null;
  }
}

export function getGallerySession(gallerySlug: string): GalleryTokenPayload | null {
  const raw = cookies().get(cookieNameFor(gallerySlug))?.value;
  if (!raw) return null;
  return verifyGalleryToken(raw);
}
