import { prisma } from "@/lib/prisma";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingBlockRenderer } from "@/components/marketing/MarketingBlockRenderer";
import { PortfolioCard, type PortfolioGalleryItem } from "@/components/public-site/PortfolioCard";
import { getPageBlocksSplit } from "@/lib/marketingBlocksQuery";
import { firstBlockIsFullBleedHero } from "@/lib/marketingBlocks";

export const dynamic = "force-dynamic";

export const metadata = { title: "Exemples — pixleh" };

// 4 lignes x 3 colonnes sur desktop.
const EXAMPLE_COUNT = 12;

/**
 * Vitrine pixleh : les dernières galeries publiées par de VRAIS studios utilisant pixleh,
 * pas des maquettes. On ne montre que celles explicitement marquées visibles en portfolio
 * (même règle que /s/[studioSlug]/portfolio, voir SetVisibility.PORTFOLIO) — jamais une
 * galerie client privée qu'un studio n'a pas choisi d'exposer publiquement.
 */
export default async function ExemplesPage() {
  const { before, own, after } = await getPageBlocksSplit("EXEMPLES");

  const visibilityOr = [
    { collections: { some: { visibility: { has: "PORTFOLIO" as const } } } },
    { collections: { none: {} }, defaultVisibility: { has: "PORTFOLIO" as const } },
  ];

  const galleries = await prisma.gallery.findMany({
    where: { status: "PUBLISHED" as const, OR: visibilityOr },
    orderBy: { createdAt: "desc" },
    take: EXAMPLE_COUNT,
    include: {
      studio: { select: { name: true, slug: true } },
      photos: { orderBy: { position: "asc" }, select: { id: true, updatedAt: true } },
    },
  });

  const items: PortfolioGalleryItem[] = galleries.map((gallery) => {
    const cover = gallery.photos.find((p) => p.id === gallery.coverPhotoId) || gallery.photos[0];
    return {
      id: gallery.id,
      slug: gallery.slug,
      title: gallery.title,
      categoryTag: gallery.categoryTag,
      eventDate: gallery.eventDate ? gallery.eventDate.toISOString() : null,
      studioName: gallery.studio.name,
      studioSlug: gallery.studio.slug,
      coverUrl: cover
        ? `/api/files/studios/${gallery.studioId}/galleries/${gallery.id}/${cover.id}/thumb.jpg?v=${cover.updatedAt.getTime()}`
        : null,
    };
  });

  return (
    <main>
      <MarketingHeader transparent={firstBlockIsFullBleedHero([...before, ...own])} />

      {before.map((block) => (
        <MarketingBlockRenderer key={block.id} block={block} />
      ))}

      {own.map((block) => (
        <MarketingBlockRenderer key={block.id} block={block} />
      ))}

      <section className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-12 px-6 py-16 sm:grid-cols-3">
        {items.map((gallery) => (
          <PortfolioCard key={gallery.id} gallery={gallery} />
        ))}
        {items.length === 0 && (
          <p className="col-span-full text-center text-sm text-gray-500">
            Pas encore de galerie publiée en portfolio — revenez bientôt.
          </p>
        )}
      </section>

      {after.map((block) => (
        <MarketingBlockRenderer key={block.id} block={block} />
      ))}

      <MarketingFooter />
    </main>
  );
}
