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
  /** SKU Prodigi (champ `sku` générique du modèle Product, réutilisé ici). null sur un GROUPE
   * (voir isProductGroup) : le groupe lui-même n'a pas de SKU, seules ses variantes en ont un. */
  sku: string | null;
  imageUrl: string | null;
  active: boolean;
  wholesaleCostCents: number | null;
  /** Attributs sélectionnables du SKU (JSON string, ex: {"wrap":["Black","White"]}) — voir
   * getProdigiProductDetails. null = aucun attribut sélectionnable connu pour ce SKU. */
  prodigiAttributeOptions: string | null;
  /** true = ce produit est un GROUPE (conteneur de variantes de taille/format) — voir
   * schema.prisma. Chantier "groupe de produits" (02/08/2026, demande d'Adriel). */
  isProductGroup: boolean;
  /** Non-null uniquement sur une variante : id du Product groupe parent. */
  groupId: string | null;
  /** Ordre d'affichage manuel — voir schema.prisma. Comparé séparément par "niveau" (lignes
   * racine entre elles, variantes d'un même groupe entre elles), jamais mélangé entre niveaux. */
  sortOrder: number;
  createdAt: Date;
}

const SELECT_COLUMNS = `"id", "name", "description", "priceCents", "currency", "sku", "imageUrl",
       "active", "wholesaleCostCents", "prodigiAttributeOptions", "isProductGroup", "groupId",
       "sortOrder", "createdAt"`;

export async function listPrintCatalog(): Promise<PrintCatalogItem[]> {
  return prisma.$queryRaw<PrintCatalogItem[]>`
    SELECT ${Prisma.raw(SELECT_COLUMNS)}
    FROM "Product"
    WHERE "platformManaged" = true
    ORDER BY "sortOrder" ASC, "createdAt" DESC
  `;
}

/** Uniquement les lignes actives — utilisé par le parcours d'achat client (galerie publique).
 * Exclut les VARIANTES (groupId non-null, voir isProductGroup dans schema.prisma) : elles ne
 * sont jamais proposées seules, uniquement via le choix de taille sous leur groupe parent (voir
 * getPrintCatalogVariants, appelé séparément par la page qui sait afficher ce choix). */
export async function getActivePrintCatalog(): Promise<PrintCatalogItem[]> {
  return prisma.$queryRaw<PrintCatalogItem[]>`
    SELECT ${Prisma.raw(SELECT_COLUMNS)}
    FROM "Product"
    WHERE "platformManaged" = true AND "active" = true AND "groupId" IS NULL
    ORDER BY "sortOrder" ASC, "createdAt" DESC
  `;
}

/** Variantes actives d'un ou plusieurs groupes (Product.groupId) — chantier "groupe de
 * produits" (02/08/2026, demande d'Adriel). Utilisé par la page /print-selection pour proposer
 * le choix de taille/SKU sous chaque produit-groupe, sans jamais lister les variantes comme des
 * produits autonomes (voir getActivePrintCatalog ci-dessus). Triées par sortOrder (classement
 * manuel, demande d'Adriel 01/08/2026 : "déplacer les groupe de produits pour classer par ordre
 * d'affichage [...] drill down") plutôt que par prix seul — l'admin choisit l'ordre des tailles
 * proposées au client, le prix ne servant que de repère secondaire (SKU jamais réordonné). */
export async function getPrintCatalogVariants(groupIds: string[]): Promise<PrintCatalogItem[]> {
  if (groupIds.length === 0) return [];
  return prisma.$queryRaw<PrintCatalogItem[]>`
    SELECT ${Prisma.raw(SELECT_COLUMNS)}
    FROM "Product"
    WHERE "platformManaged" = true AND "active" = true AND "groupId" IN (${Prisma.join(groupIds)})
    ORDER BY "sortOrder" ASC, "priceCents" ASC
  `;
}

/**
 * Réordonne les lignes d'un même "niveau" (soit toutes les lignes racine si parentGroupId est
 * null, soit les variantes d'un groupe précis) — chantier "réorganisation par glisser-déposer"
 * (01/08/2026, demande d'Adriel : "ajouter la possibilité de déplacer les groupe de produits
 * pour classer par ordre d'affichage (drill down par exemple)"). `orderedIds` est la liste
 * complète des ids de ce niveau, dans le nouvel ordre voulu : chaque id reçoit son index comme
 * sortOrder. Volontairement un simple set d'UPDATE en série plutôt qu'une transaction Prisma
 * classique (déjà en mode $queryRaw/$executeRaw partout ailleurs dans ce fichier, voir l'en-tête
 * du fichier — colonne pas encore dans le Prisma Client généré du sandbox).
 */
