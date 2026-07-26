import { describe, expect, it } from "vitest";
import {
  resolvePhotoSortKey,
  sortPhotos,
  formatFileSize,
  DEFAULT_PHOTO_SORT,
  type SortablePhoto,
} from "@/lib/photoSort";

const photos: SortablePhoto[] = [
  { filename: "b.jpg", createdAt: "2026-01-02T00:00:00.000Z", sizeBytes: 2000 },
  { filename: "a.jpg", createdAt: "2026-01-03T00:00:00.000Z", sizeBytes: 500 },
  { filename: "c.jpg", createdAt: "2026-01-01T00:00:00.000Z", sizeBytes: 3000 },
];

describe("resolvePhotoSortKey", () => {
  it("accepte une clé valide", () => {
    expect(resolvePhotoSortKey("nameAsc")).toBe("nameAsc");
  });

  it("retombe sur la valeur par défaut si la valeur est invalide ou absente (données legacy)", () => {
    expect(resolvePhotoSortKey("n'importe quoi")).toBe(DEFAULT_PHOTO_SORT);
    expect(resolvePhotoSortKey(undefined)).toBe(DEFAULT_PHOTO_SORT);
    expect(resolvePhotoSortKey(null)).toBe(DEFAULT_PHOTO_SORT);
  });
});

describe("sortPhotos", () => {
  it("ne modifie pas l'ordre en mode manuel (déjà trié côté requête Prisma)", () => {
    expect(sortPhotos(photos, "manual")).toBe(photos);
  });

  it("trie par date d'ajout décroissante", () => {
    expect(sortPhotos(photos, "dateAddedDesc").map((p) => p.filename)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("trie par date d'ajout croissante", () => {
    expect(sortPhotos(photos, "dateAddedAsc").map((p) => p.filename)).toEqual(["c.jpg", "b.jpg", "a.jpg"]);
  });

  it("trie par nom alphabétique", () => {
    expect(sortPhotos(photos, "nameAsc").map((p) => p.filename)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("trie par taille décroissante — utile pour repérer les gros fichiers avant un quota de stockage", () => {
    expect(sortPhotos(photos, "sizeDesc").map((p) => p.filename)).toEqual(["c.jpg", "b.jpg", "a.jpg"]);
  });

  it("ne modifie pas le tableau d'origine (immutabilité — l'appelant peut réutiliser la liste source)", () => {
    const copy = [...photos];
    sortPhotos(photos, "nameAsc");
    expect(photos).toEqual(copy);
  });
});

describe("formatFileSize", () => {
  it("affiche un tiret pour une taille nulle ou absente", () => {
    expect(formatFileSize(null)).toBe("—");
    expect(formatFileSize(0)).toBe("—");
  });

  it("affiche en Ko en dessous de 1 Mo", () => {
    expect(formatFileSize(500 * 1024)).toBe("500 Ko");
  });

  it("affiche en Mo avec une décimale au-dessus de 1 Mo", () => {
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 Mo");
  });
});
