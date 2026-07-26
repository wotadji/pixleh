import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingBlockRenderer } from "@/components/marketing/MarketingBlockRenderer";
import { getPageBlocks } from "@/lib/marketingBlocksQuery";
import { firstBlockIsFullBleedHero } from "@/lib/marketingBlocks";

export const dynamic = "force-dynamic";

export const metadata = { title: "À propos — pixleh" };

export default async function AProposPage() {
  const blocks = await getPageBlocks("A_PROPOS");

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
