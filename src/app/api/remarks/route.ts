import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkGalleryAccess, handleApiError } from "@/lib/access";

export const runtime = "nodejs";

/**
 * Crée OU met à jour la remarque de retouche laissée par le CLIENT sur une photo (icône
 * dédiée dans la grille, voir GalleryView.tsx) — jamais accessible depuis le lien invité
 * (pas d'icône côté /invite/[guestSlug]). L'auteur est identifié via la session de galerie
 * (cookie posé par /api/gallery-access), comme pour les favoris/sélection impression.
 *
 * Une seule remarque par (photo, visiteur) : si le client rouvre l'icône déjà envoyée pour
 * modifier son texte, on met à jour la remarque existante plutôt que d'en empiler une
 * nouvelle — et on la repasse en "non traitée", puisque c'est une nouvelle demande que le
 * photographe n'a pas encore vue.
 */
export async function POST(req: Request) {
  try {
    const { gallerySlug, photoId, message } = await req.json();
    if (!gallerySlug || !photoId || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
    }

    const gallery = await prisma.gallery.findUnique({ where: { slug: gallerySlug } });
    if (!gallery) return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });

    const access = await checkGalleryAccess(gallery);
    if (!access.granted) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const photo = await prisma.photo.findFirst({ where: { id: photoId, galleryId: gallery.id } });
    if (!photo) return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });

    const clientRef = access.asStudio ? "studio" : access.clientRef || "anonymous";
    const trimmedMessage = message.trim().slice(0, 2000);

    const existing = await prisma.photoRemark.findFirst({
      where: { photoId: photo.id, galleryId: gallery.id, clientRef },
    });

    const remark = existing
      ? await prisma.photoRemark.update({
          where: { id: existing.id },
          // Éditer son message repasse la remarque "en attente" ET "non vue" : le
          // photographe doit la revoir, et le client doit revoir sa future résolution (icône
          // jaune à nouveau, même si l'ancienne version avait déjà été marquée traitée/vue).
          data: { message: trimmedMessage, resolved: false, seenByClient: false },
        })
      : await prisma.photoRemark.create({
          data: { photoId: photo.id, galleryId: gallery.id, clientRef, message: trimmedMessage },
        });

    return NextResponse.json({ remark }, { status: existing ? 200 : 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * Remarques du visiteur courant pour cette galerie (texte + statut), pour afficher/éditer
 * l'icône déjà envoyée sur chaque vignette côté galerie en ligne (lien client) — voir
 * GalleryView.tsx. Scopée au `clientRef` du visiteur : un client ne voit et ne peut
 * modifier que ses propres remarques, jamais celles laissées par un autre visiteur.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const gallerySlug = searchParams.get("gallerySlug");
    if (!gallerySlug) return NextResponse.json({ error: "Paramètre manquant" }, { status: 400 });

    const gallery = await prisma.gallery.findUnique({ where: { slug: gallerySlug } });
    if (!gallery) return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });

    const access = await checkGalleryAccess(gallery);
    if (!access.granted) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const clientRef = access.asStudio ? "studio" : access.clientRef || "anonymous";

    const remarks = await prisma.photoRemark.findMany({
      where: { galleryId: gallery.id, clientRef },
      select: { id: true, photoId: true, message: true, resolved: true, seenByClient: true },
    });

    return NextResponse.json({ remarks });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * Marque la remarque traitée d'une photo comme "vue" par le client (icône verte qui
 * disparaît définitivement une fois zoomée, voir acknowledgeRemark dans GalleryView.tsx) —
 * persisté en base pour survivre à un rechargement de page, contrairement à un simple état
 * local côté navigateur. N'a d'effet que sur une remarque déjà "resolved" : une remarque en
 * attente reste mise en avant quoi qu'il arrive.
 */
export async function PATCH(req: Request) {
  try {
    const { gallerySlug, photoId } = await req.json();
    if (!gallerySlug || !photoId) {
      return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
    }

    const gallery = await prisma.gallery.findUnique({ where: { slug: gallerySlug } });
    if (!gallery) return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });

    const access = await checkGalleryAccess(gallery);
    if (!access.granted) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const clientRef = access.asStudio ? "studio" : access.clientRef || "anonymous";

    const remark = await prisma.photoRemark.findFirst({
      where: { photoId, galleryId: gallery.id, clientRef, resolved: true },
    });
    if (!remark) return NextResponse.json({ ok: true });

    const updated = await prisma.photoRemark.update({
      where: { id: remark.id },
      data: { seenByClient: true },
    });

    return NextResponse.json({ remark: updated });
  } catch (e) {
    return handleApiError(e);
  }
}
