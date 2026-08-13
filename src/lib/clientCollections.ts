import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { AccessError, checkGalleryAccess } from "@/lib/access";
import type { Gallery } from "@prisma/client";

/**
 * Accès bas niveau aux "collections privées" créées par le CLIENT lui-même dans une galerie
 * (voir les modèles ClientCollection/ClientCollectionPhoto dans schema.prisma pour le contexte
 * complet : rôle, confidentialité stricte vis-à-vis du studio, et limitation $queryRaw/
 * $executeRaw du sandbox tant qu'Adriel n'a pas relancé `prisma generate && prisma db push`).
 *
 * Toutes les fonctions ci-dessous prennent `clientRef` en paramètre et l'appliquent
 * systématiquement dans leur clause WHERE : aucune ne peut renvoyer ou modifier la collection
 * d'un AUTRE visiteur, même par erreur d'appel côté route API.
 */

export interface ClientCollectionSummary {
  id: string;
  title: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  photoCount: number;
  /** Première photo ajoutée (par ordre chronologique) — sert de couverture pour la carte. */
  coverPhotoId: string | null;
}

export interface ClientCollectionPhotoDTO {
  photoId: string;
  filename: string;
  width: number | null;
  height: number | null;
  updatedAt: Date;
  addedAt: Date;
}

/**
 * Vérifie qu'une requête sur /api/client/galleries/[gallerySlug]/collections/... provient bien
 * du CLIENT connecté à cette galerie (jamais le studio, jamais un invité — les collections
 * privées ne sont proposées ni à l'un ni à l'autre, voir la prop `enableClientCollections` de
 * GalleryView). Lève une AccessError (404/403) sinon, à laisser remonter à handleApiError.
 */
export async function requireClientCollectionAccess(
  gallerySlug: string
): Promise<{ gallery: Gallery; clientRef: string }> {
  const gallery = await prisma.gallery.findUnique({ where: { slug: gallerySlug } });
  if (!gallery) throw new AccessError("Galerie introuvable", 404);

  const access = await checkGalleryAccess(gallery);
  // asStudio=true (dashboard studio, y compris admin plateforme) est explicitement rejeté ici,
  // même si `granted` est true — c'est le garde-fou central de la confidentialité "jamais
  // visible côté studio" demandée par Adriel : contrairement à checkGalleryAccess, utilisé tel
  // quel par d'autres routes (ex. /api/remarks) où le studio a un accès légitime en lecture.
  if (!access.granted || access.asStudio) {
    throw new AccessError("Accès réservé au client de cette galerie", 403);
  }

  return { gallery, clientRef: access.clientRef || "anonymous" };
}

/** Liste les collections du visiteur courant pour une galerie, triées par position puis date
 * de création — avec le nombre de photos et une couverture pour l'affichage en cartes. */
export async function listClientCollections(
  galleryId: string,
  clientRef: string
): Promise<ClientCollectionSummary[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      title: string;
      position: number;
      createdAt: Date;
      updatedAt: Date;
      photoCount: bigint;
      coverPhotoId: string | null;
    }[]
  >`
    SELECT
      cc."id",
      cc."title",
      cc."position",
      cc."createdAt",
      cc."updatedAt",
      COUNT(ccp."id") AS "photoCount",
      (
        SELECT ccp2."photoId" FROM "ClientCollectionPhoto" ccp2
        WHERE ccp2."clientCollectionId" = cc."id"
        ORDER BY ccp2."addedAt" ASC
        LIMIT 1
      ) AS "coverPhotoId"
    FROM "ClientCollection" cc
    LEFT JOIN "ClientCollectionPhoto" ccp ON ccp."clientCollectionId" = cc."id"
    WHERE cc."galleryId" = ${galleryId} AND cc."clientRef" = ${clientRef}
    GROUP BY cc."id"
    ORDER BY cc."position" ASC, cc."createdAt" ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    position: r.position,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    photoCount: Number(r.photoCount),
    coverPhotoId: r.coverPhotoId,
  }));
}

/** Une collection précise appartenant au visiteur courant, ou `null` si elle n'existe pas ou
 * appartient à quelqu'un d'autre (jamais d'exception ici : laisse l'appelant renvoyer 404). */
export async function getOwnedClientCollection(galleryId: string, clientRef: string, id: string) {
  const rows = await prisma.$queryRaw<
    { id: string; title: string; position: number; createdAt: Date; updatedAt: Date }[]
  >`
    SELECT "id", "title", "position", "createdAt", "updatedAt" FROM "ClientCollection"
    WHERE "id" = ${id} AND "galleryId" = ${galleryId} AND "clientRef" = ${clientRef}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Photos d'une collection (déjà vérifiée appartenir au visiteur courant par l'appelant),
 * triées par date d'ajout. */
