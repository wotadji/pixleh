import { NextResponse } from "next/server";
import { getStorage, buildCarouselSlideKey } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sert l'image de fond d'une slide de carrousel, sans contrôle d'accès galerie (comme
 * /api/studio-logo) : c'est un élément public du site vitrine du studio. L'URL contient
 * déjà un `?v=` posé à l'upload (voir /api/settings/carousel-image/[slideId]) pour le
 * cache-busting, donc un cache long "immutable" est sûr ici.
 */
export async function GET(
  _req: Request,
  { params }: { params: { studioId: string; slideId: string } }
) {
  try {
    const buffer = await getStorage().get(buildCarouselSlideKey(params.studioId, params.slideId));
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image introuvable" }, { status: 404 });
  }
}
