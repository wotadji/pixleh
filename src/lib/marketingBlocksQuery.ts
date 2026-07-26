import { prisma } from "@/lib/prisma";
import type { MarketingBlockDTO, MarketingPageKey } from "@/lib/marketingBlocks";

export interface SplitPageBlocks {
  /** Blocs Accueil partagés à afficher avant tout le reste de la page. */
  before: MarketingBlockDTO[];
  /** Blocs propres à cette page (jamais partagés). */
  own: MarketingBlockDTO[];
  /** Blocs Accueil partagés à afficher après tout le reste de la page — y compris après le
   * contenu codé en dur de la page (grille de plans sur Tarifs, grille de galeries sur
   * Exemples), pas seulement après les MarketingBlock de cette page. */
  after: MarketingBlockDTO[];
}

/**
 * Charge les blocs actifs d'une page, séparés en 3 groupes (avant / propres / après) pour
 * que chaque page puisse insérer son éventuel contenu codé en dur (grille de plans sur
 * Tarifs, grille de galeries sur Exemples) exactement entre les deux — sinon un bloc marqué
 * "en dessous" se retrouverait avant ce contenu-là plutôt qu'en bas de la page réelle.
 *
 * Les blocs "avant/après" viennent des blocs Accueil explicitement marqués "Afficher aussi
 * sur Exemples/Tarifs/À propos" (data.sharedAcrossPages === true, coché depuis /admin/site).
 * `data.sharedPosition` ("before" | "after", "after" par défaut) contrôle le groupe.
 */
export async function getPageBlocksSplit(page: MarketingPageKey): Promise<SplitPageBlocks> {
  const own = (await prisma.marketingBlock.findMany({
    where: { page, active: true },
    orderBy: { position: "asc" },
  })) as unknown as MarketingBlockDTO[];

  if (page === "HOME") {
    return { before: [], own, after: [] };
  }

  const homeBlocks = await prisma.marketingBlock.findMany({
    where: { page: "HOME", active: true },
    orderBy: { position: "asc" },
  });
  const shared = homeBlocks.filter((b) => (b.data as { sharedAcrossPages?: boolean })?.sharedAcrossPages === true);
  const before = shared.filter(
    (b) => (b.data as { sharedPosition?: string })?.sharedPosition === "before"
  ) as unknown as MarketingBlockDTO[];
  const after = shared.filter(
    (b) => (b.data as { sharedPosition?: string })?.sharedPosition !== "before"
  ) as unknown as MarketingBlockDTO[];

  return { before, own, after };
}

/** Version "à plat" de getPageBlocksSplit, pour les pages qui n'ont aucun contenu codé en
 * dur entre les blocs (Accueil, À propos) — équivalent à before + own + after concaténés. */
export async function getPageBlocks(page: MarketingPageKey): Promise<MarketingBlockDTO[]> {
  const { before, own, after } = await getPageBlocksSplit(page);
  return [...before, ...own, ...after];
}
