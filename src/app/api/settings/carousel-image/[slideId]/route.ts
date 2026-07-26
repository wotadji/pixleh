import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";
import { getStorage, buildCarouselSlideKey } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Upload de l'image de fond d'une slide de carrousel (multipart/form-data, champ "file").
 * `slideId` est généré côté client (voir Réglages > Carrousel) : ce endpoint ne gère que
 * le fichier lui-même, le tableau `carouselSlides` (texte + ordre + URL) est enregistré
 * séparément via PATCH /api/settings — c'est ce dernier qui fait foi pour savoir quelles
 * slides existent réellement.
 */
export async function POST(req: Request, { params }: { params: { slideId: string } }) {
  try {
    const session = await requireStudioSession();
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      throw new AccessError("Aucun fichier reçu", 400);
    }

    const buffer = Buffer.from(await (file as File).arrayBuffer());
    // Bannière large plutôt que carrée : on limite juste la largeur/hauteur max, sans
    // forcer de recadrage, pour laisser le photographe choisir une image déjà cadrée
    // comme il le souhaite.
    const resized = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: 1920, height: 900, fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();

    const key = buildCarouselSlideKey(session.user.studioId, params.slideId);
    await getStorage().put(key, resized);

    const imageUrl = `/api/studio-carousel/${session.user.studioId}/${params.slideId}?v=${Date.now()}`;
    return NextResponse.json({ imageUrl });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { slideId: string } }) {
  try {
    const session = await requireStudioSession();
    await getStorage()
      .delete(buildCarouselSlideKey(session.user.studioId, params.slideId))
      .catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
