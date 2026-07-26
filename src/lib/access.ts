import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGallerySession } from "@/lib/gallery-session";
import type { Gallery } from "@prisma/client";

/** Session studio courante (dashboard), ou null si non connecté. */
export async function getStudioSession() {
  return getServerSession(authOptions);
}

/** Lève si aucune session studio n'est active ; renvoie sinon la session. */
export async function requireStudioSession() {
  const session = await getStudioSession();
  if (!session) {
    throw new AccessError("Non authentifié", 401);
  }
  return session;
}

/**
 * Lève si l'utilisateur connecté n'a pas l'accès admin plateforme (User.isPlatformAdmin) —
 * espace distinct du dashboard studio, réservé à l'équipe pixleh (voir /admin). Utilisé par
 * toutes les routes /api/admin/*.
 */
export async function requirePlatformAdmin() {
  const session = await requireStudioSession();
  if (!(session.user as any).isPlatformAdmin) {
    throw new AccessError("Accès réservé à l'administration pixleh.", 403);
  }
  return session;
}

export class AccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

/**
 * Vérifie qu'une requête (dashboard studio OU client de galerie) peut accéder
 * à une galerie donnée. Renvoie le type d'accès pour adapter la réponse.
 */
export async function checkGalleryAccess(
  gallery: Gallery
): Promise<{ granted: boolean; asStudio: boolean; clientRef?: string }> {
  const studioSession = await getStudioSession();
  if (studioSession && studioSession.user.studioId === gallery.studioId) {
    return { granted: true, asStudio: true };
  }

  if (gallery.expiresAt && gallery.expiresAt < new Date()) {
    return { granted: false, asStudio: false };
  }

  if (!gallery.password) {
    // Limite connue : sans mot de passe, tous les visiteurs anonymes partagent le même
    // "clientRef", donc les favoris sont mutualisés plutôt qu'individuels sur ces galeries.
    // Pour un suivi par visiteur même sans mot de passe, il faudrait poser un cookie dès la
    // première visite via une Server Action ou un appel à /api/gallery-access sans condition
    // de mot de passe (actuellement cette route n'est appelée que lorsqu'un mot de passe existe).
    return { granted: true, asStudio: false, clientRef: "anonymous" };
  }

  const gallerySession = getGallerySession(gallery.slug);
  if (gallerySession && gallerySession.galleryId === gallery.id) {
    return { granted: true, asStudio: false, clientRef: gallerySession.clientRef };
  }

  return { granted: false, asStudio: false };
}

/**
 * Équivalent de checkGalleryAccess pour le lien invité (/invite/[guestSlug]) : jamais de
 * mot de passe ici, l'accès repose uniquement sur l'email capturé via /api/guest-access
 * (voir GalleryGuest). Le studio garde un accès direct comme sur le lien client.
 */
export async function checkGuestAccess(
  gallery: Gallery
): Promise<{ granted: boolean; asStudio: boolean; clientRef?: string }> {
  const studioSession = await getStudioSession();
  if (studioSession && studioSession.user.studioId === gallery.studioId) {
    return { granted: true, asStudio: true };
  }
  if (gallery.expiresAt && gallery.expiresAt < new Date()) {
    return { granted: false, asStudio: false };
  }
  if (!gallery.guestSlug) return { granted: false, asStudio: false };

  const gallerySession = getGallerySession(gallery.guestSlug);
  if (gallerySession && gallerySession.galleryId === gallery.id) {
    return { granted: true, asStudio: false, clientRef: gallerySession.clientRef };
  }
  return { granted: false, asStudio: false };
}

/**
 * Vérifie l'accès à une galerie pour un visiteur qui peut être CLIENT (lien + mot de passe)
 * OU INVITÉ (lien + email) — combine checkGalleryAccess et checkGuestAccess, qui s'ignorent
 * mutuellement (chacun ne connaît que son propre cookie de session). Sans ce OR, un invité
 * qui a bien passé le gate email sur une galerie protégée par mot de passe se voit refuser
 * l'accès à toute action de galerie (favoris, téléchargement...), puisque checkGalleryAccess
 * exige alors le cookie CLIENT, que l'invité n'a jamais.
 *
 * `isGuest` permet à l'appelant d'appliquer un réglage spécifique aux invités si besoin
 * (ex: `gallery.allowGuestDownload` plutôt que `gallery.allowDownload`).
 */
export async function checkGalleryOrGuestAccess(
  gallery: Gallery
): Promise<{ granted: boolean; asStudio: boolean; isGuest: boolean; clientRef?: string }> {
  const access = await checkGalleryAccess(gallery);
  if (access.granted) {
    return { ...access, isGuest: false };
  }
  const guestAccess = await checkGuestAccess(gallery);
  if (guestAccess.granted) {
    return { ...guestAccess, isGuest: true };
  }
  return { granted: false, asStudio: false, isGuest: false };
}

export async function getGalleryOr404(slugOrId: string) {
  const gallery = await prisma.gallery.findFirst({
    where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
  });
  if (!gallery) throw new AccessError("Galerie introuvable", 404);
  return gallery;
}

/** Convertit une erreur (AccessError ou inconnue) en réponse JSON standard pour les routes API. */
export function handleApiError(e: unknown) {
  if (e instanceof AccessError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
