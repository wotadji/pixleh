import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { assertStorageQuota } from "@/lib/quotas";
import { getStorage, buildVideoKey } from "@/lib/storage";

export const runtime = "nodejs";
// Les fichiers vidéo sont nettement plus lourds qu'une photo (dizaines à centaines de Mo) :
// on laisse plus de marge que pour l'upload photo (60s) pour le temps de transfert vers le
// stockage SFTP.
export const maxDuration = 300;
// 2 Go : large pour un montage highlight/teaser (usage principal de cette fonctionnalité),
// sans laisser un studio saturer le stockage avec un fichier illimité. Le fichier est
// entièrement chargé en mémoire (voir Buffer.from ci-dessous), donc cette limite protège
// aussi le serveur d'un pic mémoire.
const MAX_VIDEO_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Upload direct d'un fichier vidéo (multipart/form-data, champ "file") — mode
 * auto-hébergé du modèle Video (voir schema.prisma), qui permet ensuite au client de
 * télécharger la vidéo comme une photo (voir /api/galleries/[id]/videos/[videoId]/file).
 * Contrairement aux photos, pas de traitement (pas de redimensionnement/miniature vidéo
 * en v1) : le fichier est stocké tel quel et servi tel quel.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const formData = await req.formData();
    const file = formData.get("file");
    if (typeof file === "string" || !file) {
      return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }
    const titleInput = (formData.get("title") as string | null) || "";

    if (!file.type.startsWith("video/")) {
      return NextResponse.json({ error: "Le fichier doit être une vidéo." }, { status: 400 });
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      return NextResponse.json({ error: "Le fichier dépasse la taille maximale autorisée (2 Go)." }, { status: 400 });
    }

    // [S2] Tâche #127 — quota de stockage du plan (voir src/lib/quotas.ts, s'applique à
    // tous les forfaits, pas seulement au gratuit).
    await assertStorageQuota(gallery.studioId, file.size);

    const videoId = randomUUID();
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (path.extname(file.name).replace(".", "") || file.type.split("/")[1] || "mp4").toLowerCase();
    const storageKey = buildVideoKey(gallery.studioId, gallery.id, videoId, ext);

    const storage = getStorage();
    await storage.put(storageKey, buffer);

    const last = await prisma.video.findFirst({
      where: { galleryId: gallery.id },
      orderBy: { position: "desc" },
    });

    const title = titleInput.trim() || file.name.replace(/\.[^.]+$/, "") || "Vidéo";

    const video = await prisma.video.create({
      data: {
        id: videoId,
        galleryId: gallery.id,
        title,
        position: (last?.position ?? -1) + 1,
        storageKey,
        filename: file.name,
        mimeType: file.type || null,
        sizeBytes: buffer.length,
      },
    });

    return NextResponse.json({ video }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
