import { getStudioSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { OverviewStats } from "@/components/studio/OverviewStats";

export default async function DashboardOverview({
  searchParams,
}: {
  searchParams: { checkout?: string };
}) {
  const session = await getStudioSession();
  const studioId = session!.user.studioId;

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  // Nombre de mois à afficher sur les graphiques YTD (janvier → mois en cours inclus).
  const monthsSoFar = now.getMonth() + 1;

  const [
    galleryCount,
    clientCount,
    paidOrdersCount,
    upcomingBookings,
    studio,
    photoCount,
    videoCount,
    photoSizeAgg,
    videoSizeAgg,
    revenueOrders,
    revenueInvoices,
    photoDates,
    galleriesForCharts,
    photoSizeByGallery,
    videoSizeByGallery,
    likesByGallery,
    downloadsByGallery,
  ] = await Promise.all([
    prisma.gallery.count({ where: { studioId } }),
    prisma.client.count({ where: { studioId } }),
    prisma.order.count({ where: { studioId, status: "PAID" } }),
    prisma.booking.count({
      where: { studioId, startsAt: { gte: new Date() }, status: { not: "CANCELLED" } },
    }),
    prisma.studio.findUnique({ where: { id: studioId }, include: { plan: true } }),
    // Photo/Video n'ont pas de studioId direct — on passe par la relation gallery (voir
    // schema.prisma) pour rester valable même si un jour un studio a plusieurs galeries.
    prisma.photo.count({ where: { gallery: { studioId } } }),
    prisma.video.count({ where: { gallery: { studioId } } }),
    prisma.photo.aggregate({ where: { gallery: { studioId } }, _sum: { sizeBytes: true } }),
    prisma.video.aggregate({ where: { gallery: { studioId } }, _sum: { sizeBytes: true } }),
    prisma.order.findMany({
      where: { studioId, status: "PAID", createdAt: { gte: yearStart } },
      select: { totalCents: true, createdAt: true },
    }),
    prisma.invoice.findMany({
      where: { studioId, status: "PAID", paidAt: { gte: yearStart } },
      select: { totalCents: true, paidAt: true },
    }),
    prisma.photo.findMany({
      where: { gallery: { studioId }, createdAt: { gte: yearStart } },
      select: { createdAt: true },
    }),
    // Titres des galeries, pour légender les deux classements ci-dessous (espace occupé /
    // popularité) sans avoir à refaire une requête par galerie.
    prisma.gallery.findMany({ where: { studioId }, select: { id: true, title: true } }),
    prisma.photo.groupBy({ by: ["galleryId"], where: { gallery: { studioId } }, _sum: { sizeBytes: true } }),
    prisma.video.groupBy({ by: ["galleryId"], where: { gallery: { studioId } }, _sum: { sizeBytes: true } }),
    // "Like" = favori client (Selection.type === FAVORITE, voir schema.prisma) — pas de
    // modèle "Like" dédié dans le schéma.
    prisma.selection.groupBy({
      by: ["galleryId"],
      where: { gallery: { studioId }, type: "FAVORITE" },
      _count: { _all: true },
    }),
    prisma.downloadEvent.groupBy({ by: ["galleryId"], where: { gallery: { studioId } }, _count: { _all: true } }),
  ]);

  // Agrégation par mois (index 0 = janvier) faite ici plutôt qu'en SQL : les volumes d'un
  // seul studio restent modestes, et ça évite une requête groupBy par moteur de BDD.
  const revenueByMonth = Array.from({ length: monthsSoFar }, () => 0);
  for (const o of revenueOrders) revenueByMonth[o.createdAt.getMonth()] += o.totalCents;
  for (const inv of revenueInvoices) {
    if (inv.paidAt) revenueByMonth[inv.paidAt.getMonth()] += inv.totalCents;
  }

  const uploadsByMonth = Array.from({ length: monthsSoFar }, () => 0);
  for (const p of photoDates) uploadsByMonth[p.createdAt.getMonth()] += 1;

  const storageUsedBytes = (photoSizeAgg._sum.sizeBytes || 0) + (videoSizeAgg._sum.sizeBytes || 0);

  // Classement "Espace occupé par galerie" : fusion photos + vidéos par galerie, top 6.
  const galleryTitleMap = new Map(galleriesForCharts.map((g) => [g.id, g.title]));
  const bytesByGalleryId = new Map<string, number>();
  for (const row of photoSizeByGallery) {
    bytesByGalleryId.set(row.galleryId, (bytesByGalleryId.get(row.galleryId) || 0) + (row._sum.sizeBytes || 0));
  }
  for (const row of videoSizeByGallery) {
    bytesByGalleryId.set(row.galleryId, (bytesByGalleryId.get(row.galleryId) || 0) + (row._sum.sizeBytes || 0));
  }
  const storageByGallery = Array.from(bytesByGalleryId.entries())
    .map(([id, bytes]) => ({ id, title: galleryTitleMap.get(id) || "—", bytes }))
    .filter((g) => g.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 6);

  // Classement "Galeries les plus populaires" : favoris (Selection FAVORITE) + téléchargements
  // (DownloadEvent), fusionnés par galerie, top 6 par total.
  const likesByGalleryId = new Map(likesByGallery.map((r) => [r.galleryId, r._count._all]));
  const downloadsByGalleryId = new Map(downloadsByGallery.map((r) => [r.galleryId, r._count._all]));
  const engagedGalleryIds = new Set<string>([...likesByGalleryId.keys(), ...downloadsByGalleryId.keys()]);
  const popularGalleries = Array.from(engagedGalleryIds)
    .map((id) => ({
      id,
      title: galleryTitleMap.get(id) || "—",
      likes: likesByGalleryId.get(id) || 0,
      downloads: downloadsByGalleryId.get(id) || 0,
    }))
    .filter((g) => g.likes > 0 || g.downloads > 0)
    .sort((a, b) => b.likes + b.downloads - (a.likes + a.downloads))
    .slice(0, 6);

  return (
    <OverviewStats
      galleryCount={galleryCount}
      clientCount={clientCount}
      paidOrders={paidOrdersCount}
      upcomingBookings={upcomingBookings}
      plan={
        studio?.plan
          ? {
              name: studio.plan.name,
              isFree: studio.plan.isFree,
              priceMonthlyCents: studio.plan.priceMonthlyCents,
              priceAnnualCents: studio.plan.priceAnnualCents,
              storageLimitGB: studio.plan.storageLimitGB,
              galleryLimit: studio.plan.galleryLimit,
            }
          : null
      }
      billingInterval={studio?.billingInterval ?? "MONTHLY"}
      currentPeriodEnd={studio?.currentPeriodEnd ? studio.currentPeriodEnd.toISOString() : null}
      currency={studio?.currency || "EUR"}
      storageUsedBytes={storageUsedBytes}
      photoCount={photoCount}
      videoCount={videoCount}
      storageByGallery={storageByGallery}
      popularGalleries={popularGalleries}
      revenueByMonth={revenueByMonth}
      uploadsByMonth={uploadsByMonth}
      checkoutStatus={searchParams?.checkout}
    />
  );
}
