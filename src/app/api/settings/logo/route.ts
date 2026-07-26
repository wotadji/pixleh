import { NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage, buildStudioLogoKey } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Upload du logo / photo de profil du studio (multipart/form-data, champ "file"),
 * affiché comme avatar sur les galeries publiques (voir StudioAvatar dans
 * GalleryView.tsx) et pourra l'être ailleurs (site public, dashboard). Toujours
 * recadré en carré et converti en JPEG : pas besoin d'une résolution HD pour un avatar.
 *
 * `logoUrl` stocke directement l'URL servable, avec un paramètre `?v=` basé sur l'heure
 * de l'upload — chaque nouvel upload change donc l'URL, ce qui invalide le cache
 * navigateur automatiquement sans que les composants qui affichent `logoUrl` (déjà
 * nombreux) n'aient besoin d'être modifiés pour gérer un cache-busting séparé.
 */
export async function POST(req: Request) {
  try {
    const session = await requireStudioSession();
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      throw new AccessError("Aucun fichier reçu", 400);
    }

    const buffer = Buffer.from(await (file as File).arrayBuffer());
    const resized = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: 400, height: 400, fit: "cover" })
      .jpeg({ quality: 88 })
      .toBuffer();

    const key = buildStudioLogoKey(session.user.studioId);
    await getStorage().put(key, resized);

    const logoUrl = `/api/studio-logo/${session.user.studioId}?v=${Date.now()}`;
    const studio = await prisma.studio.update({
      where: { id: session.user.studioId },
      data: { logoUrl },
    });

    return NextResponse.json({ logoUrl: studio.logoUrl });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Retire le logo du studio (repli sur l'initiale du nom dans StudioAvatar). */
export async function DELETE() {
  try {
    const session = await requireStudioSession();
    await getStorage()
      .delete(buildStudioLogoKey(session.user.studioId))
      .catch(() => null);
    await prisma.studio.update({
      where: { id: session.user.studioId },
      data: { logoUrl: null },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
