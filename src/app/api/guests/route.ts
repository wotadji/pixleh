import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, handleApiError } from "@/lib/access";

/**
 * Liste des invités (GalleryGuest) de toutes les galeries du studio connecté — demande
 * d'Adriel le 05/08/2026 : "voir la liste des emails des invités d'un studio" dans le panel
 * studio. Équivalent studio-scopé de GET /api/admin/guests (vue transverse admin plateforme).
 */
export async function GET() {
  try {
    const session = await requireStudioSession();
    const guests = await prisma.galleryGuest.findMany({
      where: { gallery: { studioId: session.user.studioId } },
      include: { gallery: { select: { id: true, title: true, slug: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      guests: guests.map((g) => ({
        id: g.id,
        email: g.email,
        status: g.status,
        marketingOptIn: g.marketingOptIn,
        createdAt: g.createdAt,
        galleryId: g.gallery.id,
        galleryTitle: g.gallery.title,
        gallerySlug: g.gallery.slug,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
