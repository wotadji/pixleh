import sharp from "sharp";
import { getStorage, buildPhotoKey } from "@/lib/storage";

export interface ProcessedPhoto {
  storageKey: string;
  thumbKey: string;
  previewKey: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * À partir d'un fichier uploadé, génère :
 *  - l'original (conservé tel quel, pour téléchargement HD / impression)
 *  - une miniature (grille de galerie, ~500px)
 *  - un aperçu web (~2000px)
 * Les trois variantes sont TOUJOURS stockées sans filigrane. Le filigrane n'est plus
 * "gravé" dans les fichiers : il est composité à la volée au moment de servir l'image
 * (voir applyWatermarkIfNeeded, utilisé par /api/files et les routes de téléchargement),
 * selon la valeur actuelle du réglage de la galerie. Ça évite tout décalage entre l'état
 * du réglage et ce qui est affiché/téléchargé, quel que soit le moment où on l'active ou
 * le désactive — plus besoin de régénérer quoi que ce soit.
 */
export async function processAndStoreUpload(params: {
  buffer: Buffer;
  studioId: string;
  galleryId: string;
  photoId: string;
  originalFilename: string;
}): Promise<ProcessedPhoto> {
  const { buffer, studioId, galleryId, photoId } = params;
  const storage = getStorage();

  const image = sharp(buffer, { failOn: "none" }).rotate(); // auto-orient via EXIF
  const metadata = await image.metadata();
  const ext = (metadata.format || "jpeg").replace("jpeg", "jpg");

  const originalKey = buildPhotoKey(studioId, galleryId, photoId, "original", ext);
  await storage.put(originalKey, buffer);

  const thumbBuffer = await buildThumbBuffer(image);
  const thumbKey = buildPhotoKey(studioId, galleryId, photoId, "thumb", "jpg");
  await storage.put(thumbKey, thumbBuffer);

  const previewBuffer = await image.clone().resize({ width: 2000, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const previewKey = buildPhotoKey(studioId, galleryId, photoId, "preview", "jpg");
  await storage.put(previewKey, previewBuffer);

  return {
    storageKey: originalKey,
    thumbKey,
    previewKey,
    width: metadata.width || 0,
    height: metadata.height || 0,
    sizeBytes: buffer.byteLength,
  };
}

/**
 * La miniature garde le ratio NATUREL de la photo (portrait, paysage, carré...) — elle
 * n'est plus recadrée ni complétée par des bandes : seule la largeur est plafonnée à
 * 700px (hauteur libre). C'est ce qui permet à la grille "mosaïque" (masonry, voir
 * masonryColumnCount dans galleryDesign.ts) d'afficher chaque photo dans ses vraies
 * proportions, comme sur Pixieset : les portraits restent hauts, les paysages restent
 * larges, sans jamais couper un visage.
 *
 * Pour le style de grille "horizontal" (cases carrées uniformes), le recadrage se fait
 * côté navigateur via `object-cover` sur l'élément <img> — dynamique, donc sans dupliquer
 * de fichier, au prix de perdre le recadrage "intelligent" (centré sur le sujet) qu'on
 * pouvait faire côté serveur sur un fichier pré-carré.
 */
async function buildThumbBuffer(image: sharp.Sharp): Promise<Buffer> {
  return image
    .clone()
    .resize({
      width: 700,
      withoutEnlargement: true,
      fit: "inside",
    })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/**
 * Régénère uniquement la miniature d'une photo déjà uploadée, à partir de son fichier
 * original sur le storage. Utile pour appliquer un changement de rendu de miniature
 * (ex: couleur de fond du letterboxing) sans avoir à ré-uploader les photos existantes.
 */
export async function regenerateThumbnail(params: {
  originalBuffer: Buffer;
  studioId: string;
  galleryId: string;
  photoId: string;
}): Promise<{ thumbKey: string }> {
  const { originalBuffer, studioId, galleryId, photoId } = params;
  const storage = getStorage();
  const image = sharp(originalBuffer, { failOn: "none" }).rotate();
  const thumbBuffer = await buildThumbBuffer(image);
  const thumbKey = buildPhotoKey(studioId, galleryId, photoId, "thumb", "jpg");
  await storage.put(thumbKey, thumbBuffer);
  return { thumbKey };
}

/**
 * Régénère l'aperçu web (~2000px) d'une photo déjà uploadée, TOUJOURS sans filigrane
 * (le filigrane n'est plus jamais stocké, voir plus haut). Sert à "nettoyer" les aperçus
 * de photos uploadées avant ce changement, qui pouvaient avoir un filigrane gravé dedans
 * par l'ancien système.
 */
export async function regeneratePreview(params: {
  originalBuffer: Buffer;
  studioId: string;
  galleryId: string;
  photoId: string;
}): Promise<{ previewKey: string }> {
  const { originalBuffer, studioId, galleryId, photoId } = params;
  const storage = getStorage();
  const image = sharp(originalBuffer, { failOn: "none" }).rotate();
  const previewBuffer = await image.clone().resize({ width: 2000, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const previewKey = buildPhotoKey(studioId, galleryId, photoId, "preview", "jpg");
  await storage.put(previewKey, previewBuffer);
  return { previewKey };
}

/**
 * Applique (ou non) le filigrane à un buffer JPEG déjà généré, à la volée, au moment de
 * servir l'image (aperçu web ou téléchargement HD) — voir /api/files/[...path] et les
 * routes de téléchargement. `watermarkText` vaut `null`/vide quand le filigrane doit être
 * absent : dans ce cas le buffer est renvoyé tel quel, sans re-encodage.
 */
export async function applyWatermarkIfNeeded(buffer: Buffer, watermarkText?: string | null): Promise<Buffer> {
  if (!watermarkText) return buffer;
  const svgWatermark = buildWatermarkSvg(watermarkText);
  // Un motif (tile) plus petit que l'image, répété automatiquement par sharp : évite
  // l'erreur "Image to composite must have same dimensions or smaller" qui se produit
  // si le calque est plus grand que l'image de base (ex: photos très petites/étroites).
  return sharp(buffer, { failOn: "none" })
    .composite([{ input: svgWatermark, tile: true, gravity: "center" }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Petit motif carré (400x400) répété automatiquement par sharp (`tile: true`) sur toute l'image. */
function buildWatermarkSvg(text: string): Buffer {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `
    <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
      <style>
        .wm { fill: rgba(255,255,255,0.45); font-size: 22px; font-family: sans-serif; font-weight: 600; }
      </style>
      <g transform="rotate(-30 200 200)">
        <text x="-40" y="200" class="wm">${escaped}</text>
      </g>
    </svg>`;
  return Buffer.from(svg);
}

/**
 * Détermine si le filigrane doit être appliqué, et avec quel texte, pour une galerie
 * donnée. Source unique de vérité : le réglage de la galerie (`showWatermark`). Le
 * réglage studio ne fournit que le texte par défaut si aucun texte spécifique n'est
 * configuré — il ne bloque plus l'affichage (auparavant les deux réglages devaient être
 * activés simultanément, ce qui portait à confusion).
 */
export function resolveWatermarkText(
  showWatermark: boolean,
  studio: { name: string; settings?: { watermarkText?: string | null } | null }
): string | null {
  if (!showWatermark) return null;
  return studio.settings?.watermarkText || studio.name;
}
