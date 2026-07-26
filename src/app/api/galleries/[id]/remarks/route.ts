import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";

/** Liste des remarques laissées par le client sur les photos de cette galerie. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const gallery = await prisma.gallery.findFirst({
      where: { id: params.id, studioId: session.user.studioId },
    });
    if (!gallery) throw new AccessError("Galerie introuvable", 404);

    const remarks = await prisma.photoRemark.findMany({
      where: { galleryId: gallery.id },
      orderBy: { createdAt: "desc" },
      include: { photo: { select: { id: true, filename: true, updatedAt: true } } },
    });
    return NextResponse.json({ remarks });
  } catch (e) {
    return handleApiError(e);
  }
}