export async function reorderPrintCatalogItems(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.$executeRaw`UPDATE "Product" SET "sortOrder" = ${index} WHERE "id" = ${id} AND "platformManaged" = true`
    )
  );
}

/** Utilisé par le checkout (/api/cart/checkout) pour valider/tarifer les lignes du panier qui
 * pointent vers un produit du catalogue plateforme plutôt qu'un Product du studio. */
export async function getActivePrintCatalogItemsByIds(ids: string[]): Promise<PrintCatalogItem[]> {
  if (ids.length === 0) return [];
  return prisma.$queryRaw<PrintCatalogItem[]>`
    SELECT ${Prisma.raw(SELECT_COLUMNS)}
    FROM "Product"
    WHERE "platformManaged" = true AND "active" = true AND "id" IN (${Prisma.join(ids)})
  `;
}

export async function getPrintCatalogItem(id: string): Promise<PrintCatalogItem | null> {
  const [row] = await prisma.$queryRaw<PrintCatalogItem[]>`
    SELECT ${Prisma.raw(SELECT_COLUMNS)}
    FROM "Product"
    WHERE "id" = ${id} AND "platformManaged" = true
  `;
  return row ?? null;
}

export async function createPrintCatalogItem(data: {
  /** Id explicite, généré côté client (voir printCatalogItemSchema) — permet d'uploader
   * l'image du produit avant sa création (POST /api/admin/print-catalog/[id]/image accepte un
   * id qui n'existe pas encore en base), en donnant au produit fraîchement créé le MÊME id que
   * celui déjà utilisé comme clé de stockage de l'image. Génère un id serveur par défaut si
   * absent, pour rester compatible avec tout appelant qui n'en fournit pas. */
  id?: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  sku: string | null;
  imageUrl: string | null;
  active: boolean;
  wholesaleCostCents: number | null;
  /** true = crée un GROUPE (conteneur) plutôt qu'un produit vendable — voir isProductGroup
   * dans schema.prisma. Chantier "groupe de produits" (02/08/2026, demande d'Adriel). */
  isProductGroup?: boolean;
  /** Id du groupe parent si ce produit est une VARIANTE (taille/SKU) à l'intérieur d'un groupe
   * existant — mutuellement exclusif avec isProductGroup (validé côté route API). */
  groupId?: string | null;
}): Promise<PrintCatalogItem> {
  const id = data.id || randomUUID();
  // Nouveau produit ajouté en fin de son "niveau" d'affichage (racine ou variantes du même
  // groupId) — voir reorderPrintCatalogItems ci-dessus pour le classement manuel ensuite.
  const groupId = data.groupId ?? null;
  const [siblingMax] = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX("sortOrder") as max FROM "Product"
    WHERE "platformManaged" = true AND ${groupId === null ? Prisma.sql`"groupId" IS NULL` : Prisma.sql`"groupId" = ${groupId}`}
  `;
  const sortOrder = (siblingMax?.max ?? -1) + 1;
  await prisma.$executeRaw`
    INSERT INTO "Product"
      ("id", "studioId", "type", "name", "description", "priceCents", "currency", "sku",
       "imageUrl", "active", "platformManaged", "wholesaleCostCents", "isProductGroup", "groupId",
       "sortOrder", "createdAt")
    VALUES
      (${id}, NULL, 'PRINT', ${data.name}, ${data.description}, ${data.priceCents},
       ${data.currency}, ${data.sku}, ${data.imageUrl}, ${data.active}, true,
       ${data.wholesaleCostCents}, ${data.isProductGroup ?? false}, ${groupId}, ${sortOrder}, NOW())
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
    prodigiAttributeOptions: string | null;
    isProductGroup: boolean;
    groupId: string | null;
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
        "wholesaleCostCents" = ${merged.wholesaleCostCents},
        "prodigiAttributeOptions" = ${merged.prodigiAttributeOptions},
        "isProductGroup" = ${merged.isProductGroup},
        "groupId" = ${merged.groupId}
    WHERE "id" = ${id} AND "platformManaged" = true
  `;
  return getPrintCatalogItem(id);
}

/** Nombre de variantes (SKU) encore rattachées à ce groupe — chantier "groupe de produits"
 * (02/08/2026, demande d'Adriel). Bloque la suppression d'un groupe qui contient encore des
 * variantes plutôt que de les supprimer en cascade silencieusement (ON DELETE CASCADE existe
 * au niveau base, mais l'admin doit les retirer/déplacer explicitement en premier). */
export async function countGroupVariants(groupId: string): Promise<number> {
  const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM "Product" WHERE "groupId" = ${groupId}
  `;
  return row ? Number(row.count) : 0;
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
