import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkGalleryOrGuestAccess } from "@/lib/access";
import { getStorage } from "@/lib/storage";
import { applyWatermarkIfNeeded, resolveWatermarkText } from "@/lib/image";
import { photoDisplayFilename } from "@/lib/photoNaming";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Téléchargement HD d'une photo, avec vérification du quota de téléchargements
 * défini sur la galerie (downloadLimit). Chaque téléchargement est journalisé
 * dans DownloadEvent pour permettre le décompte par visiteur.
 *
 * Le filigrane suit la même règle simple que l'affichage : si gallery.showWatermark
 * est activé, il est composité à la volée sur le fichier avant l'envoi ; sinon le
 * fichier original est envoyé tel quel.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string; photoId: string } }
) {
  const gallery = await prisma.gallery.findUnique({
    where: { id: params.id },
    include: { studio: { include: { settings: true } } },
  });
  if (!gallery) return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });

  const access = await checkGalleryOrGuestAccess(gallery);
  if (!access.granted) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Réglage distinct pour les invités (gallery.allowGuestDownload) : un studio peut
  // autoriser le téléchargement pour ses clients tout en le désactivant pour les invités
  // (ou l'inverse), voir GalleryManager > Réglages. Le studio n'est jamais bloqué par ce
  // réglage, qui ne vise que ses visiteurs.
  const downloadAllowed = access.asStudio ? true : access.isGuest ? gallery.allowGuestDownload : gallery.allowDownload;
  if (!downloadAllowed) {
    return NextResponse.json({ error: "Téléchargement désactivé pour cette galerie" }, { status: 403 });
  }

  const photo = await prisma.photo.findFirst({
    where: { id: params.photoId, galleryId: gallery.id },
  });
  if (!photo) return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });

  // Numéro séquentiel "propre" (sans trou même si des photos ont été supprimées entre-
  // temps) : position de cette photo parmi toutes celles de la galerie, triées comme à
  // l'affichage — voir photoDisplayFilename.
  const orderedIds = (
    await prisma.photo.findMany({
      where: { galleryId: gallery.id },
      orderBy: { position: "asc" },
      select: { id: true },
    })
  ).map((p) => p.id);
  const displayName = photoDisplayFilename(
    gallery.title,
    Math.max(orderedIds.indexOf(photo.id), 0),
    orderedIds.length,
    photo.filename
  );

  if (!access.asStudio && gallery.downloadLimit) {
    const clientRef = access.clientRef || "anonymous";
    const count = await prisma.downloadEvent.count({
      where: { galleryId: gallery.id, clientRef },
    });
    if (count >= gallery.downloadLimit) {
      return NextResponse.json(
        { error: `Limite de ${gallery.downloadLimit} téléchargements atteinte.` },
        { status: 403 }
      );
    }
  }

  try {
    const storage = getStorage();
    let buffer = await storage.get(photo.storageKey);

    const watermarkText = resolveWatermarkText(gallery.showWatermark, gallery.studio);
    buffer = await applyWatermarkIfNeeded(buffer, watermarkText);

    if (!access.asStudio) {
      await prisma.downloadEvent.create({
        data: {
          galleryId: gallery.id,
          photoId: photo.id,
          clientRef: access.clientRef || "anonymous",
          type: "single",
        },
      });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(displayName)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Fichier indisponible" }, { status: 404 });
  }
}
