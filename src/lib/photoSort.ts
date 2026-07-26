/**
 * Ordre de tri des photos d'une galerie — partagé entre le panel studio
 * (GalleryManager, bouton "Trier par") et le rendu public (/g/[slug] et
 * /invite/[guestSlug]) pour que le tri choisi par le photographe soit bien
 * ce que voit le client, pas seulement un tri d'affichage local à l'admin.
 *
 * Persisté sur `Gallery.photoSortOrder` (String, voir prisma/schema.prisma).
 */
export const PHOTO_SORT_KEYS = [
  "manual",
  "dateAddedDesc",
  "dateAddedAsc",
  "nameAsc",
  "nameDesc",
  "sizeDesc",
  "sizeAsc",
] as const;

export type PhotoSortKey = (typeof PHOTO_SORT_KEYS)[number];

export const DEFAULT_PHOTO_SORT: PhotoSortKey = "manual";

/** Normalise une valeur venant de la base (ou d'une requête) vers une PhotoSortKey valide. */
export function resolvePhotoSortKey(value: unknown): PhotoSortKey {
  return typeof value === "string" && (PHOTO_SORT_KEYS as readonly string[]).includes(value)
    ? (value as PhotoSortKey)
    : DEFAULT_PHOTO_SORT;
}

/** Forme minimale requise pour trier un tableau de photos, quel que soit le DTO appelant. */
export interface SortablePhoto {
  filename: string;
  createdAt: string | Date;
  sizeBytes: number | null;
}

/**
 * Trie une liste de photos selon la clé donnée. `"manual"` renvoie le tableau tel quel
 * (l'ordre naturel est déjà `position asc` côté requête Prisma, aussi bien dans le panel
 * studio que sur la galerie publique) — pas de tri supplémentaire à appliquer.
 */
export function sortPhotos<T extends SortablePhoto>(photos: T[], sortKey: PhotoSortKey): T[] {
  if (sortKey === "manual") return photos;
  const sorted = [...photos];
  switch (sortKey) {
    case "dateAddedDesc":
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
    case "dateAddedAsc":
      sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      break;
    case "nameAsc":
      sorted.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: "base" }));
      break;
    case "nameDesc":
      sorted.sort((a, b) => b.filename.localeCompare(a.filename, undefined, { numeric: true, sensitivity: "base" }));
      break;
    case "sizeDesc":
      sorted.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
      break;
    case "sizeAsc":
      sorted.sort((a, b) => (a.sizeBytes ?? 0) - (b.sizeBytes ?? 0));
      break;
  }
  return sorted;
}

/** Formatte une taille de fichier en octets vers un affichage Ko/Mo lisible. */
export function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