export async function listClientCollectionPhotos(
  clientCollectionId: string
): Promise<ClientCollectionPhotoDTO[]> {
  return prisma.$queryRaw<ClientCollectionPhotoDTO[]>`
    SELECT p."id" AS "photoId", p."filename", p."width", p."height", p."updatedAt", ccp."addedAt"
    FROM "ClientCollectionPhoto" ccp
    JOIN "Photo" p ON p."id" = ccp."photoId"
    WHERE ccp."clientCollectionId" = ${clientCollectionId}
    ORDER BY ccp."addedAt" ASC
  `;
}

export async function createClientCollection(galleryId: string, clientRef: string, title: string) {
  const id = randomUUID();
  const maxRows = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX("position") AS "max" FROM "ClientCollection"
    WHERE "galleryId" = ${galleryId} AND "clientRef" = ${clientRef}
  `;
  const position = (maxRows[0]?.max ?? -1) + 1;
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "ClientCollection" ("id", "galleryId", "clientRef", "title", "position", "createdAt", "updatedAt")
    VALUES (${id}, ${galleryId}, ${clientRef}, ${title}, ${position}, NOW(), NOW())
  `;
  return { id, galleryId, clientRef, title, position, createdAt: now, updatedAt: now };
}

/** Renomme une collection du visiteur courant — renvoie `false` sans rien modifier si elle
 * n'existe pas ou n'appartient pas à ce visiteur. */
export async function renameClientCollection(
  galleryId: string,
  clientRef: string,
  id: string,
  title: string
): Promise<boolean> {
  const affected = await prisma.$executeRaw`
    UPDATE "ClientCollection" SET "title" = ${title}, "updatedAt" = NOW()
    WHERE "id" = ${id} AND "galleryId" = ${galleryId} AND "clientRef" = ${clientRef}
  `;
  return affected > 0;
}

/** Supprime une collection (et son contenu) du visiteur courant — renvoie `false` sans rien
 * modifier si elle n'existe pas ou n'appartient pas à ce visiteur. Suppression manuelle des
 * lignes ClientCollectionPhoto d'abord : le ON DELETE CASCADE déclaré dans schema.prisma ne
 * sera réellement actif en base qu'après le prochain `prisma db push` d'Adriel (voir la
 * limitation documentée sur ces deux modèles). */
export async function deleteClientCollection(galleryId: string, clientRef: string, id: string): Promise<boolean> {
  const owned = await getOwnedClientCollection(galleryId, clientRef, id);
  if (!owned) return false;
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "ClientCollectionPhoto" WHERE "clientCollectionId" = ${id}`,
    prisma.$executeRaw`DELETE FROM "ClientCollection" WHERE "id" = ${id}`,
  ]);
  return true;
}

/** Ajoute une ou plusieurs photos à une collection déjà vérifiée comme appartenant au visiteur
 * courant par l'appelant — idempotent (ON CONFLICT DO NOTHING, voir @@unique sur
 * ClientCollectionPhoto : une photo déjà présente n'est pas dupliquée). */
export async function addPhotosToClientCollection(clientCollectionId: string, photoIds: string[]) {
  for (const photoId of photoIds) {
    await prisma.$executeRaw`
      INSERT INTO "ClientCollectionPhoto" ("id", "clientCollectionId", "photoId", "addedAt")
      VALUES (${randomUUID()}, ${clientCollectionId}, ${photoId}, NOW())
      ON CONFLICT ("clientCollectionId", "photoId") DO NOTHING
    `;
  }
}

export async function removePhotoFromClientCollection(clientCollectionId: string, photoId: string) {
  await prisma.$executeRaw`
    DELETE FROM "ClientCollectionPhoto" WHERE "clientCollectionId" = ${clientCollectionId} AND "photoId" = ${photoId}
  `;
}
