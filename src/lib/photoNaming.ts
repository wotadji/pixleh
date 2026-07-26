/**
 * Nom de fichier "convivial" affiché aux visiteurs (légende dans la visionneuse) et utilisé
 * pour les téléchargements (HD et ZIP), à la place du nom de fichier brut de l'appareil
 * photo (ex: "IMG_4821.jpg" ou "sample-photo-41.jpg") : "<Titre de la galerie>-<numéro>.ext".
 *
 * Le numéro reflète l'ordre d'upload (`Photo.position`, assigné séquentiellement à
 * l'upload — voir /api/galleries/[id]/photos), pas un identifiant aléatoire, et est
 * complété de zéros pour un tri alphabétique cohérent avec l'ordre réel (ex: "-003" avant
 * "-012"). L'extension d'origine est conservée (jpg, png...).
 */
export function photoDisplayFilename(
  galleryTitle: string,
  position: number,
  totalCount: number,
  originalFilename: string
): string {
  const dotIndex = originalFilename.lastIndexOf(".");
  const ext = dotIndex > -1 ? originalFilename.slice(dotIndex) : ".jpg";
  const digits = Math.max(2, String(Math.max(totalCount, 1)).length);
  const number = String(position + 1).padStart(digits, "0");
  const safeTitle = sanitizeForFilename(galleryTitle) || "photo";
  return `${safeTitle}-${number}${ext}`;
}

/** Retire les caractères interdits/à risque dans un nom de fichier, sans toucher aux espaces ou à la casse. */
function sanitizeForFilename(input: string): string {
  return input
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
