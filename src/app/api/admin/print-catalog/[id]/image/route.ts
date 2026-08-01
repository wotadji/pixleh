import { NextResponse } from "next/server";
import sharp from "sharp";
import { requirePlatformAdmin, handleApiError, AccessError } from "@/lib/access";
import { getStorage, buildPrintCatalogImageKey } from "@/lib/storage";
import { getPrintCatalogItem, updatePrintCatalogItem } from "@/lib/printCatalog";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Upload de l'image d'un produit du catalogue impression plateforme (multipart/form-data,
 * champ "file") — demande d'Adriel (01/08/2026, en regardant le formulaire "Modifier le
 * produit") : "dans Image (URL) est il possible de passer par l'upload ?". Même patron que
 * /api/admin/marketing-blocks/[id]/image, mais met aussi à jour directement la colonne
 * `imageUrl` du produit (pas seulement le fichier stocké) : contrairement à un bloc
 * marketing dont l'URL n'est persistée qu'au clic sur "Enregistrer" du formulaire, ici
 * l'aperçu doit rester correct même si l'admin ferme la modale sans re-cliquer Enregistrer
 * juste après l'upload.
 *
 * Pas de recadrage (ImageCropModal) ici, volontairement : c'est une simple vignette carrée
 * de catalogue, pas une image éditoriale — `fit: "cover"` centre et recadre automatiquement.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const existing = await getPrintCatalogItem(params.id);
    if (!existing) throw new AccessError("Produit catalogue introuvable.", 404);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      throw new AccessError("Aucun fichier reçu", 400);
    }

    const buffer = Buffer.from(await (file as File).arrayBuffer());
    const resized = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: 800, height: 800, fit: "cover" })
      .jpeg({ quality: 88 })
      .toBuffer();

    const key = buildPrintCatalogImageKey(params.id);
    await getStorage().put(key, resized);

    const imageUrl = `/api/print-catalog/${params.id}/image?v=${Date.now()}`;
    await updatePrintCatalogItem(params.id, { imageUrl });

    return NextResponse.json({ imageUrl });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const existing = await getPrintCatalogItem(params.id);
    if (!existing) throw new AccessError("Produit catalogue introuvable.", 404);

    await getStorage().delete(buildPrintCatalogImageKey(params.id)).catch(() => null);
    await updatePrintCatalogItem(params.id, { imageUrl: null });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
