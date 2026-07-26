import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { parseVideoUrl, fetchVideoOEmbed } from "@/lib/videoEmbed";

/** Liste des vidéos d'une galerie (onglet "Vidéo" du panel studio). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const videos = await prisma.video.findMany({
      where: { galleryId: gallery.id },
      orderBy: { position: "asc" },
    });
    return NextResponse.json({ videos });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * Ajoute une vidéo à la galerie à partir d'un lien Vimeo ou YouTube collé par le studio
 * (voir GalleryManager, onglet "Vidéo") — v1 : uniquement des liens externes, pas d'upload
 * direct (voir schema.prisma, modèle Video). Les métadonnées (titre par défaut, miniature,
 * durée) sont résolues côté serveur via l'oEmbed public du provider.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const body = await req.json();
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json({ error: "Lien vidéo requis" }, { status: 400 });
    }

    const parsed = parseVideoUrl(url);
    if (!parsed) {
      return NextResponse.json(
        { error: "Lien non reconnu — colle un lien Vimeo ou YouTube." },
        { status: 400 }
      );
    }

    const meta = await fetchVideoOEmbed(url, parsed.provider);
    const title = (typeof body.title === "string" && body.title.trim()) || meta.title || "Vidéo";

    const last = await prisma.video.findFirst({
      where: { galleryId: gallery.id },
      orderBy: { position: "desc" },
    });

    const video = await prisma.video.create({
      data: {
        galleryId: gallery.id,
        title,
        position: (last?.position ?? -1) + 1,
        provider: parsed.provider,
        externalUrl: url,
        externalId: parsed.externalId,
        thumbnailUrl: meta.thumbnailUrl,
        duration: meta.duration,
      },
    });

    return NextResponse.json({ video }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
