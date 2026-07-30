import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PortfolioCard, type PortfolioGalleryItem } from "@/components/public-site/PortfolioCard";

export const dynamic = "force-dynamic";

// 2 lignes x 4 colonnes sur desktop (voir la grille plus bas) = 8 galeries par page.
const PAGE_SIZE = 8;

/**
 * Page "Portfolio" complète du site public d'un studio : toutes les galeries visibles en
 * portfolio (voir la même règle que la page d'accueil — set marqué "Portfolio", ou
 * visibilité par défaut de la galerie tant qu'aucun set n'existe), avec filtre par tag et
 * pagination — contrairement à l'aperçu de la page d'accueil (3 galeries + bouton "Voir
 * le portfolio complet" qui mène ici). Filtre et pagination sont pilotés par l'URL
 * (?tag=...&page=...) plutôt que par du state client, pour que les deux fonctionnent
 * correctement ensemble (changer de tag revient toujours à la page 1, etc.) sans JS.
 */
export default async function StudioPortfolioPage({
  params,
  searchParams,
}: {
  params: { studioSlug: string };
  searchParams: { page?: string; tag?: string };
}) {
  const studio = await prisma.studio.findUnique({ where: { slug: params.studioSlug } });
  if (!studio) notFound();

  const activeTag = searchParams.tag && searchParams.tag !== "ALL" ? searchParams.tag : null;
  const page = Math.max(1, Number(searchParams.page) || 1);

  // Même règle de visibilité que la page d'accueil (voir page.tsx du dossier parent) :
  // un set marqué "Portfolio", ou — tant qu'aucun set n'existe dans la galerie — la
  // visibilité par défaut choisie à la création (Gallery.defaultVisibility).
  const visibilityOr = [
    { collections: { some: { visibility: { has: "PORTFOLIO" as const } } } },
    { collections: { none: {} }, defaultVisibility: { has: "PORTFOLIO" as const } },
  ];

  const where = {
    studioId: studio.id,
    status: "PUBLISHED" as const,
    OR: visibilityOr,
    ...(activeTag && { categoryTag: activeTag }),
  };

  const [total, galleries, tagRows] = await Promise.all([
    prisma.gallery.count({ where }),
    prisma.gallery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        photos: { orderBy: { position: "asc" }, select: { id: true, updatedAt: true } },
      },
    }),
    // Liste des tags pour la barre de filtre : sur TOUTES les galeries portfolio du
    // studio (pas seulement la page courante), sans quoi certains tags disparaîtraient
    // du menu selon la page affichée.
    prisma.gallery.findMany({
      where: { studioId: studio.id, status: "PUBLISHED", OR: visibilityOr, categoryTag: { not: null } },
      select: { categoryTag: true },
      distinct: ["categoryTag"],
    }),
  ]);

  const tags = tagRows
    .map((r) => r.categoryTag)
    .filter((t): t is string => !!t && t.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const items: PortfolioGalleryItem[] = galleries.map((gallery) => {
    const cover = gallery.photos.find((p) => p.id === gallery.coverPhotoId) || gallery.photos[0];
    return {
      id: gallery.id,
      slug: gallery.slug,
      title: gallery.title,
      categoryTag: gallery.categoryTag,
      eventDate: gallery.eventDate ? gallery.eventDate.toISOString() : null,
      studioSlug: studio.slug,
      coverUrl: cover
        ? `/api/files/studios/${studio.id}/galleries/${gallery.id}/${cover.id}/thumb.jpg?v=${cover.updatedAt.getTime()}`
        : null,
    };
  });

  const studioSlug = studio.slug;
  function pageHref(targetPage: number, tag: string | null) {
    const sp = new URLSearchParams();
    if (tag) sp.set("tag", tag);
    if (targetPage > 1) sp.set("page", String(targetPage));
    const qs = sp.toString();
    return `/s/${studioSlug}/portfolio${qs ? `?${qs}` : ""}`;
  }

  return (
    <div>
      <section className="mx-auto max-w-4xl px-6 pt-16 text-center">
        <h1 className="font-serif text-3xl font-bold sm:text-4xl">Portfolio</h1>
      </section>

      {tags.length > 0 && (
        <div className="mx-auto max-w-4xl px-6 pb-10 pt-8">
          <div className="mx-auto mb-8 h-px w-16 bg-gray-200" />
          <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm tracking-widest">
            <Link
              href={pageHref(1, null)}
              className={`pb-1 uppercase transition-colors ${
                !activeTag ? "border-b border-gray-900 text-gray-900" : "text-gray-400 hover:text-gray-700"
              }`}
            >
              All
            </Link>
            {tags.map((tag) => (
              <Link
                key={tag}
                href={pageHref(1, tag)}
                className={`pb-1 uppercase transition-colors ${
                  activeTag === tag ? "border-b border-gray-900 text-gray-900" : "text-gray-400 hover:text-gray-700"
                }`}
              >
                {tag}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <section
        className={`mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-12 px-6 pb-10 sm:grid-cols-3 lg:grid-cols-4 ${
          tags.length > 0 ? "" : "pt-10"
        }`}
      >
        {items.map((gallery) => (
          <PortfolioCard key={gallery.id} gallery={gallery} />
        ))}
        {items.length === 0 && (
          <p className="col-span-full text-center text-sm text-gray-500">
            Aucune galerie publiée pour le moment.
          </p>
        )}
      </section>

      {totalPages > 1 && (
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 px-6 pb-20">
          <Link
            href={pageHref(page - 1, activeTag)}
            aria-disabled={page <= 1}
            tabIndex={page <= 1 ? -1 : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              page <= 1
                ? "pointer-events-none border-gray-100 text-gray-300"
                : "border-gray-200 text-gray-600 hover:border-gray-400"
            }`}
          >
            ← Précédent
          </Link>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={pageHref(p, activeTag)}
              aria-current={p === page ? "page" : undefined}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors ${
                p === page ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {p}
            </Link>
          ))}
          <Link
            href={pageHref(page + 1, activeTag)}
            aria-disabled={page >= totalPages}
            tabIndex={page >= totalPages ? -1 : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              page >= totalPages
                ? "pointer-events-none border-gray-100 text-gray-300"
                : "border-gray-200 text-gray-600 hover:border-gray-400"
            }`}
          >
            Suivant →
          </Link>
        </nav>
      )}
    </div>
  );
}
