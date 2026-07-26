import { NextResponse } from "next/server";
import sharp from "sharp";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getStorage, buildMarketingBlockImageKey } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Upload de l'image d'un bloc (multipart/form-data, champ "file"). Le cadrage (position +
 * zoom) est déjà choisi côté client par ImageCropModal avant l'envoi — le fichier reçu ici a
 * donc déjà le bon ratio pour son emplacement (16:9 pour le hero, portrait/carré pour le
 * texte enrichi). On se contente donc de plafonner la taille et de compresser, SANS forcer
 * de recadrage/ratio ici (pas de `fit: "cover"`), pour ne pas écraser le choix de cadrage
 * de l'admin.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const block = await prisma.marketingBlock.findUnique({ where: { id: params.id } });
    if (!block) throw new AccessError("Bloc introuvable.", 404);

    const slot = new URL(req.url).searchParams.get("slot") || "main";

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      throw new AccessError("Aucun fichier reçu", 400);
    }

    const buffer = Buffer.from(await (file as File).arrayBuffer());
    const resized = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();

    const key = buildMarketingBlockImageKey(params.id, slot);
    await getStorage().put(key, resized);

    const imageUrl = `/api/marketing-blocks/${params.id}/image?slot=${encodeURIComponent(slot)}&v=${Date.now()}`;
    return NextResponse.json({ imageUrl });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const slot = new URL(req.url).searchParams.get("slot") || "main";
    await getStorage().delete(buildMarketingBlockImageKey(params.id, slot)).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
