import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { sendGalleryReadyEmail } from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * Bouton "Partager au client" (à côté d'Aperçu dans GalleryManager) — envoie manuellement le
 * même email que "galerie prête" (lien + code d'accès), à la demande du studio plutôt que
 * uniquement à la première transition DRAFT/ARCHIVED → PUBLISHED (voir PATCH ci-dessus).
 * Utile par exemple si le studio veut renvoyer le lien après avoir régénéré le code, ou si le
 * client a égaré le premier email. Nécessite un Client rattaché avec une adresse email — sans
 * quoi il n'y a personne à qui envoyer.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
      include: { client: true },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);
    if (!gallery.client?.email) {
      throw new AccessError("Aucun client avec une adresse email n'est rattaché à cette galerie", 400);
    }

    const studio = await prisma.studio.findUnique({
      where: { id: session.user.studioId },
      include: { settings: true },
    });
    if (!studio) throw new AccessError("Studio introuvable", 404);

    const result = await sendGalleryReadyEmail({
      clientName: gallery.client.name,
      clientEmail: gallery.client.email,
      galleryTitle: gallery.title,
      gallerySlug: gallery.slug,
      galleryPassword: gallery.password,
      studio: { name: studio.name, slug: studio.slug, logoUrl: studio.logoUrl, brandColor: studio.brandColor },
      settings: studio.settings
        ? { contactEmail: studio.settings.contactEmail, contactPhone: studio.settings.contactPhone }
        : null,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Échec de l'envoi de l'email." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, clientEmail: gallery.client.email });
  } catch (e) {
    return handleApiError(e);
  }
}
