import { NextResponse } from "next/server";
import { getStorage, buildStudioLogoKey } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sert le logo/photo de profil d'un studio, SANS passer par le contrôle d'accès galerie
 * (voir /api/files) : c'est un élément de marque public, affiché même sur les galeries
 * protégées par mot de passe (avant saisie du mot de passe) et sur le site public du
 * studio. L'URL contient déjà un `?v=` posé à l'upload (voir /api/settings/logo) pour le
 * cache-busting, donc un cache long "immutable" est sûr ici.
 */
export async function GET(_req: Request, { params }: { params: { studioId: string } }) {
  try {
    const buffer = await getStorage().get(buildStudioLogoKey(params.studioId));
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Logo introuvable" }, { status: 404 });
  }
}
