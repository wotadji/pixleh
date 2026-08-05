import { prisma } from "@/lib/prisma";

/**
 * Un Client a-t-il un accès secondaire en lecture seule à cette galerie (voir modèle
 * GalleryClientAccess, chantier "plusieurs clients par galerie", 05/08/2026) ? Utilisé en
 * complément du check historique `gallery.client?.email === session.email` (client PRINCIPAL)
 * partout où l'espace client (/client/...) vérifie l'appartenance d'une galerie — voir
 * galleries/[id]/page.tsx et galleries/[id]/view/route.ts.
 *
 * $queryRaw plutôt qu'une relation Prisma typée : ce modèle est trop récent pour le Prisma
 * Client généré du sandbox (même limitation que Gallery.publishedAt, voir schema.prisma) tant
 * qu'Adriel n'a pas relancé `prisma generate && prisma db push` en local.
 */
export async function hasAdditionalGalleryAccess(galleryId: string, email: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "GalleryClientAccess" gca
      JOIN "Client" c ON c.id = gca."clientId"
      WHERE gca."galleryId" = ${galleryId} AND c.email = ${email}
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}
