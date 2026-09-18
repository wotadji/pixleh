/**
 * Validation d'un fichier envoyé via le bouton "Fichiers" (voir modèle GalleryRawFile) —
 * demande d'Adriel le 18/09/2026 : "un boutton fichiers pour permettre d'ajouter les images
 * des formats traditionnel et aussi des fichier raw". Accepte donc DEUX catégories :
 * - les formats traditionnels déjà acceptés par l'upload photo classique (voir
 *   ALLOWED_PHOTO_EXTENSIONS dans photoUpload.ts) — un studio peut vouloir sauvegarder un
 *   JPEG "original" ici aussi, sans passer par le traitement thumb/preview de Photo ;
 * - les formats RAW propriétaires de la plupart des appareils photo du marché.
 *
 * Contrairement à l'upload photo, la détection ne peut PAS se fier à `file.type` pour les
 * formats RAW : les navigateurs ne connaissent presque jamais leur type MIME (retournent une
 * chaîne vide ou "application/octet-stream"), donc seule l'extension du nom de fichier fait
 * foi ici.
 */

export const ALLOWED_RAW_EXTENSIONS = new Set([
  // Formats traditionnels (voir photoUpload.ts) — un studio peut aussi y déposer un JPEG/PNG
  // "original" sans passer par le traitement thumb/preview de l'upload photo classique.
  "jpg", "jpeg", "png", "webp", "heic", "heif", "tif", "tiff",
  // RAW génériques / Adobe
  "dng",
  // Canon
  "cr2", "cr3", "crw",
  // Nikon
  "nef", "nrw",
  // Sony
  "arw", "srf", "sr2",
  // Fujifilm
  "raf",
  // Olympus / OM System
  "orf",
  // Panasonic / Leica
  "rw2", "rwl",
  // Pentax
  "pef", "ptx",
  // Hasselblad
  "3fr", "fff",
  // Phase One
  "iiq",
  // Sigma
  "x3f",
  // Samsung
  "srw",
  // Epson
  "erf",
  // Kodak
  "dcr", "kdc",
  // Mamiya / Leaf
  "mef", "mos",
]);

// 300 Mo : un RAW moyen format (Hasselblad/Phase One notamment) peut largement dépasser un
// RAW plein format classique (25-80 Mo) — généreux mais pas illimité, le quota de stockage
// du studio (voir src/lib/quotas.ts) reste le vrai garde-fou global.
export const MAX_RAW_FILE_SIZE_BYTES = 300 * 1024 * 1024;

export function rejectRawFileReason(file: File): string | null {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!ALLOWED_RAW_EXTENSIONS.has(ext)) return "unsupportedType";
  if (file.size > MAX_RAW_FILE_SIZE_BYTES) return "tooLarge";
  return null;
}
