import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { sanitizeVisibility } from "@/lib/setVisibility";

/** Liste des sets (collections) d'une galerie. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const collections = await prisma.collection.findMany({
      where: { galleryId: gallery.id },
      orderBy: { position: "asc" },
      include: { _count: { select: { photos: true } } },
    });
    return NextResponse.json({ collections });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Crée un nouveau set dans la galerie. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const body = await req.json();
    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json({ error: "Titre du set requis" }, { status: 400 });
    }
    const visibility = sanitizeVisibility(body.visibility);

    const last = await prisma.collection.findFirst({
      where: { galleryId: gallery.id },
      orderBy: { position: "desc" },
    });

    const collection = await prisma.collection.create({
      data: {
        galleryId: gallery.id,
        title: body.title,
        position: (last?.position ?? -1) + 1,
        ...(visibility && { visibility }),
      },
    });

    return NextResponse.json({ collection }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
