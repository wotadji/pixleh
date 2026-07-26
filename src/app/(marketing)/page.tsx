import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingBlockRenderer } from "@/components/marketing/MarketingBlockRenderer";
import { getPageBlocks } from "@/lib/marketingBlocksQuery";
import { firstBlockIsFullBleedHero } from "@/lib/marketingBlocks";

export const dynamic = "force-dynamic";

/**
 * Page d'accueil entièrement composée de blocs éditables depuis /admin/site (voir modèle
 * MarketingBlock) — plus aucun contenu codé en dur ici, contrairement aux versions
 * précédentes de cette page.
 */
export default async function MarketingHome() {
  const blocks = await getPageBlocks("HOME");

  return (
    <main>
      <MarketingHeader transparent={firstBlockIsFullBleedHero(blocks)} />
      {blocks.map((block) => (
        <MarketingBlockRenderer key={block.id} block={block} />
      ))}
      <MarketingFooter />
    </main>
  );
}
