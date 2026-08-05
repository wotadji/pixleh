import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, handleApiError } from "@/lib/access";

/**
 * Vue transverse à tous les studios des invités (GalleryGuest) — demande d'Adriel le
 * 05/08/2026 : "panel admin avoir la liste des invités du projet et la possibilité de
 * filtrer par studio, date". Le filtre studio se fait ici via `studioId` (comme
 * /api/admin/orders) plutôt que côté client : évite de renvoyer TOUS les invités de TOUS
 * les studios à chaque changement de filtre. Le filtre date (dateFrom/dateTo, bornes
 * incluses) et la recherche par email restent en revanche côté client (voir /admin/guests) :
 * volumes attendus bien plus faibles qu'un historique de commandes, pas besoin d'aller-retour
 * serveur à chaque frappe.
 */
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
    const { searchParams } = new URL(req.url);
    const studioId = searchParams.get("studioId");

    const guests = await prisma.galleryGuest.findMany({
      where: studioId ? { gallery: { studioId } } : undefined,
      include: {
        gallery: { select: { id: true, title: true, slug: true, studioId: true, studio: { select: { name: true } } } },
      },
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
        studioId: g.gallery.studioId,
        studioName: g.gallery.studio.name,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
