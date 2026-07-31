/**
 * Validation d'un fichier photo (type + taille) — factorisé depuis
 * POST /api/galleries/[id]/photos pour être réutilisé par la route de remplacement
 * (PUT /api/galleries/[id]/photos/[photoId]/replace, voir demande d'Adriel 31/07/2026 :
 * "un bouton upload qui donne la possibilité de changer la photo" une fois la remarque
 * client traitée) sans dupliquer les constantes et le risque qu'elles divergent.
 */

// Types MIME acceptés pour un original de photo — au-delà de ça (exécutables, HTML,
// archives...) le fichier est refusé. `file.type` est parfois vide selon le navigateur
// (notamment pour le HEIC) : on retombe alors sur l'extension du nom de fichier.
export const ALLOWED_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
]);
export const ALLOWED_PHOTO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "tif", "tiff"]);
// 100 Mo : large pour un JPEG/HEIC issu d'un boîtier grand public, suffisant pour un TIFF
// exporté en haute résolution, sans laisser un envoi illimité saturer le stockage.
export const MAX_PHOTO_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export function rejectPhotoReason(file: File): string | null {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  const mimeOk = file.type ? ALLOWED_PHOTO_MIME_TYPES.has(file.type) : ALLOWED_PHOTO_EXTENSIONS.has(ext);
  if (!mimeOk) return "unsupportedType";
  if (file.size > MAX_PHOTO_FILE_SIZE_BYTES) return "tooLarge";
  return null;
}
