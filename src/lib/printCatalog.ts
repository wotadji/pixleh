import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Catalogue impression plateforme (chantier "impression pixleh/Prodigi", 31/07/2026) — des
 * lignes du modèle Prisma `Product` avec `studioId = NULL` et `platformManaged = true`, gérées
 * uniquement depuis /admin/print-catalog (jamais par un studio). Voir schema.prisma pour la
 * doc des champs.
 *
 * `studioId` nullable et les colonnes `platformManaged`/`wholesaleCostCents` n'existent pas
 * encore dans le Prisma Client généré du sandbox (voir tâche #254, `prisma generate && prisma
 * db push` toujours en attente côté Adriel) — lues/écrites ici via $queryRaw/$executeRaw,
 * même workaround que studioVat.ts, studioBankDetails.ts, etc. IMPORTANT : tant qu'Adriel n'a
 * pas fait cette migration, la colonne "studioId" est encore NOT NULL en base — créer une
 * ligne de catalogue échouera avec une erreur de contrainte SQL jusqu'à ce que ce soit fait.
 */

export interface PrintCatalogItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  /** SKU Prodigi (champ `sku` générique du modèle Product, réutilisé ici). */
  sku: string | null;
  imageUrl: string | null;
  active: boolean;
  wholesaleCostCents: number | null;
  createdAt: Date;
}

export async function listPrintCatalog(): Promise<PrintCatalogItem[]> {
  return prisma.$queryRaw<PrintCatalogItem[]>`
    SELECT "id", "name", "description", "priceCents", "currency", "sku", "imageUrl", "active",
           "wholesaleCostCents", "createdAt"
    FROM "Product"
    WHERE "platformManaged" = true
    ORDER BY "createdAt" DESC
  `;
}

/** Uniquement les lignes actives — utilisé par le parcours d'achat client (galerie publique). */
export async function getActivePrintCatalog(): Promise<PrintCatalogItem[]> {
  return prisma.$queryRaw<PrintCatalogItem[]>`
    SELECT "id", "name", "description", "priceCents", "currency", "sku", "imageUrl", "active",
           "wholesaleCostCents", "createdAt"
    FROM "Product"
    WHERE "platformManaged" = true AND "active" = true
  `;
}

/** Utilisé par le checkout (/api/cart/checkout) pour valider/tarifer les lignes du panier qui
 * pointent vers un produit du catalogue plateforme plutôt qu'un Product du studio. */
export async function getActivePrintCatalogItemsByIds(ids: string[]): Promise<PrintCatalogItem[]> {
  if (ids.length === 0) return [];
  return prisma.$queryRaw<PrintCatalogItem[]>`
    SELECT "id", "name", "description", "priceCents", "currency", "sku", "imageUrl", "active",
           "wholesaleCostCents", "createdAt"
    FROM "Product"
    WHERE "platformManaged" = true AND "active" = true AND "id" IN (${Prisma.join(ids)})
  `;
}

export async function getPrintCatalogItem(id: string): Promise<PrintCatalogItem | null> {
  const [row] = await prisma.$queryRaw<PrintCatalogItem[]>`
    SELECT "id", "name", "description", "priceCents", "currency", "sku", "imageUrl", "active",
           "wholesaleCostCents", "createdAt"
    FROM "Product"
    WHERE "id" = ${id} AND "platformManaged" = true
  `;
  return row ?? null;
}

export async function createPrintCatalogItem(data: {
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  sku: string | null;
  imageUrl: string | null;
  active: boolean;
  wholesaleCostCents: number | null;
}): Promise<PrintCatalogItem> {
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "Product"
      ("id", "studioId", "type", "name", "description", "priceCents", "currency", "sku",
       "imageUrl", "active", "platformManaged", "wholesaleCostCents", "createdAt")
    VALUES
      (${id}, NULL, 'PRINT', ${data.name}, ${data.description}, ${data.priceCents},
       ${data.currency}, ${data.sku}, ${data.imageUrl}, ${data.active}, true,
       ${data.wholesaleCostCents}, NOW())
  `;
  const created = await getPrintCatalogItem(id);
  if (!created) throw new Error("Échec de la création du produit catalogue.");
  return created;
}

export async function updatePrintCatalogItem(
  id: string,
  data: Partial<{
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    sku: string | null;
    imageUrl: string | null;
    active: boolean;
    wholesaleCostCents: number | null;
  }>
): Promise<PrintCatalogItem | null> {
  const existing = await getPrintCatalogItem(id);
  if (!existing) return null;

  const merged = { ...existing, ...data };
  await prisma.$executeRaw`
    UPDATE "Product"
    SET "name" = ${merged.name},
        "description" = ${merged.description},
        "priceCents" = ${merged.priceCents},
        "currency" = ${merged.currency},
        "sku" = ${merged.sku},
        "imageUrl" = ${merged.imageUrl},
        "active" = ${merged.active},
        "wholesaleCostCents" = ${merged.wholesaleCostCents}
    WHERE "id" = ${id} AND "platformManaged" = true
  `;
  return getPrintCatalogItem(id);
}

/**
 * Nombre de références à ce produit catalogue dans des commandes/sélections existantes — même
 * garde-fou que la suppression d'un Plan (voir DELETE /api/admin/plans/[id]) : on bloque la
 * suppression plutôt que de casser l'historique des commandes déjà passées, en invitant à
 * désactiver (`active: false`) à la place.
 */
export async function countPrintCatalogItemUsage(id: string): Promise<number> {
  const [orderItems, selections] = await Promise.all([
    prisma.orderItem.count({ where: { productId: id } }),
    prisma.selection.count({ where: { productId: id } }),
  ]);
  return orderItems + selections;
}

export async function deletePrintCatalogItem(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "Product" WHERE "id" = ${id} AND "platformManaged" = true`;
}
