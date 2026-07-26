import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkGalleryAccess } from "@/lib/access";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diffusion d'une vidéo auto-hébergée (mode upload direct, voir modèle Video).
 * Deux usages :
 * - Lecture (`GET .../file`) : pas de vérification de `allowDownload`, exactement comme
 *   l'aperçu web d'une photo — c'est juste regarder, pas télécharger. Supporte les requêtes
 *   `Range` (indispensable pour que le lecteur <video> puisse avancer/reculer sans tout
 *   recharger).
 * - Téléchargement (`GET .../file?download=1`) : vérifie `gallery.allowDownload` et le
 *   quota `downloadLimit` comme pour une photo, journalise un DownloadEvent (sans photoId,
 *   voir schema.prisma) pour partager le même quota que les téléchargements photo.
 *
 * Réservé aux vidéos auto-hébergées (`storageKey` renseigné) — une vidéo externe
 * (Vimeo/YouTube) n'a pas de fichier à servir ici, le lecteur utilise directement l'embed.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string; videoId: string } }
) {
  const gallery = await prisma.gallery.findUnique({ where: { id: params.id } });
  if (!gallery) return NextResponse.json({ error: "Galerie introuvable" }, { status: 404 });

  const access = await checkGalleryAccess(gallery);
  if (!access.granted) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const video = await prisma.video.findFirst({
    where: { id: params.videoId, galleryId: gallery.id },
  });
  if (!video || !video.storageKey) {
    return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });
  }

  const url = new URL(req.url);
  const isDownload = url.searchParams.get("download") === "1";

  if (isDownload) {
    if (!gallery.allowDownload) {
      return NextResponse.json({ error: "Téléchargement désactivé pour cette galerie" }, { status: 403 });
    }
    if (!access.asStudio && gallery.downloadLimit) {
      const clientRef = access.clientRef || "anonymous";
      const count = await prisma.downloadEvent.count({ where: { galleryId: gallery.id, clientRef } });
      if (count >= gallery.downloadLimit) {
        return NextResponse.json(
          { error: `Limite de ${gallery.downloadLimit} téléchargements atteinte.` },
          { status: 403 }
        );
      }
    }
  }

  try {
    const storage = getStorage();
    const buffer = await storage.get(video.storageKey);
    const contentType = video.mimeType || "video/mp4";
    const filename = video.filename || `${video.title}.mp4`;

    const range = req.headers.get("range");
    const baseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=0",
    };
    if (isDownload) {
      baseHeaders["Content-Disposition"] = `attachment; filename="${encodeURIComponent(filename)}"`;
    }

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const total = buffer.length;
      let start = match?.[1] ? parseInt(match[1], 10) : 0;
      let end = match?.[2] ? parseInt(match[2], 10) : total - 1;
      if (Number.isNaN(start) || start < 0) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end) {
        return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
      }
      const chunk = buffer.subarray(start, end + 1);

      if (isDownload && !access.asStudio) {
        await prisma.downloadEvent.create({
          data: { galleryId: gallery.id, clientRef: access.clientRef || "anonymous", type: "single" },
        });
      }

      return new NextResponse(chunk, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(chunk.length),
        },
      });
    }

    if (isDownload && !access.asStudio) {
      await prisma.downloadEvent.create({
        data: { galleryId: gallery.id, clientRef: access.clientRef || "anonymous", type: "single" },
      });
    }

    return new NextResponse(buffer, {
      headers: { ...baseHeaders, "Content-Length": String(buffer.length) },
    });
  } catch {
    return NextResponse.json({ error: "Fichier indisponible" }, { status: 404 });
  }
}
