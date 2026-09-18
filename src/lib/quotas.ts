import { prisma } from "@/lib/prisma";
import { AccessError } from "@/lib/access";

const GB = 1024 ** 3;
/** Seuil d'alerte "pensez à passer à un forfait supérieur" — 80%, demandé par Adriel. */
const NEAR_LIMIT_PCT = 80;

export interface QuotaStatus {
  planName: string | null;
  storageUsedBytes: number;
  /** null = stockage illimité (pas de blocage possible). */
  storageLimitGB: number | null;
  /** null si illimité. */
  storagePct: number | null;
  storageNearLimit: boolean;
  storageExceeded: boolean;
  galleryCount: number;
  /** null = galeries illimitées. */
  galleryLimit: number | null;
  /** null si illimité. */
  galleryPct: number | null;
  galleryNearLimit: boolean;
  galleryExceeded: boolean;
}

/**
 * [S2] Tâche #127 — Calcule l'usage courant d'un studio par rapport aux limites de SON plan
 * (`Plan.storageLimitGB` / `Plan.galleryLimit`, configurables par Adriel dans /admin/plans —
 * aucune limite codée en dur ici, donc le check s'applique de la même façon à tous les
 * forfaits, pas seulement au gratuit). Utilisé à la fois pour :
 * - bloquer côté API un upload ou une création de galerie qui dépasserait le quota (voir
 *   assertStorageQuota / assertGalleryQuota ci-dessous) ;
 * - afficher l'usage (Vue d'ensemble) et déclencher l'alerte à 80% (QuotaAlertBanner, montée
 *   globalement dans dashboard/layout.tsx).
 *
 * Un studio sans plan assigné (cas résiduel — depuis la tâche #176 le plan gratuit est
 * attribué automatiquement à l'inscription, donc planId ne devrait normalement plus jamais
 * être null) est traité SANS limite plutôt que bloqué : mieux vaut ne rien casser pour un
 * studio existant que de le couper par accident sur un cas qui ne devrait pas arriver.
 */
export async function getQuotaStatus(studioId: string): Promise<QuotaStatus> {
  const [studio, galleryCount, photoSizeAgg, videoSizeAgg, rawFileSizeAgg, quickTransferSizeAgg] = await Promise.all([
    prisma.studio.findUnique({ where: { id: studioId }, include: { plan: true } }),
    prisma.gallery.count({ where: { studioId } }),
    prisma.photo.aggregate({ where: { gallery: { studioId } }, _sum: { sizeBytes: true } }),
    prisma.video.aggregate({ where: { gallery: { studioId } }, _sum: { sizeBytes: true } }),
    // GalleryRawFile (18/09/2026, fichiers RAW) : $queryRaw plutôt que l'API Prisma typée —
    // modèle trop récent pour le Prisma Client généré du sandbox (voir son commentaire dans
    // schema.prisma). Même quota que photos/vidéos (choix d'Adriel le 18/09/2026 : "même
    // quota que les photos/galeries").
    prisma.$queryRaw<{ sum: bigint | null }[]>`
      SELECT SUM("sizeBytes") AS sum FROM "GalleryRawFile"
      WHERE "galleryId" IN (SELECT "id" FROM "Gallery" WHERE "studioId" = ${studioId})
    `,
    // QuickTransferFile (18/09/2026, Transfert rapide) : même logique — les fichiers d'un
    // transfert ne sont jamais supprimés automatiquement (même gelé), ils continuent donc à
    // occuper de l'espace et doivent compter dans le quota comme n'importe quel autre fichier.
    prisma.$queryRaw<{ sum: bigint | null }[]>`
      SELECT SUM("sizeBytes") AS sum FROM "QuickTransferFile"
      WHERE "transferId" IN (SELECT "id" FROM "QuickTransfer" WHERE "studioId" = ${studioId})
    `,
  ]);

  const plan = studio?.plan ?? null;
  const rawFileBytes = Number(rawFileSizeAgg[0]?.sum ?? 0);
  const quickTransferBytes = Number(quickTransferSizeAgg[0]?.sum ?? 0);
  const storageUsedBytes =
    (photoSizeAgg._sum.sizeBytes || 0) +
    (videoSizeAgg._sum.sizeBytes || 0) +
    rawFileBytes +
    quickTransferBytes;
  const storageLimitGB = plan?.storageLimitGB ?? null;
  const storagePct = storageLimitGB ? (storageUsedBytes / (storageLimitGB * GB)) * 100 : null;

  const galleryLimit = plan?.galleryLimit ?? null;
  const galleryPct = galleryLimit ? (galleryCount / galleryLimit) * 100 : null;

  return {
    planName: plan?.name ?? null,
    storageUsedBytes,
    storageLimitGB,
    storagePct,
    storageNearLimit: storagePct !== null && storagePct >= NEAR_LIMIT_PCT,
    storageExceeded: storagePct !== null && storagePct >= 100,
    galleryCount,
    galleryLimit,
    galleryPct,
    galleryNearLimit: galleryPct !== null && galleryPct >= NEAR_LIMIT_PCT,
    galleryExceeded: galleryPct !== null && galleryPct >= 100,
  };
}

/**
 * Lève une AccessError (403) si ajouter `additionalBytes` au stockage du studio dépasserait
 * la limite de son plan. Appelée avant de stocker un fichier (photo ou vidéo) — voir
 * /api/galleries/[id]/photos et /api/galleries/[id]/videos/upload.
 */
export async function assertStorageQuota(studioId: string, additionalBytes: number, quota?: QuotaStatus) {
  const q = quota ?? (await getQuotaStatus(studioId));
  if (q.storageLimitGB === null) return;
  const limitBytes = q.storageLimitGB * GB;
  if (q.storageUsedBytes + additionalBytes > limitBytes) {
    throw new AccessError(
      `Quota de stockage atteint (${q.storageLimitGB} Go) — passez à un forfait supérieur pour continuer.`,
      403
    );
  }
}

/**
 * Lève une AccessError (403) si le studio est déjà au nombre maximal de galeries autorisé
 * par son plan. Appelée avant la création d'une galerie — voir POST /api/galleries.
 */
export async function assertGalleryQuota(studioId: string) {
  const q = await getQuotaStatus(studioId);
  if (q.galleryLimit === null) return;
  if (q.galleryCount >= q.galleryLimit) {
    throw new AccessError(
      `Limite de ${q.galleryLimit} galerie(s) atteinte pour votre forfait — passez à un forfait supérieur pour en créer davantage.`,
      403
    );
  }
}
