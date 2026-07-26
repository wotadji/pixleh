import { NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough, Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { checkGalleryOrGuestAccess } from "@/lib/access";
import { getStorage } from "@/lib/storage";
import { applyWatermarkIfNeeded, resolveWatermarkText } from "@/lib/image";
import { photoDisplayFilename } from "@/lib/photoNaming";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Télécharge toute la galerie (ou une sélection de photoIds, voir `ids`) sous forme de ZIP.
 * Désactivé si un quota de téléchargement (downloadLimit) est défini sur la galerie,
 * pour éviter de contourner la limite en un seul clic — dans ce cas les clients
 * téléchargent photo par photo via /photos/[photoId]/download.
 *
 * `size` (voir DownloadPanel côté GalleryView) : "hd" (défaut) sert l'original tel
 * qu'uploadé ; "web" sert la variante `previewKey` déjà générée à l'upload (2000px de
 * large, JPEG qualité 85 — la même utilisée pour l'affichage web) plutôt que de
 * redimensionner à la volée, ce qui rend un ZIP nettement plus léger sans travail
 * supplémentaire côté serveur.
 *
 * Même règle de filigrane que les autres routes : appliqué à la volée si
 * gallery.showWatermark est activé, sinon fichiers tels quels.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const gallery = await prisma.gallery.findUnique({
    where: { id: params.id },
    include: { studio: { include: { settings: true } } },
  });
  if (!gallery) return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });

  const access = await checkGalleryOrGuestAccess(gallery);
  if (!access.granted) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Réglage distinct pour les invités (gallery.allowGuestDownload), voir la route de
  // téléchargement photo par photo pour la même logique. Le studio n'est JAMAIS bloqué par
  // ce réglage — pensé pour les visiteurs, pas pour le photographe qui doit toujours
  // pouvoir récupérer ses propres photos (ex: préparer une commande d'impression).
  const downloadAllowed = access.asStudio ? true : access.isGuest ? gallery.allowGuestDownload : gallery.allowDownload;
  if (!downloadAllowed) {
    return NextResponse.json({ error: "Téléchargement désactivé" }, { status: 403 });
  }
  if (!access.asStudio && gallery.downloadLimit) {
    return NextResponse.json(
      { error: "Le téléchargement groupé est désactivé sur cette galerie (quota limité)." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("ids");
  const photoIds = idsParam ? idsParam.split(",") : null;
  const wantsWeb = searchParams.get("size") === "web";

  // Toutes les photos, triées comme à l'affichage : sert de référence pour numéroter
  // (voir photoDisplayFilename) même quand on ne zippe qu'une sélection (`ids`), pour que
  // le numéro d'une photo reste le même partout (visionneuse, téléchargement seul, ZIP).
  const allPhotos = await prisma.photo.findMany({
    where: { galleryId: gallery.id },
    orderBy: { position: "asc" },
  });
  if (allPhotos.length === 0) {
    return NextResponse.json({ error: "Aucune photo à télécharger" }, { status: 404 });
  }
  const photos = photoIds ? allPhotos.filter((p) => photoIds.includes(p.id)) : allPhotos;
  if (photos.length === 0) {
    return NextResponse.json({ error: "Aucune photo à télécharger" }, { status: 404 });
  }

  const watermarkText = resolveWatermarkText(gallery.showWatermark, gallery.studio);

  const storage = getStorage();
  const archive = archiver("zip", { zlib: { level: 6 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  (async () => {
    for (const photo of photos) {
      try {
        const key = wantsWeb && photo.previewKey ? photo.previewKey : photo.storageKey;
        const buffer = await storage.get(key);
        const finalBuffer = await applyWatermarkIfNeeded(buffer, watermarkText);
        const idx = allPhotos.findIndex((p) => p.id === photo.id);
        const displayName = photoDisplayFilename(gallery.title, Math.max(idx, 0), allPhotos.length, photo.filename);
        archive.append(finalBuffer, { name: displayName });
      } catch {
        // fichier manquant sur le storage : on l'ignore et on continue le zip
      }
    }
    await archive.finalize();
  })();

  if (!access.asStudio) {
    await prisma.downloadEvent.create({
      data: {
        galleryId: gallery.id,
        clientRef: access.clientRef || "anonymous",
        type: "zip",
      },
    });
  }

  return new NextResponse(Readable.toWeb(passthrough) as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${gallery.slug}.zip"`,
    },
  });
}
